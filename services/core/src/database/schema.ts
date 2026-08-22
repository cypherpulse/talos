import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, vector } from "drizzle-orm/pg-core";

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

// ---------------------------------------------------------------------------
// Phase 6 — multi-agent trading. Private key material is stored ONLY in the
// encrypted *_key_blob columns (AES-256-GCM), never in plaintext.
// ---------------------------------------------------------------------------

export const agents = pgTable(
  "agents",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(), // user wallet that owns this agent (lowercased)
    role: text("role").notNull(), // RESEARCH | TRADER | PORTFOLIO
    name: text("name").notNull(),
    walletAddress: text("wallet_address").notNull(), // agent EOA on X Layer
    walletKeyBlob: text("wallet_key_blob").notNull(), // encrypted EOA private key
    talosPublicKey: text("talos_public_key").notNull(), // owner pub key (decimal) for receiving notes
    spendingKeyBlob: text("spending_key_blob").notNull(), // encrypted Talos spending key
    status: text("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerRoleIdx: uniqueIndex("agents_owner_role_idx").on(t.owner, t.role),
    ownerIdx: index("agents_owner_idx").on(t.owner),
  }),
);

export const tradeIntents = pgTable("trade_intents", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  owner: text("owner").notNull(),
  assetIn: text("asset_in").notNull(),
  assetOut: text("asset_out").notNull(),
  amount: text("amount").notNull(),
  maxSlippageBps: integer("max_slippage_bps").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tradeExecutions = pgTable(
  "trade_executions",
  {
    id: text("id").primaryKey(),
    intentId: text("intent_id").notNull(),
    agentId: text("agent_id").notNull(),
    owner: text("owner").notNull(),
    provider: text("provider").notNull(),
    fromAmount: text("from_amount").notNull(),
    toAmount: text("to_amount").notNull().default("0"),
    valueUsd: text("value_usd").notNull().default("0"),
    status: text("status").notNull(),
    txHash: text("tx_hash"),
    failReason: text("fail_reason"),
    quote: jsonb("quote").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ ownerIdx: index("trade_executions_owner_idx").on(t.owner) }),
);

export const agentTransfers = pgTable("agent_transfers", {
  id: text("id").primaryKey(),
  fromAgentId: text("from_agent_id").notNull(),
  toPublicKey: text("to_public_key").notNull(),
  assetId: integer("asset_id").notNull(),
  amount: text("amount").notNull(),
  operationId: text("operation_id"),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const portfolioSnapshots = pgTable(
  "portfolio_snapshots",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    totalValueUsd: text("total_value_usd").notNull(),
    positions: jsonb("positions").notNull().$type<unknown[]>(),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ ownerIdx: index("portfolio_snapshots_owner_idx").on(t.owner) }),
);

export const targetAllocations = pgTable("target_allocations", {
  owner: text("owner").primaryKey(),
  allocations: jsonb("allocations").notNull().$type<Record<string, number>>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Agent memory (Phase 6): durable preferences, decisions and history. NEVER stores key
 * material or secrets. `embedding` is reserved for pgvector semantic search; retrieval
 * currently ranks by importance + recency, so no extension is required to run.
 */
export const agentMemory = pgTable(
  "agent_memory",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    agentId: text("agent_id"),
    memoryType: text("memory_type").notNull(), // WORKING | SEMANTIC | EPISODIC
    content: text("content").notNull(),
    asset: text("asset"),
    importance: integer("importance").notNull().default(1),
    embedding: vector("embedding", { dimensions: 1536 }), // pgvector semantic memory
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index("agent_memory_owner_idx").on(t.owner),
    typeIdx: index("agent_memory_type_idx").on(t.memoryType),
  }),
);
