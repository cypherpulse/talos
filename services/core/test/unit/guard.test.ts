import { describe, expect, it } from "vitest";
import { TalosGuard } from "../../src/guard/guard.js";
import { InMemoryAuditLog } from "../../src/guard/audit.js";
import { defaultPermissions, defaultPolicy, type AgentIdentity, type GuardPolicy } from "../../src/guard/policy.js";
import type { CoreClient } from "../../src/guard/core-client.js";
import { nullLogger } from "../../src/observability/logger.js";

const GOOD = "0x00000000000000000000000000000000deadbeef";

function fakeCore(noteValue = "100"): { core: CoreClient; submitted: string[] } {
  const submitted: string[] = [];
  const core = {
    getNote: async (id: string) => ({ id, assetId: "1", value: noteValue, commitment: "c", state: "AVAILABLE", leafIndex: 0, createdAt: "" }),
    submit: async (op: string) => {
      submitted.push(op);
      return { operationId: "op_1", status: "CREATED" };
    },
  } as unknown as CoreClient;
  return { core, submitted };
}

function makeGuard(policy: Partial<GuardPolicy>, permissions = defaultPermissions(), noteValue = "100") {
  const { core, submitted } = fakeCore(noteValue);
  const identity: AgentIdentity = { agentId: "a1", agentName: "test", permissions, policyId: "p", status: "ACTIVE" };
  const guard = new TalosGuard(core, identity, defaultPolicy(policy), new InMemoryAuditLog(), nullLogger());
  return { guard, submitted };
}

describe("TalosGuard policy (§11, §25)", () => {
  it("approves an in-policy split and submits to Core", async () => {
    const { guard, submitted } = makeGuard({ requireApprovalAbove: 10n ** 30n });
    const res = await guard.execute("SPLIT", { noteId: "n1", amount1: "60", amount2: "40" });
    expect(res.decision).toBe("APPROVED");
    expect(res.operationId).toBe("op_1");
    expect(submitted).toEqual(["SPLIT"]);
  });

  it("rejects an operation the policy disallows and does NOT submit", async () => {
    const { guard, submitted } = makeGuard({ allowedOperations: ["DEPOSIT"] });
    const res = await guard.execute("WITHDRAW", { noteId: "n1", recipient: GOOD });
    expect(res.decision).toBe("REJECTED");
    expect(submitted).toEqual([]);
  });

  it("rejects when the agent lacks the permission", async () => {
    const { guard, submitted } = makeGuard({}, { ...defaultPermissions(), canWithdraw: false });
    const res = await guard.execute("WITHDRAW", { noteId: "n1", recipient: GOOD });
    expect(res.decision).toBe("REJECTED");
    expect(res.reason).toContain("permission");
    expect(submitted).toEqual([]);
  });

  it("rejects a disallowed asset", async () => {
    const { guard } = makeGuard({ allowedAssets: ["2"] });
    expect((await guard.execute("SPLIT", { noteId: "n1", amount1: "1", amount2: "1" })).decision).toBe("REJECTED");
  });

  it("rejects an amount above the single-transaction limit", async () => {
    const { guard, submitted } = makeGuard({ maxTransactionValue: 50n }, defaultPermissions(), "100");
    const res = await guard.execute("SPLIT", { noteId: "n1", amount1: "60", amount2: "40" });
    expect(res.decision).toBe("REJECTED");
    expect(res.reason).toContain("max single");
    expect(submitted).toEqual([]);
  });

  it("rejects a withdrawal to a non-allowed recipient (no transaction created)", async () => {
    const { guard, submitted } = makeGuard({ allowedRecipients: [GOOD], requireApprovalAbove: 10n ** 30n });
    const res = await guard.execute("WITHDRAW", { noteId: "n1", recipient: "0x1111111111111111111111111111111111111111" });
    expect(res.decision).toBe("REJECTED");
    expect(res.reason).toContain("recipient");
    expect(submitted).toEqual([]);
  });

  it("requires approval above the threshold, then executes on approve", async () => {
    const { guard, submitted } = makeGuard({ requireApprovalAbove: 50n }, defaultPermissions(), "100");
    const res = await guard.execute("SPLIT", { noteId: "n1", amount1: "60", amount2: "40" });
    expect(res.decision).toBe("APPROVAL_REQUIRED");
    expect(submitted).toEqual([]);
    const approved = await guard.approve(res.guardOperationId!);
    expect(approved.decision).toBe("APPROVED");
    expect(submitted).toEqual(["SPLIT"]);
  });

  it("enforces the daily cap across operations", async () => {
    const { guard } = makeGuard({ maxDailyValue: 150n, requireApprovalAbove: 10n ** 30n }, defaultPermissions(), "100");
    expect((await guard.execute("SPLIT", { noteId: "n1", amount1: "60", amount2: "40" })).decision).toBe("APPROVED");
    // Second 100 would push daily total to 200 > 150.
    expect((await guard.execute("SPLIT", { noteId: "n2", amount1: "60", amount2: "40" })).decision).toBe("REJECTED");
  });

  it("records an audit trail of every decision", async () => {
    const { guard } = makeGuard({ requireApprovalAbove: 10n ** 30n });
    await guard.execute("SPLIT", { noteId: "n1", amount1: "60", amount2: "40" });
    const decisions = await guard.listDecisions(10);
    expect(decisions.length).toBe(1);
    expect(decisions[0]!.operationType).toBe("SPLIT");
    expect(decisions[0]!.decision).toBe("APPROVED");
  });
});
