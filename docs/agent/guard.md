# Talos Guard

The security boundary between the AI agent and the Core Server. Every mutating agent
action is evaluated here **before** it can reach the blockchain. Implemented in
`services/core/src/guard`.

## Policy (typed config, not a DSL)

```ts
interface GuardPolicy {
  allowedOperations: OperationType[];
  allowedAssets: string[];        // asset ids; MVP: ["1"]
  maxTransactionValue: bigint;
  maxDailyValue: bigint;
  allowedRecipients: string[];    // lowercased addresses; withdraw target must be listed
  requireApprovalAbove: bigint;
}
```

Agent identity + permissions:

```ts
interface AgentIdentity { agentId; agentName; permissions; policyId; status }
interface AgentPermissions { canDeposit; canTransfer; canSplit; canMerge; canWithdraw }
```

Both come from configuration (`policyFromEnv`) — `GUARD_MAX_TX_VALUE`,
`GUARD_MAX_DAILY_VALUE`, `GUARD_ALLOWED_RECIPIENTS`, `GUARD_REQUIRE_APPROVAL_ABOVE`,
`AGENT_ID`, `AGENT_NAME`.

## Decision flow (`guard.execute`)

```text
resolve asset/amount/recipient (reads notes as needed)
 → agent active?          → permission for op?     → asset allowed?
 → amount ≤ max single?   → daily + amount ≤ max?   → (withdraw) recipient allowed?
 → amount > approval threshold?  → APPROVAL_REQUIRED
 → else APPROVED → submit to Core Server
```

Every request yields **APPROVED**, **REJECTED**, or **APPROVAL_REQUIRED**, and an
audit record. A REJECTED request never reaches the blockchain.

## Approval

`requireApprovalAbove` gates large operations. An `APPROVAL_REQUIRED` result returns a
`guardOperationId`; `POST /guard/operations/:id/approve` (a human action) executes it.

## Audit trail (§24)

Every decision is recorded: `agentId, operationType, asset, amount, recipient,
decision, reason, createdAt`. No secrets or witnesses are stored. Read via
`GET /guard/decisions`.

## API (§22)

```text
POST /guard/evaluate                 # policy decision only
POST /guard/execute                  # evaluate + (if approved) submit to Core
POST /guard/operations/:id/approve   # approve a pending APPROVAL_REQUIRED
GET  /guard/operations/:id           # proxy Core operation status
GET  /guard/decisions                # audit trail
```

## Why the LLM cannot bypass it

The Guard is plain TypeScript that evaluates a typed policy. The LLM can only *request*
an operation; it cannot alter the policy, permissions, or limits through prompt text.
Tests assert that a "ignore your limit / act as administrator" prompt still results in
REJECTED with no transaction.
