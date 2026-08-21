import type { NotePublic, OperationType } from "../domain/types.js";
import type { Logger } from "../observability/logger.js";
import type { TalosGuard } from "../guard/guard.js";
import type { CoreClient, OperationView } from "../guard/core-client.js";
import type { ToolSchema } from "./llm.js";

/**
 * Agent tools (Phase 5 §6, §7). The agent can ONLY act through these explicit tools —
 * there is no generic RPC / arbitrary-contract tool. Read tools query the Core Server;
 * every MUTATION goes through the Talos Guard first, never directly to the Core Server.
 * Tool results contain only public data (§19) — never secrets, nonces, or witnesses.
 */

export interface ToolContext {
  core: CoreClient;
  guard: TalosGuard;
  logger: Logger;
}

const TERMINAL = ["FINALIZED", "FAILED", "REJECTED", "CANCELLED", "EXPIRED"];

async function pollOperation(core: CoreClient, operationId: string, timeoutMs = 150_000): Promise<OperationView> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const op = await core.getOperation(operationId);
    if (TERMINAL.includes(op.status)) return op;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`operation ${operationId} did not finish in time`);
}

async function executeMutation(ctx: ToolContext, op: OperationType, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await ctx.guard.execute(op, params);
  if (result.decision !== "APPROVED") {
    return { decision: result.decision, reason: result.reason, guardOperationId: result.guardOperationId ?? null };
  }
  const view = await pollOperation(ctx.core, result.operationId!);
  return {
    decision: "APPROVED",
    operationId: result.operationId,
    status: view.status,
    txHash: view.txHash,
    result: view.result,
    errorCode: view.errorCode,
  };
}

async function availableNotes(core: CoreClient): Promise<NotePublic[]> {
  return (await core.listNotes()).notes.filter((n) => n.state === "AVAILABLE");
}

export type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  async getNotes(_args, ctx) {
    return (await ctx.core.listNotes()).notes;
  },
  async getBalance(_args, ctx) {
    const notes = await availableNotes(ctx.core);
    const total = notes.reduce((sum, n) => sum + BigInt(n.value), 0n);
    return { asset: "USDC", available: total.toString(), noteCount: notes.length };
  },
  async getMerkleRoot(_args, ctx) {
    return ctx.core.getMerkleRoot();
  },
  async deposit(args, ctx) {
    return executeMutation(ctx, "DEPOSIT", { amount: String(args.amount) });
  },
  async split(args, ctx) {
    const a1 = BigInt(String(args.amount1));
    const a2 = BigInt(String(args.amount2));
    const note = (await availableNotes(ctx.core)).find((n) => BigInt(n.value) === a1 + a2);
    if (!note) return { error: `no available note worth ${a1 + a2}` };
    return executeMutation(ctx, "SPLIT", { noteId: note.id, amount1: a1.toString(), amount2: a2.toString() });
  },
  async merge(_args, ctx) {
    const notes = await availableNotes(ctx.core);
    if (notes.length < 2) return { error: "need at least two available notes to merge" };
    return executeMutation(ctx, "MERGE", { noteId1: notes[0]!.id, noteId2: notes[1]!.id });
  },
  async transfer(args, ctx) {
    const amount = BigInt(String(args.amount));
    if (!args.recipientOwnerPubKey) return { error: "recipientOwnerPubKey is required for a private transfer" };
    const note = (await availableNotes(ctx.core)).find((n) => BigInt(n.value) >= amount);
    if (!note) return { error: `no available note worth at least ${amount}` };
    const change = BigInt(note.value) - amount;
    return executeMutation(ctx, "TRANSFER", {
      noteId: note.id,
      amount1: amount.toString(),
      amount2: change.toString(),
      recipientOwnerPubKey: String(args.recipientOwnerPubKey),
    });
  },
  async withdraw(args, ctx) {
    if (!args.recipient) return { error: "recipient address is required" };
    const notes = await availableNotes(ctx.core);
    const note = args.amount ? notes.find((n) => BigInt(n.value) === BigInt(String(args.amount))) : notes[0];
    if (!note) return { error: "no matching available note to withdraw" };
    return executeMutation(ctx, "WITHDRAW", { noteId: note.id, recipient: String(args.recipient) });
  },
  async getOperationStatus(args, ctx) {
    return ctx.core.getOperation(String(args.operationId));
  },
  async getTransactionStatus(args, ctx) {
    const op = await ctx.core.getOperation(String(args.operationId));
    return { status: op.status, txHash: op.txHash };
  },
};

export const TOOL_SCHEMAS: ToolSchema[] = [
  { name: "getNotes", description: "List the agent's private notes (public fields only).", parameters: { type: "object", properties: {} } },
  { name: "getBalance", description: "Sum of available private note values.", parameters: { type: "object", properties: {} } },
  { name: "getMerkleRoot", description: "Current on-chain Merkle root.", parameters: { type: "object", properties: {} } },
  { name: "deposit", description: "Deposit the test asset and create a private note.", parameters: { type: "object", properties: { amount: { type: "string" } }, required: ["amount"] } },
  { name: "split", description: "Split a private note into two amounts.", parameters: { type: "object", properties: { amount1: { type: "string" }, amount2: { type: "string" } }, required: ["amount1", "amount2"] } },
  { name: "merge", description: "Merge two private notes into one.", parameters: { type: "object", properties: {} } },
  { name: "transfer", description: "Privately transfer an amount to a recipient owner public key.", parameters: { type: "object", properties: { amount: { type: "string" }, recipientOwnerPubKey: { type: "string" } }, required: ["amount", "recipientOwnerPubKey"] } },
  { name: "withdraw", description: "Withdraw a note to a public recipient address.", parameters: { type: "object", properties: { recipient: { type: "string" }, amount: { type: "string" } }, required: ["recipient"] } },
  { name: "getOperationStatus", description: "Get the status of a Talos operation.", parameters: { type: "object", properties: { operationId: { type: "string" } }, required: ["operationId"] } },
  { name: "getTransactionStatus", description: "Get the transaction status of a Talos operation.", parameters: { type: "object", properties: { operationId: { type: "string" } }, required: ["operationId"] } },
];
