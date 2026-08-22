import { beforeEach, describe, expect, it } from "vitest";

import { createInMemoryRepositories } from "../../src/database/memory.js";
import { NoteEncryptionService } from "../../src/notes/encryption.js";
import { NoteManager } from "../../src/notes/manager.js";
import { nullLogger } from "../../src/observability/logger.js";
import type { Repositories } from "../../src/database/repositories.js";
import { AgentsService } from "../../src/agents/service.js";
import { defaultTradePolicy, evaluateTradeIntent } from "../../src/agents/guard/trade-policy.js";
import type { TradeIntent } from "../../src/agents/types/index.js";

/**
 * Phase 6 verification suite. Runs entirely against in-memory repositories and mock
 * trading/price providers — no network, no chain. Proves Guard enforcement, agent-wallet
 * key isolation, trade-execution correctness, the full Research→Portfolio→Trader→Guard→
 * Execution path, and the security negative case.
 */

// Register the trading assets the way the deployed registry would (loadAssets reads env).
process.env.TEST_USDC_ADDRESS = "0x" + "11".repeat(20);
process.env.TEST_USDT_ADDRESS = "0x" + "22".repeat(20);
process.env.TEST_USDG_ADDRESS = "0x" + "33".repeat(20);

const OWNER = "0x00000000000000000000000000000000000000aa";
const ENC_KEY = "0x" + "11".repeat(32);
const USDC = 1;
const OKB = 4;
// A note whose nullifier is never spent on-chain (stub contract for lockForSpend).
const stubContract = { isNullifierSpent: async () => false } as never;

function intent(over: Partial<TradeIntent> = {}): TradeIntent {
  return { type: "TRADE", assetIn: "USDC", assetOut: "OKB", amount: "500000", maxSlippageBps: 100, ...over };
}

let repos: Repositories;
let enc: NoteEncryptionService;
let notes: NoteManager;
let svc: AgentsService;
let engineCalls: Array<{ type: string; body: Record<string, unknown> }>;

async function seedNote(owner: string, assetId: number, value: string) {
  const n = await notes.createNote({ assetId: BigInt(assetId), value: BigInt(value), owner });
  await notes.markAvailable(n.id, 1);
  return n;
}

beforeEach(() => {
  repos = createInMemoryRepositories();
  enc = new NoteEncryptionService(ENC_KEY);
  notes = new NoteManager(repos.notes, stubContract, nullLogger());
  engineCalls = [];
  const engine = {
    createOperation: async (type: string, body: Record<string, unknown>) => {
      engineCalls.push({ type, body });
      return { id: "op_test", type, status: "CREATED" };
    },
  } as never;
  const dispatcher = { dispatch: async () => {} } as never;
  svc = new AgentsService({
    repos,
    engine,
    dispatcher,
    notes,
    encryption: enc,
    chain: { id: 1952, rpcUrl: "http://localhost:8545" },
    logger: nullLogger(),
    config: { tradingChainId: 1952, price: { provider: "mock" } },
  });
});

// --------------------------------------------------------------------------
describe("Guard trade policy", () => {
  const policy = defaultTradePolicy();
  const base = { provider: "mock", dailyUsdSoFar: 0 };

  it("rejects above maximum trade value", () => {
    expect(evaluateTradeIntent(policy, { ...base, intent: intent(), valueUsd: 20_000 }).decision).toBe("REJECTED");
  });
  it("rejects when daily value would be exceeded", () => {
    expect(evaluateTradeIntent(policy, { ...base, intent: intent(), valueUsd: 2_000, dailyUsdSoFar: 49_000 }).decision).toBe("REJECTED");
  });
  it("rejects slippage over the maximum", () => {
    const r = evaluateTradeIntent(policy, { ...base, intent: intent({ maxSlippageBps: 5_000 }), valueUsd: 10 });
    expect(r.decision).toBe("REJECTED");
    expect(r.reason).toMatch(/slippage/i);
  });
  it("rejects a disallowed asset", () => {
    expect(evaluateTradeIntent(policy, { ...base, intent: intent({ assetOut: "WBTC" }), valueUsd: 10 }).decision).toBe("REJECTED");
  });
  it("allows an approved provider and rejects a forbidden one", () => {
    expect(evaluateTradeIntent(policy, { ...base, provider: "okx", intent: intent(), valueUsd: 10 }).decision).toBe("APPROVED");
    expect(evaluateTradeIntent(policy, { ...base, provider: "uniswap", intent: intent(), valueUsd: 10 }).decision).toBe("REJECTED");
  });
  it("requires approval above the threshold", () => {
    expect(evaluateTradeIntent(policy, { ...base, intent: intent(), valueUsd: 2_500 }).decision).toBe("APPROVAL_REQUIRED");
  });
  it("approves a trade within policy", () => {
    expect(evaluateTradeIntent(policy, { ...base, intent: intent(), valueUsd: 10 }).decision).toBe("APPROVED");
  });
});

// --------------------------------------------------------------------------
describe("Agent wallet security", () => {
  it("stores private keys AES-encrypted at rest and never exposes them", async () => {
    const agent = await svc.getOrCreateAgent(OWNER, "TRADER");
    const blobs = await repos.agents.getSecretBlobs(agent.id);
    expect(blobs).not.toBeNull();

    const pk = enc.decrypt(blobs!.walletKeyBlob);
    const spendingKey = enc.decrypt(blobs!.spendingKeyBlob);
    expect(pk).toMatch(/^0x[0-9a-f]{64}$/i); // a real EOA private key
    // Ciphertext is not the plaintext.
    expect(blobs!.walletKeyBlob).not.toContain(pk);
    expect(blobs!.spendingKeyBlob).not.toContain(spendingKey);

    // The public agent record + receive identity leak no key material.
    const publicJson = JSON.stringify(agent);
    expect(publicJson).not.toContain("KeyBlob");
    expect(publicJson).not.toContain(pk);
    expect(publicJson).not.toContain(spendingKey);
    const identity = await svc.getReceiveIdentity(agent.id);
    const idJson = JSON.stringify(identity);
    expect(idJson).not.toContain(pk);
    expect(idJson).not.toContain(spendingKey);
    // Public receive key IS present (safe to share).
    expect(identity!.talosPublicKey).toBe(agent.talosPublicKey);
  });

  it("signer isolation: can sign for the agent address without exposing the key", async () => {
    const agent = await svc.getOrCreateAgent(OWNER, "TRADER");
    const signer = await svc.wallets.getSigner(agent.id);
    expect(signer).not.toBeNull();
    expect(signer!.address.toLowerCase()).toBe(agent.walletAddress.toLowerCase());
    // The signer object exposes only an address + a function — no key field.
    expect(JSON.stringify({ address: signer!.address })).not.toMatch(/[0-9a-f]{64}/i);
    expect(Object.keys(signer!)).toEqual(expect.arrayContaining(["address", "sendTransaction"]));
    expect(Object.keys(signer!)).not.toContain("privateKey");
  });
});

// --------------------------------------------------------------------------
describe("Trade execution", () => {
  it("executes a valid trade and updates private portfolio state", async () => {
    await seedNote(OWNER, USDC, "1000000"); // 1 USDC
    const before = await svc.getPortfolio(OWNER);
    expect(before.positions.find((p) => p.symbol === "USDC")?.amount).toBe("1000000");

    const result = await svc.createTrade(OWNER, { assetIn: "USDC", assetOut: "OKB", amount: "500000", maxSlippageBps: 100 });
    expect(result.decision).toBe("APPROVED");
    expect(result.status).toBe("SETTLED");
    expect(BigInt(result.toAmount!)).toBeGreaterThan(0n);

    const after = await svc.getPortfolio(OWNER);
    expect(after.positions.find((p) => p.symbol === "OKB")).toBeDefined(); // received OKB
    expect(after.positions.find((p) => p.symbol === "USDC")?.amount).toBe("500000"); // change note
  });

  it("rejects an invalid trade BEFORE execution — no settlement, no portfolio change, no tx", async () => {
    await seedNote(OWNER, USDC, "1000000");
    const result = await svc.createTrade(OWNER, { assetIn: "USDC", assetOut: "OKB", amount: "500000", maxSlippageBps: 5000 });
    expect(result.decision).toBe("REJECTED");
    expect(result.status).toBe("REJECTED");

    // No OKB was received; USDC note untouched.
    const after = await svc.getPortfolio(OWNER);
    expect(after.positions.find((p) => p.symbol === "OKB")).toBeUndefined();
    expect(after.positions.find((p) => p.symbol === "USDC")?.amount).toBe("1000000");

    // The recorded execution carries NO transaction hash.
    const trade = await svc.getTrade(result.executionId);
    expect(trade?.status).toBe("REJECTED");
    expect(trade?.txHash).toBeNull();
  });

  it("a failed execution (insufficient balance) does not incorrectly update portfolio", async () => {
    await seedNote(OWNER, USDC, "100000"); // only 0.1 USDC
    const result = await svc.createTrade(OWNER, { assetIn: "USDC", assetOut: "OKB", amount: "500000", maxSlippageBps: 100 });
    expect(result.status).toBe("FAILED");
    const after = await svc.getPortfolio(OWNER);
    expect(after.positions.find((p) => p.symbol === "OKB")).toBeUndefined();
    expect(after.positions.find((p) => p.symbol === "USDC")?.amount).toBe("100000");
  });

  it("tracks trade status and is safe to retry after rejection (no double effect)", async () => {
    await seedNote(OWNER, USDC, "1000000");
    const r1 = await svc.createTrade(OWNER, { assetIn: "USDC", assetOut: "OKB", amount: "500000", maxSlippageBps: 5000 });
    const r2 = await svc.createTrade(OWNER, { assetIn: "USDC", assetOut: "OKB", amount: "500000", maxSlippageBps: 5000 });
    expect(r1.status).toBe("REJECTED");
    expect(r2.status).toBe("REJECTED");
    // Notes remain untouched after repeated rejected attempts.
    const after = await svc.getPortfolio(OWNER);
    expect(after.positions.find((p) => p.symbol === "USDC")?.amount).toBe("1000000");
    expect((await svc.getTrade(r1.executionId))?.status).toBe("REJECTED");
  });
});

// --------------------------------------------------------------------------
describe("Private profit transfer", () => {
  it("only the Trading Agent owns a wallet; Research/Portfolio have none", async () => {
    await expect(svc.getOrCreateAgent(OWNER, "RESEARCH")).rejects.toThrow();
    await expect(svc.getOrCreateAgent(OWNER, "PORTFOLIO")).rejects.toThrow();
    const trader = await svc.getTradingAgent(OWNER);
    expect(trader.role).toBe("TRADER");
    expect(trader.walletAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("privately transfers to a Talos receive identity via the existing TRANSFER, never exposing keys", async () => {
    await seedNote(OWNER, USDC, "1000000");
    const trader = await svc.getTradingAgent(OWNER);

    // Recipient is a Talos receive identity (e.g. the user's wallet identity), not a 2nd wallet-agent.
    const userReceiveKey = "1234567890123456789";
    const res = await svc.transfer(OWNER, trader.id, { toPublicKey: userReceiveKey, assetId: USDC, amount: "400000" });
    expect(res.operationId).toBeTruthy();

    // Reused the existing private TRANSFER operation (not a bespoke path).
    const transferCall = engineCalls.find((c) => c.type === "TRANSFER")!;
    expect(transferCall).toBeDefined();
    expect(transferCall.body.recipientOwnerPubKey).toBe(userReceiveKey);

    // The durable record never contains the agent's spending key.
    const record = (await repos.agentTransfers.listByAgent(trader.id))[0]!;
    const spendingKey = enc.decrypt((await repos.agents.getSecretBlobs(trader.id))!.spendingKeyBlob);
    expect(JSON.stringify(record)).not.toContain(spendingKey);
  });
});

// --------------------------------------------------------------------------
describe("Integration: Research → Portfolio → Trader → Guard → Execution", () => {
  it("runs the full approved path via the orchestrator", async () => {
    await seedNote(OWNER, USDC, "1000000");
    const out = await svc.orchestrate(OWNER, "Buy 0.5 USDC worth of OKB with 1% slippage");

    expect(out.research).toBeDefined(); // research produced structured output
    expect(["BUY", "SELL", "HOLD"]).toContain(out.research!.recommendation);
    expect(out.intent?.type).toBe("TRADE"); // trader created a valid intent
    expect(out.trade?.decision).toBe("APPROVED"); // Guard approved
    expect(out.trade?.status).toBe("SETTLED"); // reached execution

    const after = await svc.getPortfolio(OWNER);
    expect(after.positions.find((p) => p.symbol === "OKB")).toBeDefined();
  });

  it("stops execution when the Guard rejects the intent", async () => {
    await seedNote(OWNER, USDC, "1000000");
    // 50% slippage → Guard rejects; nothing settles.
    const out = await svc.orchestrate(OWNER, "Buy 0.5 USDC worth of OKB with 50% slippage");
    expect(out.trade?.decision).toBe("REJECTED");
    expect(out.trade?.status).not.toBe("SETTLED");
    const after = await svc.getPortfolio(OWNER);
    expect(after.positions.find((p) => p.symbol === "OKB")).toBeUndefined();
  });
});

// --------------------------------------------------------------------------
describe("Security negative test: USDC → OKB @ 5000 bps slippage", () => {
  it("is rejected by the Guard and creates no transaction", async () => {
    await seedNote(OWNER, USDC, "1000000");
    const result = await svc.createTrade(OWNER, { assetIn: "USDC", assetOut: "OKB", amount: "500000", maxSlippageBps: 5000 });

    expect(result.decision).toBe("REJECTED");
    expect(result.reason).toMatch(/slippage/i);
    const trade = await svc.getTrade(result.executionId);
    expect(trade?.status).toBe("REJECTED");
    expect(trade?.txHash).toBeNull(); // NO transaction
    // Portfolio is unchanged.
    const after = await svc.getPortfolio(OWNER);
    expect(after.positions.find((p) => p.symbol === "USDC")?.amount).toBe("1000000");
    expect(after.positions.find((p) => p.symbol === "OKB")).toBeUndefined();
  });
});
