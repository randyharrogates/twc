import type { Group, Transfer } from '../types';
import { CURRENCIES, formatMinor } from './currency';

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function memberName(group: Group, id: string): string {
  return group.members.find((m) => m.id === id)?.name ?? 'Unknown';
}

/**
 * Plain-text settlement summary suitable for pasting into a group chat.
 *
 * Pure and deterministic: takes only plain data and formats via `formatMinor` /
 * `expense.createdAt`. No DOM, no Date.now(), no I/O.
 */
export function formatSettlementSummary(
  group: Group,
  balances: Map<string, number>,
  transfers: Transfer[],
): string {
  const base = group.baseCurrency;
  const baseMeta = CURRENCIES[base];
  const lines: string[] = [];

  lines.push(group.name);
  lines.push(`Base currency: ${baseMeta.code} (${baseMeta.name})`);
  lines.push('');

  lines.push(`Expenses (${group.expenses.length})`);
  if (group.expenses.length === 0) {
    lines.push('  (none)');
  } else {
    const sorted = [...group.expenses].sort((a, b) => a.createdAt - b.createdAt);
    for (const e of sorted) {
      const payer = memberName(group, e.payerId);
      const desc = e.description.trim() || '(no description)';
      lines.push(`  ${isoDate(e.createdAt)} · ${payer} · ${desc} — ${formatMinor(e.amountMinor, e.currency)}`);
    }
  }
  lines.push('');

  lines.push('Balances');
  if (group.members.length === 0) {
    lines.push('  (no members)');
  } else {
    const rows = group.members
      .map((m) => ({ name: m.name, v: balances.get(m.id) ?? 0 }))
      .sort((a, b) => b.v - a.v || a.name.localeCompare(b.name));
    for (const r of rows) {
      const sign = r.v > 0 ? '+' : '';
      lines.push(`  ${r.name}: ${sign}${formatMinor(r.v, base)}`);
    }
  }
  lines.push('');

  lines.push('Transfers');
  if (transfers.length === 0) {
    lines.push('  All settled.');
  } else {
    for (const t of transfers) {
      lines.push(`  ${memberName(group, t.from)} → ${memberName(group, t.to)}: ${formatMinor(t.amountMinor, base)}`);
    }
  }

  return lines.join('\n');
}
