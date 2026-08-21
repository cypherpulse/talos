# Operations & Persistence

## Operation record (§26)

```text
operationId, type, status, idempotencyKey, noteIds, proofId, txHash,
errorCode, errorMessage, request, result, createdAt, updatedAt
```

The operation record is the primary application-level execution state and is the
resource clients poll.

## Database schema (§27, `src/database/schema.ts`)

| Table               | Purpose                                                      |
| ------------------- | ----------------------------------------------------------- |
| `notes`             | note lifecycle; **secrets encrypted** in `secret_blob`       |
| `operations`        | operation lifecycle; unique idempotency key; status index    |
| `proofs`            | generated proof packages                                     |
| `transactions`      | tx lifecycle; indexed by operation and tx hash               |
| `merkle_leaves`     | commitment ↔ leaf index ↔ root (unique on commitment)        |
| `nullifiers`        | spent nullifier set                                          |
| `blockchain_events` | processed events, unique on (tx_hash, log_index) for dedupe  |
| `idempotency_keys`  | idempotency key → operation id                               |
| `sync_state`        | synchronizer checkpoint                                      |

Indexes cover commitment, nullifier, tx_hash, operation_id, status, block_number.

## Note encryption at rest (§11)

`NoteEncryptionService` uses **AES-256-GCM** (Node crypto). The Postgres notes
repository encrypts `{ownerPubKey, secret, nonce, nullifierSecret}` into `secret_blob`;
`commitment`/`nullifier`/`value` are public on-chain values stored plainly for
indexing. The key comes from `NOTE_ENCRYPTION_KEY` and is never logged. Verified by
the integration test: the raw column never contains the plaintext secret.

## Repositories

The engine uses repository **ports** (`src/database/repositories.ts`). Two
implementations satisfy them: PostgreSQL/Drizzle (`postgres.ts`, authoritative
durable state) and in-memory (`memory.ts`, tests). PostgreSQL is never the source of
cryptographic truth.

## Migrations

`pnpm db:generate` (drizzle-kit) emits versioned SQL; `pnpm db:migrate` bootstraps a
fresh database with the idempotent DDL in `src/database/migrate.ts`.
