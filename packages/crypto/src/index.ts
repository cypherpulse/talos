/**
 * @talos/crypto
 *
 * ZK-friendly cryptographic primitives for Talos — most importantly the Poseidon
 * hash used for note commitments, the Merkle tree, and nullifiers.
 *
 * Phase 1 is a placeholder: no cryptographic implementation lives here yet.
 * Real primitives land in Phase 3 alongside the circuits. This package must never
 * contain fake or mock cryptographic implementations.
 */

export const CRYPTO_PACKAGE = "@talos/crypto" as const;
