# Architecture Overview

Talos is the **private execution layer for autonomous AI agents**: it lets an AI
agent manage on-chain capital without revealing balances, amounts, or transfer
graphs, using ZK-private notes and Groth16 proofs on X Layer.

The defining architectural rule: **the LLM is never the cryptographic authority.**
The model *proposes*; deterministic code and zero-knowledge proofs *authorize*.

## Layered architecture (frozen)

```text
Frontend
    │
    ▼
API / SDK
    │
    ▼
Talos Core Server
    │
    ▼
Protocol Engine
    ├── Note Management        (private note model: commitments, secrets)
    ├── ZK Service             (Groth16 witness/proof generation & verification)
    ├── Agent / Policy Engine  (Talos Guard: deterministic authorization)
    └── X Layer Service        (chain reads/writes, tx submission)
              │
              ▼
          X Layer
```

Each protocol-engine module maps onto a workspace in this monorepo:

| Module               | Workspace(s)                                      |
| -------------------- | ------------------------------------------------- |
| Note Management      | `packages/notes`, `packages/crypto`               |
| ZK Service           | `packages/zk`, `circuits/`                        |
| Agent / Policy Engine| `apps/agent` (Talos Guard added later)            |
| X Layer Service      | `services/relayer`, `services/indexer`, `contracts/` |
| Core Server          | `services/core` (Phase 4) — orchestration + APIs   |
| API / SDK            | `packages/sdk`                                     |
| Frontend             | `apps/web` (Phase 10)                             |

The **Talos Core Server** (`services/core`) is the execution/orchestration layer that
turns operation requests into real ZK proofs and X Layer transactions with durable
state, idempotency, and a controlled execution boundary. See
[`../server/architecture.md`](../server/architecture.md).

## The authorization pipeline (frozen)

```text
LLM
 │  proposes an intent (natural-language / structured goal)
 ▼
Intent
 │  a typed, validated request — not yet authorized
 ▼
Talos Guard
 │  deterministic policy checks (limits, allow-lists, invariants)
 ▼
Deterministic Action
 │  an exact, parameterized protocol operation
 ▼
ZK Proof
 │  Groth16 proof that the action is valid over private state
 ▼
X Layer
    proof verified on-chain; state transition committed
```

If the Guard rejects an intent, no action, proof, or transaction is produced. The
LLM cannot bypass the Guard, cannot forge a proof, and cannot move funds by
persuasion — only a valid proof against on-chain state moves value.

## Source of cryptographic truth

The authoritative state is:

```text
ZK proof verification  +  X Layer contract state
```

PostgreSQL and Redis are **derived, rebuildable** infrastructure — an index and a
cache/queue. They are never treated as the source of cryptographic truth. If the
off-chain index disagrees with the chain, the chain wins and the index is rebuilt.

## Phase 1 scope

Phase 1 establishes the repository, tooling, workspace boundaries, configuration,
and these architecture docs. **No protocol functionality is implemented.** See the
root `README.md` and the ADRs in `../adr/` for the frozen decisions, and the phase
notes in each workspace for what lands when.
