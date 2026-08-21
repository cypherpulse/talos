# Protocol: Merkle Tree

> **Status: fully implemented.** The tree algorithm shipped in Phase 2; Phase 3
> deployed the real circomlib **Poseidon(2)** hasher, so on-chain roots are now
> circuit-consistent. The frozen parameters live in
> [`specification.md`](specification.md). This page summarizes the design as built in
> [`MerkleTreeLib`](../../contracts/src/libraries/MerkleTreeLib.sol) and used by
> [`TalosPool`](../../contracts/src/TalosPool.sol).

## Purpose

All note commitments are appended to a single **append-only Merkle tree** maintained
on-chain. To spend a note, a prover shows in zero knowledge (Phase 3) that its
commitment is a leaf under a known root, without revealing which leaf.

## Design (as implemented)

- **Type:** fixed-depth incremental Merkle tree (Tornado/Semaphore pattern).
- **Depth:** `MERKLE_DEPTH = 20` → up to 1,048,576 leaves.
- **Arity:** binary; **leaf** = commitment; **internal node** = `Poseidon(left, right)`.
- **Empty leaf:** `ZERO_VALUE = keccak256("Talos")`; empty-subtree roots are
  precomputed once per level at construction.
- **Root history:** the last `ROOT_HISTORY_SIZE = 30` roots are retained in a ring
  buffer; a spend’s `root` must be a known root (`isKnownRoot`).
- **Cost:** each insert is O(depth) hashes and O(depth) storage writes — no unbounded
  loops or arrays.

## The hasher is injected (real Poseidon as of Phase 3)

`MerkleTreeLib` depends only on a 2-arity `IHasher`. The tree **algorithm** is frozen;
the hash **primitive** is injected:

- **Production (Phase 3):** the circomlib-generated **Poseidon(2)** contract (deployed
  from bytecode; see `packages/zk` and `docs/protocol/zk-system.md`). On-chain roots
  are identical to the in-circuit Merkle hash, so real proofs verify against the live
  tree — demonstrated end-to-end in `contracts/test/TalosE2E.t.sol` and checked
  against fixed vectors in `contracts/test/PoseidonVectors.t.sol`.
- **Phase 2 unit tests only:** an explicitly test-only keccak-based hasher
  (`contracts/test/mocks/TestPoseidonHasher.sol`) still exercises the pool's state
  machine in `TalosPool.t.sol`. It is never used on a production path.

## Consistency requirement

Tree depth, arity, hash function, leaf encoding, and `ZERO_VALUE` **must be
identical** across the circuit, the contract, and the TypeScript tree builder. Any
mismatch breaks proof verification. These are frozen together in `specification.md`.
