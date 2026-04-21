#!/usr/bin/env tsx
/**
 * Emit data/.schema/group.json from the Zod GroupSchema.
 * Claude Code reads this to know the exact shape of a group file.
 *
 * Usage: npm run schema
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { GroupSchema } from '../src/lib/schema';
import { toJsonSchema } from '../src/lib/jsonSchema';

const OUT = resolve(process.cwd(), 'data/.schema/group.json');

async function main() {
  const schema = toJsonSchema(GroupSchema);
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(schema, null, 2) + '\n', 'utf8');
  console.log(`wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
