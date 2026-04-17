import { CURRENCIES, type CurrencyCode, isCurrencyCode } from '../currency';
import { parseAmountToMinor } from '../currency';
import type { LLMClient, ParseContext, ParseResult, ExpenseDraft } from './types';
import type { Member, SplitEntry } from '../../types';

const SYMBOL_TO_CODE: Record<string, CurrencyCode> = {
  '$': 'USD',
  '¥': 'JPY',
  '₩': 'KRW',
  '€': 'EUR',
  '£': 'GBP',
  '฿': 'THB',
  'S$': 'SGD',
  'RM': 'MYR',
  'NT$': 'TWD',
};

const HINT = `Couldn't parse. Try: "Alice paid 50 for dinner split with Bob and Charlie".`;

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}

function matchMember(name: string, members: Member[]): Member | null {
  const lower = name.toLowerCase();
  const exact = members.find((m) => m.name.toLowerCase() === lower);
  if (exact) return exact;
  for (const m of members) {
    if (levenshtein(m.name, name) <= 2) return m;
  }
  return null;
}

function detectCurrency(text: string, fallback: CurrencyCode): { code: CurrencyCode; stripped: string } {
  // Match 3-letter code first.
  const codeMatch = text.match(/\b([A-Z]{3})\b/);
  if (codeMatch && isCurrencyCode(codeMatch[1])) {
    return { code: codeMatch[1], stripped: text.replace(codeMatch[0], '').trim() };
  }
  for (const [sym, code] of Object.entries(SYMBOL_TO_CODE)) {
    if (text.includes(sym)) {
      return { code, stripped: text.replace(sym, '').trim() };
    }
  }
  return { code: fallback, stripped: text };
}

function extractParticipants(text: string, members: Member[]): {
  ids: string[];
  unresolved: string[];
} {
  // Look for "split (with|between|among) <list>"
  const splitMatch = text.match(/split\s+(?:with|between|among)\s+(.+?)(?:\.|$)/i);
  if (!splitMatch) return { ids: [], unresolved: [] };
  const raw = splitMatch[1]
    .replace(/\band\b/gi, ',')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ids: string[] = [];
  const unresolved: string[] = [];
  for (const name of raw) {
    const m = matchMember(name, members);
    if (m) ids.push(m.id);
    else unresolved.push(name);
  }
  return { ids, unresolved };
}

export class MockLLMClient implements LLMClient {
  async parseExpenses(input: string, context: ParseContext): Promise<ParseResult> {
    const { members, baseCurrency, rateHints } = context;
    const text = input.trim();
    if (!text) return { parseError: 'Empty input. ' + HINT };
    if (members.length === 0) {
      return { parseError: 'Add at least one member to the group first.' };
    }

    // Pattern: "<name> paid <amount> for <desc>"
    const paidMatch = text.match(/^(.+?)\s+paid\s+([^\s]+)\s+(?:for\s+)?(.+?)(?:\s+split\b.*)?$/i);
    if (!paidMatch) return { parseError: HINT };

    const [, payerName, amountToken, descRaw] = paidMatch;
    const payer = matchMember(payerName.trim(), members);
    if (!payer) {
      return {
        parseError: `Couldn't find member "${payerName.trim()}". Add them first, or adjust the name.`,
      };
    }

    const { code, stripped } = detectCurrency(amountToken, baseCurrency);
    const amountMinor = parseAmountToMinor(stripped || amountToken, code);
    if (amountMinor === null || amountMinor <= 0) {
      return { parseError: `Couldn't read the amount "${amountToken}". ${HINT}` };
    }

    const { ids: participantIds, unresolved } = extractParticipants(text, members);
    const participantSet = new Set(participantIds.length > 0 ? participantIds : members.map((m) => m.id));
    const split: SplitEntry[] = members.map((m) => ({
      memberId: m.id,
      value: participantSet.has(m.id) ? 1 : 0,
    }));

    const rateToBase = code === baseCurrency ? 1 : rateHints[code] ?? 1;

    const description = descRaw.replace(/\s+split\b.*$/i, '').trim() || 'Expense';

    const draft: ExpenseDraft = {
      description,
      amountMinor,
      currency: code,
      rateToBase,
      payerId: payer.id,
      splitMode: 'even',
      split,
      unresolvedNames: unresolved.length > 0 ? unresolved : undefined,
    };
    void CURRENCIES;
    return { drafts: [draft] };
  }
}
