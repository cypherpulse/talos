# Failure Recovery

The system must recover from failures **without creating an unintended second
blockchain spend** (§37). The core invariant: one note ⇒ one nullifier ⇒ at most one
successful spend, enforced on-chain by the pool's nullifier set and off-chain by the
engine.

## Mechanisms

- **Idempotent operations.** `runOperation` is a no-op unless the operation is
  `CREATED`. A retried worker job re-loads the record and does not re-execute a
  running/terminal operation.
- **Idempotency keys.** A repeated request with the same `Idempotency-Key` returns the
  original operation instead of creating a new one.
- **Authoritative pre-checks.** Before submitting, the engine verifies the nullifier
  is unspent **on-chain**; if a prior attempt already consumed it, the new attempt is
  rejected rather than double-spending.
- **Lock + release.** A note is `PENDING_SPEND` during an operation. If the operation
  fails **before** the nullifier is consumed on-chain, the lock is released and the
  note returns to `AVAILABLE`. If the chain confirmed the spend, the note is `SPENT`.
- **Confirmation, not submission.** An operation is only `CONFIRMED` after the
  configured confirmation depth and a successful receipt; a reverted tx yields
  `FAILED`.
- **Reorg-safe Merkle sync.** The synchronizer reconciles the full commitment set from
  chain events and retries until its computed root matches the authoritative on-chain
  root, so it never appends duplicate leaves or diverges after a reorg.

## Failure scenarios and behavior

| Failure                         | Behavior                                             |
| ------------------------------- | ---------------------------------------------------- |
| RPC unavailable                 | typed `BLOCKCHAIN_UNAVAILABLE`; operation FAILED; retriable |
| Transaction reverted            | `TRANSACTION_CONFIRMATION_FAILED`; note lock released |
| Transaction dropped             | lifecycle allows `SUBMITTED → READY_TO_SUBMIT` retry  |
| Proof generation failure        | `PROOF_GENERATION_FAILED`; note lock released         |
| Worker/API/Redis restart        | job re-run is idempotent; state is durable in Postgres|
| Duplicate request               | idempotency key returns the original operation        |
| Duplicate worker execution      | `status !== CREATED` guard ⇒ blockchain action once   |
| Double-spend attempt            | rejected by local lock + on-chain nullifier check     |

## What is durable

Notes, operations, proofs, transactions, Merkle state, nullifiers, and events live in
PostgreSQL. If Redis is lost, in-flight jobs are re-enqueued from durable operation
records (operations left non-terminal can be re-dispatched). If the Merkle mirror is
lost, it is rebuilt from chain events.
