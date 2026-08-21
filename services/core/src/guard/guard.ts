import { randomUUID } from "node:crypto";
import type { OperationType } from "../domain/types.js";
import type { Logger } from "../observability/logger.js";
import type { AgentIdentity, GuardPolicy } from "./policy.js";
import { PERMISSION_BY_OP } from "./policy.js";
import type { AuditLog, GuardDecisionRecord } from "./audit.js";
import type { CoreClient } from "./core-client.js";

export type Decision = "APPROVED" | "REJECTED" | "APPROVAL_REQUIRED";

export interface GuardResult {
  decision: Decision;
  reason: string;
  operationId?: string;
  guardOperationId?: string;
  audit: GuardDecisionRecord;
}

interface EvalContext {
  asset: string;
  amount: bigint;
  recipient: string | null;
}

const ASSET_ID = "1";

/**
 * TalosGuard (Phase 5 §8, §11, §15, §23) — the security boundary between the AI agent
 * and the Core Server. EVERY mutating agent action passes through here first. The
 * policy is enforced in code, outside the LLM, so no natural-language instruction can
 * widen permissions or limits (§25). Produces APPROVED / REJECTED / APPROVAL_REQUIRED,
 * always with an audit record.
 */
export class TalosGuard {
  private pending = new Map<string, { op: OperationType; params: Record<string, unknown>; ctx: EvalContext }>();

  constructor(
    private readonly core: CoreClient,
    private readonly identity: AgentIdentity,
    private readonly policy: GuardPolicy,
    private readonly audit: AuditLog,
    private readonly logger: Logger,
  ) {}

  getIdentity(): AgentIdentity {
    return this.identity;
  }

  listDecisions(limit = 100): Promise<GuardDecisionRecord[]> {
    return this.audit.list(limit);
  }

  /** Resolve the asset/amount/recipient a policy decision needs, reading notes as required. */
  private async resolveContext(op: OperationType, params: Record<string, unknown>): Promise<EvalContext> {
    const recipient = op === "WITHDRAW" ? String(params.recipient ?? "").toLowerCase() : null;
    let amount = 0n;
    if (op === "DEPOSIT") {
      amount = BigInt(String(params.amount ?? "0"));
    } else if (op === "MERGE") {
      const [n1, n2] = await Promise.all([this.core.getNote(String(params.noteId1)), this.core.getNote(String(params.noteId2))]);
      amount = BigInt(n1.value) + BigInt(n2.value);
    } else {
      const note = await this.core.getNote(String(params.noteId));
      amount = BigInt(note.value);
    }
    return { asset: ASSET_ID, amount, recipient };
  }

  private startOfDayIso(): string {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  }

  /** Pure policy decision (no execution). */
  async evaluate(op: OperationType, params: Record<string, unknown>): Promise<{ decision: Decision; reason: string; ctx: EvalContext }> {
    const ctx = await this.resolveContext(op, params);
    const deny = (reason: string): { decision: Decision; reason: string; ctx: EvalContext } => ({ decision: "REJECTED", reason, ctx });

    if (this.identity.status !== "ACTIVE") return deny("agent is disabled");
    if (!this.policy.allowedOperations.includes(op)) return deny(`operation ${op} not allowed`);
    if (!this.identity.permissions[PERMISSION_BY_OP[op]]) return deny(`agent lacks permission for ${op}`);
    if (!this.policy.allowedAssets.includes(ctx.asset)) return deny(`asset ${ctx.asset} not allowed`);
    if (ctx.amount > this.policy.maxTransactionValue) return deny("amount exceeds max single-transaction value");

    const dailyUsed = await this.audit.approvedTotalSince(this.identity.agentId, this.startOfDayIso());
    if (dailyUsed + ctx.amount > this.policy.maxDailyValue) return deny("amount exceeds max daily value");

    if (op === "WITHDRAW") {
      if (this.policy.allowedRecipients.length === 0 || !this.policy.allowedRecipients.includes(ctx.recipient ?? "")) {
        return deny("recipient not allowed");
      }
    }

    if (ctx.amount > this.policy.requireApprovalAbove) {
      return { decision: "APPROVAL_REQUIRED", reason: "amount above approval threshold", ctx };
    }
    return { decision: "APPROVED", reason: "within policy", ctx };
  }

  /** Evaluate, audit, and (if approved) submit to the Core Server. */
  async execute(op: OperationType, params: Record<string, unknown>): Promise<GuardResult> {
    const { decision, reason, ctx } = await this.evaluate(op, params);
    const audit = await this.audit.record({
      agentId: this.identity.agentId,
      operationType: op,
      asset: ctx.asset,
      amount: ctx.amount.toString(),
      recipient: ctx.recipient,
      decision,
      reason,
    });
    this.logger.info("guard decision", { agentId: this.identity.agentId, op, decision, reason, amount: ctx.amount.toString() });

    if (decision === "REJECTED") return { decision, reason, audit };
    if (decision === "APPROVAL_REQUIRED") {
      const guardOperationId = `gop_${randomUUID()}`;
      this.pending.set(guardOperationId, { op, params, ctx });
      return { decision, reason, guardOperationId, audit };
    }
    const { operationId } = await this.core.submit(op, params);
    return { decision, reason, operationId, audit };
  }

  /** Approve a previously APPROVAL_REQUIRED request and submit it to the Core Server. */
  async approve(guardOperationId: string): Promise<GuardResult> {
    const pending = this.pending.get(guardOperationId);
    if (!pending) throw new Error("unknown or already-processed approval id");
    this.pending.delete(guardOperationId);
    const audit = await this.audit.record({
      agentId: this.identity.agentId,
      operationType: pending.op,
      asset: pending.ctx.asset,
      amount: pending.ctx.amount.toString(),
      recipient: pending.ctx.recipient,
      decision: "APPROVED",
      reason: "human-approved",
    });
    const { operationId } = await this.core.submit(pending.op, pending.params);
    return { decision: "APPROVED", reason: "human-approved", operationId, audit };
  }
}
