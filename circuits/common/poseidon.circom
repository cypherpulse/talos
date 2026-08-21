pragma circom 2.1.6;

/*
 * Talos uses circomlib's audited Poseidon implementation directly:
 *
 *   include "circomlib/circuits/poseidon.circom";
 *   component h = Poseidon(n);   // n = number of inputs
 *
 * Poseidon over BN254 is the single hash of the protocol (commitments, nullifiers,
 * and Merkle nodes). The on-chain hasher is the matching circomlib-generated
 * Poseidon(2) contract, so in-circuit and on-chain hashes are identical (verified by
 * the test vectors in circuits/test-vectors and contracts/test).
 *
 * This file intentionally contains no template — it documents the dependency so the
 * choice of hash is discoverable from within circuits/common.
 */
