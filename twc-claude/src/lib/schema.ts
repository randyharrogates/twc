import { z } from 'zod';
import { CURRENCY_CODES, type CurrencyCode } from './currency';

const currencyEnum = z.enum(CURRENCY_CODES as [CurrencyCode, ...CurrencyCode[]]);

export const MemberSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(200),
  })
  .strict();

export const SplitEntrySchema = z
  .object({
    memberId: z.string().min(1),
    value: z.number().finite().nonnegative(),
  })
  .strict();

export const SplitModeSchema = z.enum(['even', 'shares', 'exact', 'percent']);

export const ExpenseSchema = z
  .object({
    id: z.string().min(1),
    description: z.string().min(1).max(500),
    amountMinor: z.number().int().min(1),
    currency: currencyEnum,
    rateToBase: z.number().positive().finite(),
    payerId: z.string().min(1),
    splitMode: SplitModeSchema,
    split: z.array(SplitEntrySchema).min(1),
    createdAt: z.number().int(),
    receiptRef: z.string().optional(),
  })
  .strict();

export const TransferSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    amountMinor: z.number().int().min(1),
  })
  .strict();

export const GroupSchema = z
  .object({
    id: z.string().min(1),
    version: z.number().int().min(1),
    name: z.string().min(1).max(200),
    baseCurrency: currencyEnum,
    createdAt: z.number().int(),
    members: z.array(MemberSchema).min(1),
    expenses: z.array(ExpenseSchema),
    rateHints: z.partialRecord(currencyEnum, z.number().positive().finite()),
    settlement: z.array(TransferSchema).optional(),
    settledAt: z.number().int().optional(),
  })
  .strict();

export type GroupFile = z.infer<typeof GroupSchema>;
