pragma circom 2.1.6;

include "../common/note.circom";
include "../common/commitment.circom";
include "../common/merkle.circom";
include "circomlib/circuits/comparators.circom";

/*
 * Merge — 2 input notes -> 1 output note.
 *
 * Proves ownership and Merkle membership of BOTH input notes under the same `root`,
 * derives both nullifiers, enforces the two inputs are distinct notes, derives the
 * output commitment, and enforces asset consistency and value conservation:
 *
 *   inputValue1 + inputValue2 = outputValue
 *   inAsset1 == inAsset2 == outAsset
 *
 * Public signals (FROZEN order): [root, nullifier1, nullifier2, outCommitment].
 */
template Merge(depth) {
    // --- public ---
    signal input root;
    signal input nullifier1;
    signal input nullifier2;
    signal input outCommitment;

    // --- private: input note 1 ---
    signal input in1AssetId;
    signal input in1Value;
    signal input in1Sk;
    signal input in1Secret;
    signal input in1Nonce;
    signal input path1Elements[depth];
    signal input path1Indices[depth];

    // --- private: input note 2 ---
    signal input in2AssetId;
    signal input in2Value;
    signal input in2Sk;
    signal input in2Secret;
    signal input in2Nonce;
    signal input path2Elements[depth];
    signal input path2Indices[depth];

    // --- private: output note ---
    signal input outOwnerPubKey;
    signal input outSecret;
    signal input outNonce;

    // Input note 1.
    component n1 = NoteData();
    n1.assetId <== in1AssetId;
    n1.value <== in1Value;
    n1.sk <== in1Sk;
    n1.secret <== in1Secret;
    n1.nonce <== in1Nonce;
    nullifier1 === n1.nullifier;

    component mk1 = MerkleProof(depth);
    mk1.leaf <== n1.commitment;
    for (var i = 0; i < depth; i++) {
        mk1.pathElements[i] <== path1Elements[i];
        mk1.pathIndices[i] <== path1Indices[i];
    }
    root === mk1.root;

    // Input note 2.
    component n2 = NoteData();
    n2.assetId <== in2AssetId;
    n2.value <== in2Value;
    n2.sk <== in2Sk;
    n2.secret <== in2Secret;
    n2.nonce <== in2Nonce;
    nullifier2 === n2.nullifier;

    component mk2 = MerkleProof(depth);
    mk2.leaf <== n2.commitment;
    for (var i = 0; i < depth; i++) {
        mk2.pathElements[i] <== path2Elements[i];
        mk2.pathIndices[i] <== path2Indices[i];
    }
    root === mk2.root;

    // The two inputs must be different notes.
    component same = IsEqual();
    same.in[0] <== n1.commitment;
    same.in[1] <== n2.commitment;
    same.out === 0;

    // Asset consistency.
    in1AssetId === in2AssetId;

    // Output commitment (same asset as the inputs).
    component cOut = Commitment();
    cOut.assetId <== in1AssetId;
    cOut.value <== in1Value + in2Value;
    cOut.ownerPubKey <== outOwnerPubKey;
    cOut.secret <== outSecret;
    cOut.nonce <== outNonce;
    outCommitment === cOut.commitment;

    // Range checks: both inputs and the merged output must be valid note values.
    component rc1 = ValueRange();
    rc1.value <== in1Value;
    component rc2 = ValueRange();
    rc2.value <== in2Value;
    component rcOut = ValueRange();
    rcOut.value <== in1Value + in2Value;
}

component main {public [root, nullifier1, nullifier2, outCommitment]} = Merge(20);
