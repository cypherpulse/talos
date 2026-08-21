# Protocol: Nullifiers

> **Status: fully implemented.** The on-chain nullifier set shipped in Phase 2;
> Phase 3 implemented the Poseidon derivation and its in-circuit proof (a spend must
> reveal `Poseidon(sk, secret)` and prove it in zero knowledge). The frozen
> construction lives in [`specification.md`](specification.md); the key model is in
> [`zk-system.md`](zk-system.md).

## Purpose

A **nullifier** lets a note be spent exactly once **without linking the spend to the
note's commitment**. On spend, the prover reveals the nullifier; `TalosPool` records
it and rejects any future spend that reveals the same value. This prevents
double-spends while preserving privacy.

## Construction (frozen)

```text
nullifier = Poseidon(nullifierSecret, secret)                       // arity 2
```

- `nullifierSecret` is derived from the owner's spending key, so only the owner can
  compute a note's nullifier.
- **Same note ⇒ same nullifier** (deterministic).
- **Different notes ⇒ cryptographically independent nullifiers** (Poseidon
  preimage/collision resistance over distinct secrets).

## On-chain enforcement (implemented, Phase 2)

`TalosPool` holds `isNullifierSpent[nullifier]`. On every private operation it:

1. requires each nullifier to be a canonical, nonzero field element;
2. requires it to be unspent (`Talos__NullifierAlreadySpent` otherwise);
3. for Merge, requires the two nullifiers to differ (`Talos__DuplicateNullifier`);
4. marks it spent and emits `NullifierSpent` as an effect, before any token transfer.

The in-circuit proof that a revealed nullifier is correctly derived from a note that
is a member of the tree is implemented in Phase 3 (`nullifier === NoteData.nullifier`
plus Merkle membership, verified on-chain by the generated Groth16 verifier).

## Invariants

- **Uniqueness:** one note ↦ one nullifier; each nullifier recorded at most once.
- **Unlinkability:** a nullifier reveals neither the commitment, amount, nor owner.
- **Owner-only:** producing a valid nullifier requires the note secret.

The authoritative nullifier set is on-chain in `TalosPool`; any off-chain index is a
derived mirror, never the arbiter.
