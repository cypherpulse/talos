import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createDb } from "../../src/database/connection.js";
import { migrate } from "../../src/database/migrate.js";
import { createPostgresRepositories } from "../../src/database/postgres.js";
import { NoteEncryptionService } from "../../src/notes/encryption.js";
import type { Repositories } from "../../src/database/repositories.js";
import type { Note, OperationRecord } from "../../src/domain/types.js";

const URL = process.env.TALOS_TEST_DATABASE_URL;
const KEY = "0x" + "ab".repeat(32);

function note(id: string): Note {
  return {
    id,
    assetId: "1",
    value: "100",
    ownerPubKey: "111",
    secret: "SECRET_222",
    nonce: "333",
    nullifierSecret: "444",
    commitment: `c_${id}`,
    nullifier: `n_${id}`,
    state: "CREATED",
    leafIndex: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function op(id: string, key: string | null): OperationRecord {
  return {
    id,
    type: "DEPOSIT",
    status: "CREATED",
    idempotencyKey: key,
    noteIds: [],
    proofId: null,
    txHash: null,
    errorCode: null,
    errorMessage: null,
    request: { amount: "100" },
    result: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe.skipIf(!URL)("PostgreSQL repositories (integration)", () => {
  let repos: Repositories;
  let raw: postgres.Sql;

  beforeAll(async () => {
    await migrate(URL!);
    raw = postgres(URL!, { max: 1 });
    // Clean slate.
    for (const t of ["notes", "operations", "merkle_leaves", "nullifiers", "blockchain_events", "idempotency_keys"]) {
      await raw.unsafe(`TRUNCATE ${t}`);
    }
    const { db } = createDb(URL!);
    repos = createPostgresRepositories(db, new NoteEncryptionService(KEY));
  });

  afterAll(async () => {
    await raw?.end();
  });

  it("stores note secrets ENCRYPTED (never plaintext) and round-trips them", async () => {
    await repos.notes.create(note("n1"));
    const got = await repos.notes.get("n1");
    expect(got?.secret).toBe("SECRET_222");

    // The raw column must not contain the plaintext secret.
    const [row] = await raw`SELECT secret_blob FROM notes WHERE id = 'n1'`;
    expect(row!.secret_blob).not.toContain("SECRET_222");
  });

  it("finds notes by commitment and updates state", async () => {
    const found = await repos.notes.getByCommitment("c_n1");
    expect(found?.id).toBe("n1");
    await repos.notes.update({ ...note("n1"), state: "AVAILABLE", leafIndex: 5 });
    expect((await repos.notes.get("n1"))?.state).toBe("AVAILABLE");
  });

  it("enforces idempotency at the operations layer", async () => {
    await repos.operations.create(op("op1", "key-1"));
    expect((await repos.operations.getByIdempotencyKey("key-1"))?.id).toBe("op1");
  });

  it("tracks merkle leaves and nullifiers", async () => {
    await repos.merkle.insertLeaf({ leafIndex: 0, commitment: "cc", root: "rr", blockNumber: 1, txHash: "0xabc" });
    await repos.merkle.insertLeaf({ leafIndex: 0, commitment: "cc", root: "rr", blockNumber: 1, txHash: "0xabc" }); // dedupe
    expect(await repos.merkle.getLeafIndex("cc")).toBe(0);
    expect(await repos.merkle.count()).toBe(1);

    await repos.nullifiers.markSpent("nf1", 1, "0xabc");
    expect(await repos.nullifiers.isSpent("nf1")).toBe(true);
    expect(await repos.nullifiers.isSpent("nf2")).toBe(false);
  });

  it("dedupes blockchain events", async () => {
    const e = { txHash: "0xd", logIndex: 0, blockNumber: 1, blockHash: "0xb", name: "CommitmentInserted", data: {} };
    expect(await repos.events.record(e)).toBe(true);
    expect(await repos.events.record(e)).toBe(false);
    await repos.events.setLastProcessedBlock(42);
    expect(await repos.events.getLastProcessedBlock()).toBe(42);
  });
});
