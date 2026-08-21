pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

/*
 * MerkleProof — inclusion proof for the Talos commitment tree.
 *
 * Recomputes the Merkle root from `leaf` and its authentication path and exposes it
 * as `root`. Internal nodes use Poseidon(2), identical to the on-chain hasher
 * (circomlib Poseidon(2)) and MerkleTreeLib, so on-chain and in-circuit roots agree.
 *
 * `depth` is FROZEN at 20 (docs/protocol/merkle-tree.md).
 *
 * pathIndices[i] is the i-th path bit: 0 => current node is the LEFT child,
 * 1 => current node is the RIGHT child. Each bit is constrained boolean.
 */
template MerkleProof(depth) {
    signal input leaf;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal output root;

    component hashers[depth];
    signal cur[depth + 1];
    signal left[depth];
    signal right[depth];
    signal swap[depth];

    cur[0] <== leaf;

    for (var i = 0; i < depth; i++) {
        // Enforce pathIndices[i] ∈ {0, 1}.
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        // If bit == 0: left = cur, right = sibling.
        // If bit == 1: left = sibling, right = cur.
        swap[i] <== pathIndices[i] * (pathElements[i] - cur[i]);
        left[i] <== cur[i] + swap[i];
        right[i] <== pathElements[i] + cur[i] - left[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== left[i];
        hashers[i].inputs[1] <== right[i];
        cur[i + 1] <== hashers[i].out;
    }

    root <== cur[depth];
}
