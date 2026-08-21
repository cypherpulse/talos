import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Hono } from "hono";
import { startAnvil, deployAll, ANVIL_PK, CHAIN_ID, type Deployment } from "./harness.js";
import { createApp } from "../../src/api/app.js";
import { buildServices, type Services } from "../../src/services.js";
import { createInMemoryRepositories } from "../../src/database/memory.js";
import { nullLogger } from "../../src/observability/logger.js";
import { deriveOwnerPubKey } from "../../src/crypto/poseidon.js";
import { randomFieldElement } from "../../src/crypto/random.js";
import type { TalosConfig } from "../../src/config/index.js";

const REPO_ROOT = join(process.cwd(), "..", "..");
const PORT = 8548;
const RECIPIENT = "0x00000000000000000000000000000000deadbeef";

let deployment: Deployment;
let services: Services;
let app: Hono<{ Variables: { requestId: string } }>;

async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

async function get(path: string): Promise<any> {
  const res = await app.request(path);
  return res.json();
}

/** Poll an operation until it reaches a terminal state. */
async function poll(operationId: string, timeoutMs = 150_000): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const op = await get(`/api/v1/operations/${operationId}`);
    if (["FINALIZED", "FAILED", "REJECTED", "CANCELLED", "EXPIRED"].includes(op.status)) return op;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`operation ${operationId} did not finish in time`);
}

async function runOp(path: string, body: unknown): Promise<any> {
  const { status, json } = await post(path, body);
  expect(status).toBe(202);
  const op = await poll(json.operationId);
  expect(op.status, `op ${path} error: ${op.errorCode} ${op.errorMessage}`).toBe("FINALIZED");
  return op;
}

beforeAll(async () => {
  const proc = await startAnvil(PORT);
  deployment = await deployAll(PORT, proc);

  const config: TalosConfig = {
    nodeEnv: "test",
    port: 0,
    databaseUrl: "postgres://unused",
    redisUrl: "redis://unused",
    chain: {
      rpcUrl: deployment.rpcUrl,
      chainId: CHAIN_ID,
      confirmationsRequired: 1,
      pollingIntervalMs: 100,
    },
    contracts: { talosPool: deployment.pool, testAsset: deployment.asset },
    signerPrivateKey: ANVIL_PK,
    noteEncryptionKey: "0x" + "11".repeat(32),
    circuitArtifactsDir: join(REPO_ROOT, "circuits", "build"),
    runWorkers: false,
  };

  services = buildServices({ config, repos: createInMemoryRepositories(), logger: nullLogger() });
  app = createApp(services);
}, 180_000);

afterAll(() => deployment?.stop());

describe("Talos Core E2E (real proofs, real chain)", () => {
  it("health and readiness report OK", async () => {
    const ready = await get("/ready");
    expect(ready.checks.chain).toBe(true);
    expect(ready.checks.artifacts).toBe(true);
    expect(ready.checks.pool).toBe(true);
  });

  it(
    "deposit → split → merge → withdraw settles correctly on-chain",
    async () => {
      // 1. Deposit 100.
      const dep = await runOp("/api/v1/deposits", { amount: "100" });
      const noteA = dep.result.noteId as string;
      expect(await services.contract.balanceOf(deployment.pool)).toBe(100n);
      const noteAView = await get(`/api/v1/notes/${noteA}`);
      expect(noteAView.state).toBe("AVAILABLE");
      expect(noteAView.value).toBe("100");

      // 2. Split 100 -> 60 + 40.
      const split = await runOp("/api/v1/splits", { noteId: noteA, amount1: "60", amount2: "40" });
      const [noteB, noteC] = split.result.outputNoteIds as [string, string];
      expect((await get(`/api/v1/notes/${noteA}`)).state).toBe("SPENT");

      // 3. Merge 60 + 40 -> 100.
      const merge = await runOp("/api/v1/merges", { noteId1: noteB, noteId2: noteC });
      const noteD = merge.result.outputNoteId as string;
      expect((await get(`/api/v1/notes/${noteB}`)).state).toBe("SPENT");
      expect((await get(`/api/v1/notes/${noteC}`)).state).toBe("SPENT");

      // 4. Withdraw 100 -> recipient.
      const before = await services.contract.balanceOf(RECIPIENT as `0x${string}`);
      const wd = await runOp("/api/v1/withdrawals", { noteId: noteD, recipient: RECIPIENT });
      expect(wd.result.amount).toBe("100");
      const after = await services.contract.balanceOf(RECIPIENT as `0x${string}`);
      expect(after - before).toBe(100n);
      expect(await services.contract.balanceOf(deployment.pool)).toBe(0n);
      expect((await get(`/api/v1/notes/${noteD}`)).state).toBe("SPENT");
    },
    180_000,
  );

  it(
    "private transfer to a recipient key succeeds without exposing recipient secrets",
    async () => {
      const dep = await runOp("/api/v1/deposits", { amount: "50" });
      const noteE = dep.result.noteId as string;

      const recipientSk = randomFieldElement();
      const recipientPub = (await deriveOwnerPubKey(recipientSk)).toString();

      const transfer = await runOp("/api/v1/transfers", {
        noteId: noteE,
        amount1: "20",
        amount2: "30",
        recipientOwnerPubKey: recipientPub,
      });
      // Only public data is returned; no recipient secret/nonce fields.
      expect(transfer.result.recipientCommitment).toBeDefined();
      expect(JSON.stringify(transfer.result)).not.toContain("secret");
      expect((await get(`/api/v1/notes/${noteE}`)).state).toBe("SPENT");
    },
    180_000,
  );

  it("rejects a double-spend of an already-spent note", async () => {
    // From the first test, noteA is spent; splitting it again must fail.
    const notes = (await get("/api/v1/notes")).notes as Array<{ id: string; state: string; value: string }>;
    const spent = notes.find((n) => n.state === "SPENT" && n.value === "100");
    expect(spent).toBeDefined();
    // Valid split amounts (60+40=100) so it reaches the spend lock, which rejects it.
    const { json } = await post("/api/v1/splits", { noteId: spent!.id, amount1: "60", amount2: "40" });
    const op = await poll(json.operationId);
    expect(op.status).toBe("REJECTED");
    expect(op.errorCode).toBe("NOTE_ALREADY_SPENT");
  });
});
