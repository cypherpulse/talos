# Data Flow

This document traces how data moves through Talos. It describes the **intended**
end-state so later phases have a fixed target. None of it is implemented in Phase 1.

## Actors and stores

- **Agent** (`apps/agent`) — runs the LLM, produces intents, holds a testnet key.
- **Talos Guard** — deterministic policy gate between intent and action.
- **ZK Service** (`packages/zk` + `circuits/`) — builds witnesses and Groth16 proofs.
- **Relayer** (`services/relayer`) — submits proof-carrying transactions to X Layer.
- **Indexer** (`services/indexer`) — reads chain events into PostgreSQL.
- **PostgreSQL** — derived index of notes/commitments/nullifiers (not authoritative).
- **Redis** — cache and job queue.
- **X Layer** — the authoritative ledger (`contracts/`).

## Write path (agent moves capital)

```text
1. LLM proposes            → intent (structured, validated by Zod)
2. Talos Guard evaluates   → allow  → deterministic action
                             deny   → STOP (no proof, no tx)
3. Note Management selects input notes and derives output notes (client-side secrets)
4. ZK Service builds a witness and generates a Groth16 proof
5. Relayer submits { proof, public signals } to the TalosPool on X Layer
6. TalosVerifier verifies the proof on-chain; TalosPool updates commitments/nullifiers
7. Indexer observes the emitted events and updates PostgreSQL
```

Authorization happens at steps 2 and 6 — **deterministic policy** off-chain and
**proof verification** on-chain. The LLM's involvement ends at step 1.

## Read path (agent/UI observes state)

```text
Frontend / Agent → SDK → Talos Core Server → PostgreSQL (fast, derived reads)
                                           ↘ X Layer (authoritative reads when needed)
```

Reads are served from the index for speed; anything security-sensitive is confirmed
against X Layer.

## Secrets and privacy boundaries

- Note secrets live **client-side** in the note model; they are used to build
  witnesses and are **never logged** and never persisted in plaintext.
- Only commitments and nullifiers (hiding values) reach the chain and the index.
- Private keys come from the environment at runtime, never from the repo or the DB.

## Trust and rebuild

If PostgreSQL is lost or corrupted, it is **rebuilt** by re-indexing X Layer from
genesis (or a checkpoint). No authoritative data is lost, because the index holds
no truth the chain does not already hold.
