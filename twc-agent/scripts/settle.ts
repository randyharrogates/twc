#!/usr/bin/env tsx
/**
 * Deterministic settlement for a group. Reads data/groups/<id>.json, computes
 * balances and transfers, appends them to the group file as `settlement` and
 * `settledAt`, and bumps `version`.
 *
 * Usage: npm run settle -- <groupId>
 *
 * Claude Code should shell out to this script rather than do the math itself.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GroupSchema } from '../src/lib/schema';
import { computeBalances, settle } from '../src/lib/settlement';
import { formatMinor } from '../src/lib/currency';

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error('usage: npm run settle -- <groupId>');
    process.exit(1);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    console.error('invalid groupId (allowed: letters, digits, _, -)');
    process.exit(1);
  }

  const path = resolve(process.cwd(), `data/groups/${id}.json`);
  const raw = await readFile(path, 'utf8');
  const parsed = GroupSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    console.error('group file failed schema validation:');
    console.error(parsed.error.issues);
    process.exit(1);
  }

  const group = parsed.data;
  const balances = computeBalances(group);
  const transfers = settle(balances);

  const next = {
    ...group,
    version: group.version + 1,
    settlement: transfers,
    settledAt: Date.now(),
  };

  const revalidate = GroupSchema.safeParse(next);
  if (!revalidate.success) {
    console.error('computed settlement violates schema:');
    console.error(revalidate.error.issues);
    process.exit(1);
  }

  await writeFile(path, JSON.stringify(next, null, 2) + '\n', 'utf8');

  console.log(`Settled group: ${group.name} (${group.baseCurrency})`);
  console.log('');
  const byId = new Map(group.members.map((m) => [m.id, m.name]));
  for (const t of transfers) {
    console.log(
      `  ${byId.get(t.from) ?? t.from} → ${byId.get(t.to) ?? t.to}: ${formatMinor(t.amountMinor, group.baseCurrency)}`,
    );
  }
  if (transfers.length === 0) console.log('  (everyone is settled up)');
  console.log('');
  console.log(`Wrote settlement to ${path} (version ${next.version}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
