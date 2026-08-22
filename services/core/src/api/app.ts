import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { z, ZodError } from "zod";
import type { Services } from "../services.js";
import type { Logger } from "../observability/logger.js";
import { isTalosError, InvalidRequest, OperationNotFound } from "../errors/index.js";
import { toNotePublic, type OperationRecord, type OperationType } from "../domain/types.js";
import { requestId, rateLimit } from "./middleware.js";
import { DepositSchema, MergeSchema, SplitSchema, TransferSchema, WithdrawSchema } from "./schemas.js";
import { loadAssets } from "../domain/assets.js";
import { deriveOwnerPubKey } from "../crypto/poseidon.js";
import { randomFieldElement } from "../crypto/random.js";
import { CoreClient } from "../guard/core-client.js";
import { TalosGuard } from "../guard/guard.js";
import { createGuardApp } from "../guard/api.js";
import { InMemoryAuditLog } from "../guard/audit.js";
import { policyFromEnv } from "../guard/policy.js";
import { TalosAgent } from "../agent/agent.js";
import { createLLMProvider } from "../agent/llm.js";

type Env = { Variables: { requestId: string } };

function sanitizeOperation(op: OperationRecord) {
  return {
    operationId: op.id,
    type: op.type,
    status: op.status,
    txHash: op.txHash,
    errorCode: op.errorCode,
    errorMessage: op.errorMessage,
    result: op.result,
    createdAt: op.createdAt,
    updatedAt: op.updatedAt,
  };
}

/**
 * Builds the Talos Core HTTP API (Phase 4 §24–§25). Long-running operations return
 * an operationId immediately (202) and are polled via GET /operations/:id — the
 * request never blocks on proof generation or confirmation. Only specific, supported
 * operations are exposed; there is NO generic RPC/eth_sendTransaction endpoint (§31).
 */
export function createApp(services: Services): Hono<Env> {
  const { engine, dispatcher, repos, chain, contract, proofs, logger, agents } = services;
  const app = new Hono<Env>();

  app.use("*", requestId());
  app.use("*", cors());
  app.use("*", secureHeaders());
  app.use("/api/*", rateLimit({ windowMs: 60_000, max: 120 }));

  app.onError((err, c) => {
    const log: Logger = logger.child({ requestId: c.get("requestId") });
    if (err instanceof ZodError) {
      return c.json({ error: { code: "INVALID_REQUEST", message: "validation failed", details: err.issues } }, 400);
    }
    if (isTalosError(err)) {
      log.warn("request error", { code: err.code, message: err.message });
      return c.json(err.toJSON(), err.status as 400);
    }
    log.error("unhandled error", { message: String(err) });
    return c.json({ error: { code: "INTERNAL_ERROR", message: "internal server error" } }, 500);
  });

  // --- Liveness / readiness ---

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.get("/ready", async (c) => {
    const checks: Record<string, boolean> = {
      chain: await chain.isHealthy(),
      artifacts: proofs.artifactsPresent(),
    };
    try {
      await contract.getLastRoot();
      checks.pool = true;
    } catch {
      checks.pool = false;
    }
    const ready = Object.values(checks).every(Boolean);
    return c.json({ ready, checks }, ready ? 200 : 503);
  });

  // --- Status / Merkle ---

  app.get("/api/v1/status", async (c) => {
    const [blockNumber, root, nextLeafIndex, merkleDepth] = await Promise.all([
      chain.getBlockNumber(),
      contract.getLastRoot(),
      contract.nextLeafIndex(),
      contract.merkleDepth(),
    ]);
    return c.json({
      chainId: chain.chain.id,
      blockNumber: Number(blockNumber),
      root: root.toString(),
      nextLeafIndex: Number(nextLeafIndex),
      merkleDepth: Number(merkleDepth),
    });
  });

  app.get("/api/v1/merkle/root", async (c) => {
    const root = await contract.getLastRoot();
    return c.json({ root: root.toString() });
  });

  // --- Notes (public projection only — never secrets) ---

  app.get("/api/v1/notes", async (c) => {
    // Scope to the connected wallet when `owner` is supplied (per-user isolation).
    const owner = c.req.query("owner");
    const notes = await repos.notes.list(200, owner ? owner.toLowerCase() : undefined);
    return c.json({ notes: notes.map(toNotePublic) });
  });

  app.get("/api/v1/notes/:id", async (c) => {
    const note = await repos.notes.get(c.req.param("id"));
    if (!note) throw OperationNotFound("note not found");
    return c.json(toNotePublic(note));
  });

  // --- Operations / transactions ---

  app.get("/api/v1/operations/:id", async (c) => {
    const op = await repos.operations.get(c.req.param("id"));
    if (!op) throw OperationNotFound("operation not found");
    return c.json(sanitizeOperation(op));
  });

  app.get("/api/v1/transactions/:id", async (c) => {
    const tx = await repos.transactions.get(c.req.param("id"));
    if (!tx) throw OperationNotFound("transaction not found");
    return c.json(tx);
  });

  // --- Operation submission (async; returns operationId) ---

  const submit = async (c: Context<Env>, type: OperationType, request: Record<string, unknown>) => {
    const idem = c.req.header("idempotency-key") ?? null;
    const op = await engine.createOperation(type, request, idem);
    await dispatcher.dispatch(op.id);
    return c.json({ operationId: op.id, status: op.status }, 202);
  };

  // Registered assets the browser can shield (USDC/USDT/USDG + native OKB) — token
  // addresses + decimals the wallet needs to approve/deposit.
  const assets = loadAssets();
  app.get("/api/v1/assets", (c) =>
    c.json({ chainId: chain.chain.id, poolAddress: contract.poolAddress, assets }),
  );

  // Non-custodial deposit — phase 1: server mints the note + commitment and returns the
  // calldata inputs; the browser wallet signs and funds the actual on-chain deposit.
  const PrepareSchema = z.object({
    assetId: z.number().int().positive(),
    amount: z.string().regex(/^\d+$/),
    owner: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  });
  app.post("/api/v1/deposits/prepare", async (c) => {
    const body = PrepareSchema.parse(await c.req.json());
    const asset = assets.find((a) => a.assetId === body.assetId);
    if (!asset) throw OperationNotFound(`asset ${body.assetId} is not registered`);
    const idem = c.req.header("idempotency-key") ?? null;
    const created = await engine.createOperation("DEPOSIT", body, idem);
    const { op, commitment } = await engine.prepareDeposit(created);
    return c.json(
      {
        operationId: op.id,
        status: op.status,
        commitment,
        asset,
        poolAddress: contract.poolAddress,
        chainId: chain.chain.id,
      },
      201,
    );
  });

  // Non-custodial deposit — phase 2: the browser hands back the broadcast tx hash; the
  // server waits for the receipt, attaches the merkle leaf, and finalizes the note.
  const ConfirmSchema = z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) });
  app.post("/api/v1/deposits/:id/confirm", async (c) => {
    const { txHash } = ConfirmSchema.parse(await c.req.json());
    const op = await engine.confirmDeposit(c.req.param("id"), txHash);
    return c.json(sanitizeOperation(op));
  });

  // Generate a Talos owner keypair for receiving private transfers. The `ownerPublicKey`
  // is shared with senders; the `spendingKey` is the secret the recipient keeps to later
  // spend notes sent to that key. (Testnet/dev convenience — treat the spending key as a secret.)
  app.post("/api/v1/keys/generate", async (c) => {
    const sk = randomFieldElement();
    const ownerPublicKey = await deriveOwnerPubKey(sk);
    return c.json({ spendingKey: sk.toString(), ownerPublicKey: ownerPublicKey.toString() }, 201);
  });

  app.post("/api/v1/deposits", async (c) => submit(c, "DEPOSIT", DepositSchema.parse(await c.req.json())));
  app.post("/api/v1/splits", async (c) => submit(c, "SPLIT", SplitSchema.parse(await c.req.json())));
  app.post("/api/v1/merges", async (c) => submit(c, "MERGE", MergeSchema.parse(await c.req.json())));
  app.post("/api/v1/transfers", async (c) => submit(c, "TRANSFER", TransferSchema.parse(await c.req.json())));
  app.post("/api/v1/withdrawals", async (c) => submit(c, "WITHDRAW", WithdrawSchema.parse(await c.req.json())));

  // Guardrail: no generic blockchain execution endpoint exists by design (§31/§32).

  // --- Agent + Guard (Phase 5) ---
  // The Guard is the security boundary between the LLM agent and the Core mutations:
  // every agent action goes NL → Agent → Guard.execute → these same Core endpoints,
  // in-process (CoreClient replays requests against this app; no extra network hop).
  const reqFn = (path: string, init?: RequestInit) => Promise.resolve(app.request(path, init));
  const { identity, policy } = policyFromEnv();
  const audit = new InMemoryAuditLog();
  const llm = createLLMProvider();

  // The /guard/* routes use a default (unscoped) guard for direct calls from the UI.
  const defaultCore = new CoreClient(reqFn);
  app.route("/", createGuardApp(new TalosGuard(defaultCore, identity, policy, audit, logger), defaultCore));

  // /agent/message scopes everything to the connected wallet, so the agent reads that
  // wallet's notes/balance (never the whole server's) and acts only for that user.
  const AgentMessageSchema = z.object({
    message: z.string().min(1).max(2000),
    owner: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  });
  app.post("/agent/message", async (c) => {
    const { message, owner } = AgentMessageSchema.parse(await c.req.json());
    const scopedCore = new CoreClient(reqFn, owner?.toLowerCase());
    const guard = new TalosGuard(scopedCore, identity, policy, audit, logger);
    const agent = new TalosAgent(llm, { core: scopedCore, guard, logger, ...(owner ? { owner: owner.toLowerCase() } : {}) }, logger);
    return c.json(await agent.handle(message));
  });

  // --- Multi-agent trading (Phase 6) ---
  const addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
  const ownerParam = (c: Context<Env>): string => {
    const owner = c.req.query("owner");
    if (!owner || !/^0x[0-9a-fA-F]{40}$/.test(owner)) throw InvalidRequest("owner query param (wallet address) is required");
    return owner.toLowerCase();
  };

  app.get("/api/v1/agents", async (c) => c.json({ agents: await agents.listAgents(ownerParam(c)) }));
  // Only the Trading Agent owns a wallet — Research/Portfolio are read-only cognitive agents.
  app.post("/api/v1/agents", async (c) => {
    const body = z.object({ owner: addr, role: z.literal("TRADER"), name: z.string().max(80).optional() }).parse(await c.req.json());
    return c.json(await agents.getTradingAgent(body.owner), 201);
  });

  // Agent memory (preferences / decisions / history — never secrets). Defined before /:id.
  app.get("/api/v1/agents/memory", async (c) => {
    const owner = ownerParam(c);
    const [memories, count] = await Promise.all([agents.listMemory(owner, 50), agents.memoryCount(owner)]);
    return c.json({ count, memories });
  });
  app.post("/api/v1/agents/memory/clear", async (c) => {
    const { owner } = z.object({ owner: addr }).parse(await c.req.json());
    await agents.clearMemory(owner);
    return c.json({ ok: true });
  });
  app.delete("/api/v1/agents/memory/:id", async (c) => {
    await agents.forgetMemory(c.req.param("id"));
    return c.json({ ok: true });
  });

  app.get("/api/v1/agents/:id", async (c) => {
    const agent = await agents.getAgent(c.req.param("id"));
    if (!agent) throw OperationNotFound("agent not found");
    return c.json(agent);
  });
  app.get("/api/v1/agents/:id/receive-identity", async (c) => {
    const id = await agents.getReceiveIdentity(c.req.param("id"));
    if (!id) throw OperationNotFound("agent not found");
    return c.json(id);
  });
  app.post("/api/v1/agents/:id/transfer", async (c) => {
    const body = z
      .object({ owner: addr, toAgentId: z.string().optional(), toPublicKey: z.string().optional(), assetId: z.number().int().positive(), amount: z.string().regex(/^\d+$/) })
      .parse(await c.req.json());
    return c.json(await agents.transfer(body.owner, c.req.param("id"), body), 202);
  });

  app.get("/api/v1/portfolio", async (c) => c.json(await agents.getPortfolio(ownerParam(c))));
  app.get("/api/v1/portfolio/history", async (c) => c.json({ snapshots: await agents.portfolioHistory(ownerParam(c)) }));
  app.post("/api/v1/portfolio/target", async (c) => {
    const body = z.object({ owner: addr, allocations: z.record(z.number()) }).parse(await c.req.json());
    await agents.setTarget(body.owner, body.allocations);
    return c.json({ ok: true, allocations: body.allocations });
  });

  app.post("/api/v1/research", async (c) => {
    const body = z.object({ asset: z.string().min(1).max(20) }).parse(await c.req.json());
    return c.json(await agents.researchAsset(body.asset));
  });

  const tradeReq = z.object({ assetIn: z.string(), assetOut: z.string(), amount: z.string().regex(/^\d+$/), slippageBps: z.number().int().optional() });
  app.post("/api/v1/trades/quote", async (c) => c.json(await agents.quote(tradeReq.parse(await c.req.json()))));
  app.post("/api/v1/trades/simulate", async (c) => {
    const body = tradeReq.extend({ wallet: addr }).parse(await c.req.json());
    return c.json(await agents.simulate(body));
  });
  app.post("/api/v1/trades", async (c) => {
    const body = z.object({ owner: addr, assetIn: z.string(), assetOut: z.string(), amount: z.string().regex(/^\d+$/), maxSlippageBps: z.number().int().optional() }).parse(await c.req.json());
    const result = await agents.createTrade(body.owner, body);
    return c.json(result, result.decision === "REJECTED" ? 403 : 202);
  });
  app.get("/api/v1/trades", async (c) => c.json({ trades: await agents.listTrades(ownerParam(c)) }));
  app.get("/api/v1/trades/:id", async (c) => {
    const t = await agents.getTrade(c.req.param("id"));
    if (!t) throw OperationNotFound("trade not found");
    return c.json(t);
  });
  app.post("/api/v1/trades/:id/approve", async (c) => c.json(await agents.approveTrade(c.req.param("id")), 202));

  // Typed agent tools (prices + swaps). Read-only; never expose keys/RPC.
  app.get("/api/v1/tools", (c) => c.json({ tools: agents.listTools() }));
  app.post("/api/v1/tools/:name", async (c) => {
    const input = await c.req.json().catch(() => ({}));
    return c.json({ result: await agents.invokeTool(c.req.param("name"), input) });
  });

  app.post("/api/v1/orchestrate", async (c) => {
    const body = z.object({ owner: addr, message: z.string().min(1).max(2000) }).parse(await c.req.json());
    return c.json(await agents.orchestrate(body.owner, body.message));
  });

  return app;
}
