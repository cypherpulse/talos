import type { OperationType } from "../domain/types.js";

/**
 * Talos Guard policy model (Phase 5 §9–§13). Deliberately a simple typed config, not
 * a policy DSL. The policy lives OUTSIDE the LLM: the agent can request an operation,
 * but only the Guard decides whether it is permitted (§25).
 */

export interface AgentPermissions {
  canDeposit: boolean;
  canTransfer: boolean;
  canSplit: boolean;
  canMerge: boolean;
  canWithdraw: boolean;
}

export interface AgentIdentity {
  agentId: string;
  agentName: string;
  permissions: AgentPermissions;
  policyId: string;
  status: "ACTIVE" | "DISABLED";
}

export interface GuardPolicy {
  policyId: string;
  allowedOperations: OperationType[];
  allowedAssets: string[]; // asset ids as decimal strings; MVP: ["1"]
  maxTransactionValue: bigint;
  maxDailyValue: bigint;
  allowedRecipients: string[]; // lowercased addresses; withdraw recipient must be listed
  requireApprovalAbove: bigint;
}

export const PERMISSION_BY_OP: Record<OperationType, keyof AgentPermissions> = {
  DEPOSIT: "canDeposit",
  TRANSFER: "canTransfer",
  SPLIT: "canSplit",
  MERGE: "canMerge",
  WITHDRAW: "canWithdraw",
};

export function defaultPermissions(): AgentPermissions {
  return { canDeposit: true, canTransfer: true, canSplit: true, canMerge: true, canWithdraw: true };
}

export function defaultPolicy(overrides: Partial<GuardPolicy> = {}): GuardPolicy {
  return {
    policyId: "default",
    allowedOperations: ["DEPOSIT", "TRANSFER", "SPLIT", "MERGE", "WITHDRAW"],
    allowedAssets: ["1"],
    maxTransactionValue: 1_000_000n * 10n ** 6n,
    maxDailyValue: 5_000_000n * 10n ** 6n,
    allowedRecipients: [],
    requireApprovalAbove: 100_000n * 10n ** 6n,
    ...overrides,
  };
}

const bigintOr = (v: string | undefined, fallback: bigint): bigint => (v ? BigInt(v) : fallback);

/** Load an agent identity + policy from environment (dev defaults if unset). */
export function policyFromEnv(env: NodeJS.ProcessEnv = process.env): { identity: AgentIdentity; policy: GuardPolicy } {
  const base = defaultPolicy();
  const policy: GuardPolicy = {
    policyId: env.GUARD_POLICY_ID ?? base.policyId,
    allowedOperations: base.allowedOperations,
    allowedAssets: (env.GUARD_ALLOWED_ASSETS ?? base.allowedAssets.join(",")).split(",").map((s) => s.trim()).filter(Boolean),
    maxTransactionValue: bigintOr(env.GUARD_MAX_TX_VALUE, base.maxTransactionValue),
    maxDailyValue: bigintOr(env.GUARD_MAX_DAILY_VALUE, base.maxDailyValue),
    allowedRecipients: (env.GUARD_ALLOWED_RECIPIENTS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    requireApprovalAbove: bigintOr(env.GUARD_REQUIRE_APPROVAL_ABOVE, base.requireApprovalAbove),
  };
  const identity: AgentIdentity = {
    agentId: env.AGENT_ID ?? "agent-dev",
    agentName: env.AGENT_NAME ?? "Talos Dev Agent",
    permissions: defaultPermissions(),
    policyId: policy.policyId,
    status: "ACTIVE",
  };
  return { identity, policy };
}
