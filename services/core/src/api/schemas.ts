import { z } from "zod";

/** Request validation schemas (Phase 4 §33). Amounts/field elements are decimal strings. */

const decimal = z.string().regex(/^\d+$/, "must be a decimal integer string");
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "must be a 20-byte hex address");

export const DepositSchema = z.object({
  amount: decimal,
  assetId: z.number().int().optional(),
});

export const SplitSchema = z.object({
  noteId: z.string().min(1),
  amount1: decimal,
  amount2: decimal,
});

export const MergeSchema = z.object({
  noteId1: z.string().min(1),
  noteId2: z.string().min(1),
});

export const TransferSchema = z.object({
  noteId: z.string().min(1),
  amount1: decimal,
  amount2: decimal,
  recipientOwnerPubKey: decimal,
});

export const WithdrawSchema = z.object({
  noteId: z.string().min(1),
  recipient: address,
});

export type DepositRequest = z.infer<typeof DepositSchema>;
export type SplitRequest = z.infer<typeof SplitSchema>;
export type MergeRequest = z.infer<typeof MergeSchema>;
export type TransferRequest = z.infer<typeof TransferSchema>;
export type WithdrawRequest = z.infer<typeof WithdrawSchema>;
