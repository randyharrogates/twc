import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { GroupSchema } from '../lib/schema';

/**
 * Dev-only Vite middleware exposing data/groups/*.json over HTTP so the
 * frontend can list, load, and save group files without bundling the
 * filesystem into the client.
 *
 * Routes:
 *   GET  /api/groups            → summary list
 *   GET  /api/groups/:id        → full group JSON
 *   PUT  /api/groups/:id        → validate + write (optimistic concurrency)
 *
 * Not registered in production; the app is a local dev tool.
 */
export function fsApiPlugin(): Plugin {
  return {
    name: 'twc-agent:fs-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      const dataRoot = resolve(server.config.root, 'data');
      const groupsDir = join(dataRoot, 'groups');
      if (!existsSync(groupsDir)) mkdirSync(groupsDir, { recursive: true });

      server.middlewares.use('/api/groups', async (req, res) => {
        try {
          const url = new URL(req.url ?? '/', 'http://local');
          const parts = url.pathname.split('/').filter(Boolean);

          if (req.method === 'GET' && parts.length === 0) {
            await handleList(groupsDir, res);
            return;
          }
          if (req.method === 'GET' && parts.length === 1) {
            await handleGet(groupsDir, parts[0], res);
            return;
          }
          if (req.method === 'PUT' && parts.length === 1) {
            await handlePut(groupsDir, parts[0], req, res);
            return;
          }
          sendJson(res, 404, { error: 'not found' });
        } catch (err) {
          sendJson(res, 500, { error: (err as Error).message });
        }
      });
    },
  };
}

async function handleList(groupsDir: string, res: ServerResponse) {
  const files = (await readdir(groupsDir)).filter((f) => f.endsWith('.json'));
  const out: Array<{ id: string; name: string; baseCurrency: string; version: number }> = [];
  for (const file of files) {
    const raw = await readFile(join(groupsDir, file), 'utf8');
    const parsed = GroupSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) continue;
    const g = parsed.data;
    out.push({ id: g.id, name: g.name, baseCurrency: g.baseCurrency, version: g.version });
  }
  sendJson(res, 200, out);
}

async function handleGet(groupsDir: string, id: string, res: ServerResponse) {
  const path = safePath(groupsDir, id);
  if (!path) return sendJson(res, 400, { error: 'invalid id' });
  if (!existsSync(path)) return sendJson(res, 404, { error: 'not found' });
  const raw = await readFile(path, 'utf8');
  const parsed = GroupSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    return sendJson(res, 422, { error: 'invalid group file', issues: parsed.error.issues });
  }
  sendJson(res, 200, parsed.data);
}

async function handlePut(
  groupsDir: string,
  id: string,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const path = safePath(groupsDir, id);
  if (!path) return sendJson(res, 400, { error: 'invalid id' });

  const body = await readBody(req);
  let incoming: unknown;
  try {
    incoming = JSON.parse(body);
  } catch {
    return sendJson(res, 400, { error: 'invalid json body' });
  }
  const parsed = GroupSchema.safeParse(incoming);
  if (!parsed.success) {
    return sendJson(res, 422, { error: 'schema validation failed', issues: parsed.error.issues });
  }
  const next = parsed.data;
  if (next.id !== id) {
    return sendJson(res, 400, { error: 'id in body does not match route' });
  }

  if (existsSync(path)) {
    const raw = await readFile(path, 'utf8');
    const current = GroupSchema.safeParse(JSON.parse(raw));
    if (current.success && current.data.version !== next.version - 1) {
      return sendJson(res, 409, {
        error: 'version conflict',
        expected: current.data.version + 1,
        got: next.version,
      });
    }
  }

  await writeFile(path, JSON.stringify(next, null, 2) + '\n', 'utf8');
  sendJson(res, 200, next);
}

function safePath(groupsDir: string, id: string): string | null {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  return join(groupsDir, `${id}.json`);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((res, rej) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.from(c)));
    req.on('end', () => res(Buffer.concat(chunks).toString('utf8')));
    req.on('error', rej);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}
