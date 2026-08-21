import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * PostgreSQL schema (Phase 4 §27) via Drizzle. Field elements are stored as decimal
 * strings (`text`). Note secrets are NOT stored here in plaintext — the notes table
 * keeps them in an encrypted `secretBlob` (see the Postgres notes repository);
 * commitments/nullifiers are public on-chain values and are stored plainly for
 * indexing. PostgreSQL is the authoritative durable state, never the crypto truth.
 */

export const notes = pgTable(
  "notes",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id").notNull(),
    value: text("value").notNull(),
    commitment: text("commitment").notNull(),
    nullifier: text("nullifier").notNull().default(""),
    state: text("state").notNull(),
    leafIndex: integer("leaf_index"),
    secretBlob: text("secret_blob").notNull(),
    // Lowercased wallet address that shielded/owns this note (per-user scoping). Null
    // for legacy/unscoped notes.
    owner: text("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    commitmentIdx: uniqueIndex("notes_commitment_idx").on(t.commitment),
    nullifierIdx: index("notes_nullifier_idx").on(t.nullifier),
    stateIdx: index("notes_state_idx").on(t.state),
  }),
);

export const operations = pgTable(
  "operations",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    status: text("status").notNull(),
    idempotencyKey: text("idempotency_key"),
    noteIds: jsonb("note_ids").notNull().$type<string[]>().default([]),
    proofId: text("proof_id"),
    txHash: text("tx_hash"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    request: jsonb("request").notNull().$type<Record<string, unknown>>(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idempotencyIdx: uniqueIndex("operations_idempotency_idx").on(t.idempotencyKey),
    statusIdx: index("operations_status_idx").on(t.status),
  }),
);

export const proofs = pgTable("proofs", {
  id: text("id").primaryKey(),
  operation: text("operation").notNull(),
  circuit: text("circuit").notNull(),
  proof: jsonb("proof").notNull(),
  publicSignals: jsonb("public_signals").notNull().$type<string[]>(),
  verificationKeyId: text("verification_key_id").notNull(),
  generatedAt: text("generated_at").notNull(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    operationId: text("operation_id").notNull(),
    txHash: text("tx_hash"),
    chainId: integer("chain_id").notNull(),
    from: text("from").notNull(),
    to: text("to").notNull(),
    nonce: integer("nonce"),
    status: text("status").notNull(),
    blockNumber: integer("block_number"),
    blockHash: text("block_hash"),
    gasUsed: text("gas_used"),
    effectiveGasPrice: text("effective_gas_price"),
    confirmations: integer("confirmations").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    operationIdx: index("transactions_operation_idx").on(t.operationId),
    txHashIdx: index("transactions_tx_hash_idx").on(t.txHash),
  }),
);

export const merkleLeaves = pgTable(
  "merkle_leaves",
  {
    leafIndex: integer("leaf_index").primaryKey(),
    commitment: text("commitment").notNull(),
    root: text("root").notNull(),
    blockNumber: integer("block_number").notNull(),
    txHash: text("tx_hash").notNull(),
  },
  (t) => ({
    commitmentIdx: uniqueIndex("merkle_leaves_commitment_idx").on(t.commitment),
  }),
);

export const nullifiers = pgTable("nullifiers", {
  nullifier: text("nullifier").primaryKey(),
  blockNumber: integer("block_number").notNull(),
  txHash: text("tx_hash").notNull(),
});

export const blockchainEvents = pgTable(
  "blockchain_events",
  {
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: integer("block_number").notNull(),
    blockHash: text("block_hash").notNull(),
    name: text("name").notNull(),
    data: jsonb("data").notNull().$type<Record<string, unknown>>(),
  },
  (t) => ({
    pk: uniqueIndex("blockchain_events_pk").on(t.txHash, t.logIndex),
    blockIdx: index("blockchain_events_block_idx").on(t.blockNumber),
  }),
);

export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  operationId: text("operation_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Singleton key/value for synchronizer checkpoints. */
export const syncState = pgTable("sync_state", {
  key: text("key").primaryKey(),
  value: integer("value").notNull(),
});
