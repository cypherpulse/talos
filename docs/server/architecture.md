# Talos Core Server — Architecture

The Core Server (`services/core`) is the **execution and orchestration layer** for
Talos: it turns operation requests into real ZK proofs and X Layer transactions, and
maintains durable operational state. It is an orchestrator, **not** the cryptographic
authority.

## Authority hierarchy (frozen)

```text
Database (PostgreSQL)  = local operational state (derived, rebuildable)
Core Server            = orchestration
ZK circuit / proof     = cryptographic validity
TalosPool (X Layer)    = authoritative on-chain state
X Layer                = settlement
```

The database never overrides blockchain truth. Before every spend the engine checks
the authoritative contract state (`isKnownRoot`, `isNullifierSpent`).

## Modules

```text
services/core/src/
├── api/           Hono app, routes, schemas, middleware (request-id, CORS, rate limit)
├── config/        Zod-validated configuration
├── errors/        typed error model (stable codes)
├── observability/ structured, secret-redacting logger
├── domain/        operation & note state machines, core types
├── crypto/        Poseidon + note derivation + Merkle tree (mirrors Phase 3)
├── notes/         NoteEncryptionService (AES-256-GCM) + NoteManager (lifecycle)
├── proofs/        ProofService (real snarkjs Groth16) + witness builders
├── merkle/        MerkleSynchronizer (event-driven, reorg-safe)
├── blockchain/    viem X Layer client + SignerProvider
├── contracts/     typed TalosPool / ERC-20 clients + ABIs
├── transactions/  TransactionManager (lifecycle, confirmations)
├── execution/     ExecutionEngine + dispatcher + distributed locks
├── database/      repository ports + Postgres (Drizzle) + in-memory + schema/migrate
├── workers/       BullMQ queues + worker + dispatcher
└── index.ts       server bootstrap
```

## Data flow

```text
HTTP → createOperation (idempotent) → dispatch (BullMQ / inline)
     → ExecutionEngine.runOperation:
         VALIDATING → PROVING (snarkjs) → PROOF_READY
         → READY_TO_SUBMIT → SUBMITTING (TransactionManager)
         → SUBMITTED → CONFIRMING → CONFIRMED
         → reconcile (MerkleSynchronizer, note lifecycle) → FINALIZED
```

The HTTP request returns an `operationId` immediately (202); clients poll
`GET /api/v1/operations/:id`.

## Testability

The engine depends on repository **ports**, so it runs identically over PostgreSQL
(production) and an in-memory store (tests). The end-to-end test drives the full
stack against a local Anvil with **real Groth16 proofs and the real Poseidon
contract** — no mock cryptography (`test/e2e`).
