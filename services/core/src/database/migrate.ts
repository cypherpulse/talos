import postgres from "postgres";
import { loadConfig } from "../config/index.js";
import { createLogger } from "../observability/logger.js";

/**
 * Idempotent schema bootstrap. Applies the Phase 4 §27 tables + indexes. This mirrors
 * `src/database/schema.ts`; `pnpm db:generate` (drizzle-kit) is the canonical way to
 * produce versioned migration SQL, and this DDL bootstraps a fresh database.
 */
const DDL = `
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
CREATE UNIQUE INDEX IF NOT EXISTS notes_commitment_idx ON notes(commitment);
CREATE INDEX IF NOT EXISTS notes_nullifier_idx ON notes(nullifier);
CREATE INDEX IF NOT EXISTS notes_state_idx ON notes(state);

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
