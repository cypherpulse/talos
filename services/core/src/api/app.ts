import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { ZodError } from "zod";
import type { Services } from "../services.js";
import type { Logger } from "../observability/logger.js";
import { isTalosError, OperationNotFound } from "../errors/index.js";
import { toNotePublic, type OperationRecord, type OperationType } from "../domain/types.js";
import { requestId, rateLimit } from "./middleware.js";
import { DepositSchema, MergeSchema, SplitSchema, TransferSchema, WithdrawSchema } from "./schemas.js";

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
    const notes = await repos.notes.list(200);
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

  app.post("/api/v1/deposits", async (c) => submit(c, "DEPOSIT", DepositSchema.parse(await c.req.json())));
  app.post("/api/v1/splits", async (c) => submit(c, "SPLIT", SplitSchema.parse(await c.req.json())));
  app.post("/api/v1/merges", async (c) => submit(c, "MERGE", MergeSchema.parse(await c.req.json())));
  app.post("/api/v1/transfers", async (c) => submit(c, "TRANSFER", TransferSchema.parse(await c.req.json())));
  app.post("/api/v1/withdrawals", async (c) => submit(c, "WITHDRAW", WithdrawSchema.parse(await c.req.json())));

  // Guardrail: no generic blockchain execution endpoint exists by design (§31/§32).

  return app;
}
