import { randomUUID } from "node:crypto";

/** Minimal Guard audit trail (Phase 5 §24). No secrets or witnesses are ever stored. */
export interface GuardDecisionRecord {
  id: string;
  agentId: string;
  operationType: string;
  asset: string;
  amount: string;
  recipient: string | null;
  decision: "APPROVED" | "REJECTED" | "APPROVAL_REQUIRED";
  reason: string;
  createdAt: string;
}

export interface AuditLog {
  record(rec: Omit<GuardDecisionRecord, "id" | "createdAt">): Promise<GuardDecisionRecord>;
  list(limit: number): Promise<GuardDecisionRecord[]>;
  approvedTotalSince(agentId: string, sinceIso: string): Promise<bigint>;
}

export class InMemoryAuditLog implements AuditLog {
  private records: GuardDecisionRecord[] = [];

  async record(rec: Omit<GuardDecisionRecord, "id" | "createdAt">): Promise<GuardDecisionRecord> {
    const full: GuardDecisionRecord = { ...rec, id: `gd_${randomUUID()}`, createdAt: new Date().toISOString() };
    this.records.push(full);
    return full;
  }

  async list(limit: number): Promise<GuardDecisionRecord[]> {
    return this.records.slice(-limit);
  }

  async approvedTotalSince(agentId: string, sinceIso: string): Promise<bigint> {
    return this.records
      .filter((r) => r.agentId === agentId && r.decision === "APPROVED" && r.createdAt >= sinceIso)
      .reduce((sum, r) => sum + BigInt(r.amount), 0n);
  }
}
