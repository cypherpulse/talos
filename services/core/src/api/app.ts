import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { z, ZodError } from "zod";
import type { Services } from "../services.js";
import type { Logger } from "../observability/logger.js";
import { isTalosError, OperationNotFound } from "../errors/index.js";
import { toNotePublic, type OperationRecord, type OperationType } from "../domain/types.js";
import { requestId, rateLimit } from "./middleware.js";
import { DepositSchema, MergeSchema, SplitSchema, TransferSchema, WithdrawSchema } from "./schemas.js";
import { loadAssets } from "../domain/assets.js";
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
  const { engine, dispatcher, repos, chain, contract, proofs, logger } = services;
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
  const core = new CoreClient((path, init) => Promise.resolve(app.request(path, init)));
  const { identity, policy } = policyFromEnv();
  const guard = new TalosGuard(core, identity, policy, new InMemoryAuditLog(), logger);
  const agent = new TalosAgent(createLLMProvider(), { core, guard, logger }, logger);

  app.route("/", createGuardApp(guard, core));

  const AgentMessageSchema = z.object({ message: z.string().min(1).max(2000) });
  app.post("/agent/message", async (c) => {
    const { message } = AgentMessageSchema.parse(await c.req.json());
    return c.json(await agent.handle(message));
  });

  return app;
}
