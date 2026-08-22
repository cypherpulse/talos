import postgres from "postgres";
import { loadConfig } from "../config/index.js";
import { createLogger } from "../observability/logger.js";

/**
 * Idempotent schema bootstrap. Applies the Phase 4 §27 tables + indexes. This mirrors
 * `src/database/schema.ts`; `pnpm db:generate` (drizzle-kit) is the canonical way to
 * produce versioned migration SQL, and this DDL bootstraps a fresh database.
 */
const DDL = `
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS notes (
  id text PRIMARY KEY,
  asset_id text NOT NULL,
  value text NOT NULL,
  commitment text NOT NULL,
  nullifier text NOT NULL DEFAULT '',
  state text NOT NULL,
  leaf_index integer,
  secret_blob text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Per-user scoping: the wallet that shielded/owns the note (added post-v1).
ALTER TABLE notes ADD COLUMN IF NOT EXISTS owner text;
CREATE UNIQUE INDEX IF NOT EXISTS notes_commitment_idx ON notes(commitment);
CREATE INDEX IF NOT EXISTS notes_nullifier_idx ON notes(nullifier);
CREATE INDEX IF NOT EXISTS notes_state_idx ON notes(state);
CREATE INDEX IF NOT EXISTS notes_owner_idx ON notes(owner);

CREATE TABLE IF NOT EXISTS operations (
  id text PRIMARY KEY,
  type text NOT NULL,
  status text NOT NULL,
  idempotency_key text,
  note_ids jsonb NOT NULL DEFAULT '[]',
  proof_id text,
  tx_hash text,
  error_code text,
  error_message text,
  request jsonb NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS operations_idempotency_idx ON operations(idempotency_key);
CREATE INDEX IF NOT EXISTS operations_status_idx ON operations(status);

CREATE TABLE IF NOT EXISTS proofs (
  id text PRIMARY KEY,
  operation text NOT NULL,
  circuit text NOT NULL,
  proof jsonb NOT NULL,
  public_signals jsonb NOT NULL,
  verification_key_id text NOT NULL,
  generated_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id text PRIMARY KEY,
  operation_id text NOT NULL,
  tx_hash text,
  chain_id integer NOT NULL,
  "from" text NOT NULL,
  "to" text NOT NULL,
  nonce integer,
  status text NOT NULL,
  block_number integer,
  block_hash text,
  gas_used text,
  effective_gas_price text,
  confirmations integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transactions_operation_idx ON transactions(operation_id);
CREATE INDEX IF NOT EXISTS transactions_tx_hash_idx ON transactions(tx_hash);

CREATE TABLE IF NOT EXISTS merkle_leaves (
  leaf_index integer PRIMARY KEY,
  commitment text NOT NULL,
  root text NOT NULL,
  block_number integer NOT NULL,
  tx_hash text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS merkle_leaves_commitment_idx ON merkle_leaves(commitment);

CREATE TABLE IF NOT EXISTS nullifiers (
  nullifier text PRIMARY KEY,
  block_number integer NOT NULL,
  tx_hash text NOT NULL
);

CREATE TABLE IF NOT EXISTS blockchain_events (
  tx_hash text NOT NULL,
  log_index integer NOT NULL,
  block_number integer NOT NULL,
  block_hash text NOT NULL,
  name text NOT NULL,
  data jsonb NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS blockchain_events_pk ON blockchain_events(tx_hash, log_index);
CREATE INDEX IF NOT EXISTS blockchain_events_block_idx ON blockchain_events(block_number);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key text PRIMARY KEY,
  operation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_state (
  key text PRIMARY KEY,
  value integer NOT NULL
);

-- Phase 6 — multi-agent trading. Key material lives only in encrypted *_key_blob columns.
CREATE TABLE IF NOT EXISTS agents (
  id text PRIMARY KEY,
  owner text NOT NULL,
  role text NOT NULL,
  name text NOT NULL,
  wallet_address text NOT NULL,
  wallet_key_blob text NOT NULL,
  talos_public_key text NOT NULL,
  spending_key_blob text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agents_owner_role_idx ON agents(owner, role);
CREATE INDEX IF NOT EXISTS agents_owner_idx ON agents(owner);

CREATE TABLE IF NOT EXISTS trade_intents (
  id text PRIMARY KEY,
  agent_id text NOT NULL,
  owner text NOT NULL,
  asset_in text NOT NULL,
  asset_out text NOT NULL,
  amount text NOT NULL,
  max_slippage_bps integer NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trade_executions (
  id text PRIMARY KEY,
  intent_id text NOT NULL,
  agent_id text NOT NULL,
  owner text NOT NULL,
  provider text NOT NULL,
  from_amount text NOT NULL,
  to_amount text NOT NULL DEFAULT '0',
  value_usd text NOT NULL DEFAULT '0',
  status text NOT NULL,
  tx_hash text,
  fail_reason text,
  quote jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trade_executions_owner_idx ON trade_executions(owner);

CREATE TABLE IF NOT EXISTS agent_transfers (
  id text PRIMARY KEY,
  from_agent_id text NOT NULL,
  to_public_key text NOT NULL,
  asset_id integer NOT NULL,
  amount text NOT NULL,
  operation_id text,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id text PRIMARY KEY,
  owner text NOT NULL,
  total_value_usd text NOT NULL,
  positions jsonb NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portfolio_snapshots_owner_idx ON portfolio_snapshots(owner);

CREATE TABLE IF NOT EXISTS target_allocations (
  owner text PRIMARY KEY,
  allocations jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Agent memory (preferences / decisions / history). No secrets. pgvector-ready via embedding col.
CREATE TABLE IF NOT EXISTS agent_memory (
  id text PRIMARY KEY,
  owner text NOT NULL,
  agent_id text,
  memory_type text NOT NULL,
  content text NOT NULL,
  asset text,
  importance integer NOT NULL DEFAULT 1,
  embedding vector(1536),
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Migrate any earlier jsonb embedding column to the pgvector type.
ALTER TABLE agent_memory DROP COLUMN IF EXISTS embedding;
ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS agent_memory_owner_idx ON agent_memory(owner);
CREATE INDEX IF NOT EXISTS agent_memory_type_idx ON agent_memory(memory_type);
`;

export async function migrate(url: string): Promise<void> {
  const client = postgres(url, { max: 1 });
  try {
    await client.unsafe(DDL);
  } finally {
    await client.end();
  }
}

// Allow `tsx src/database/migrate.ts` as a CLI.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("migrate.ts")) {
  const config = loadConfig();
  const logger = createLogger({ service: "talos-core", component: "migrate" });
  migrate(config.databaseUrl)
    .then(() => {
      logger.info("migration complete");
      process.exit(0);
    })
    .catch((e) => {
      logger.error("migration failed", { error: String(e) });
      process.exit(1);
    });
}
