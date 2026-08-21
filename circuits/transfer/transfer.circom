pragma circom 2.1.6;

include "../common/note.circom";
include "../common/commitment.circom";
include "../common/merkle.circom";

/*
 * Transfer — 1 input note -> 2 output notes.
 *
 * Proves, in zero knowledge:
 *   - the prover knows the input note's private fields and spending key (ownership);
 *   - the input commitment is a member of the tree under `root` (Merkle membership);
 *   - `nullifier` is the correct nullifier of the input note;
 *   - both output commitments are well-formed from their private note fields;
 *   - asset consistency: inputAsset == out1Asset == out2Asset;
 *   - value conservation: inputValue = out1Value + out2Value (all range-checked);
 *
 * Public signals (FROZEN order): [root, nullifier, outCommitment1, outCommitment2].
 * No input value/owner/secret/nonce is revealed. Output owner keys are private, so
 * an output may be controlled by a different owner (a genuine transfer).
 */
template Transfer(depth) {
    // --- public ---
    signal input root;
    signal input nullifier;
    signal input outCommitment1;
    signal input outCommitment2;

    // --- private: input note ---
    signal input inAssetId;
    signal input inValue;
    signal input inSk;
    signal input inSecret;
    signal input inNonce;
    signal input pathElements[depth];
    signal input pathIndices[depth];

    // --- private: output notes ---
    signal input out1OwnerPubKey;
    signal input out1Value;
    signal input out1Secret;
    signal input out1Nonce;
    signal input out2OwnerPubKey;
    signal input out2Value;
    signal input out2Secret;
    signal input out2Nonce;

    // Input note: derive ownerPubKey, commitment, nullifier from private fields.
    component inNote = NoteData();
    inNote.assetId <== inAssetId;
    inNote.value <== inValue;
    inNote.sk <== inSk;
    inNote.secret <== inSecret;
    inNote.nonce <== inNonce;

    // Nullifier binding (ownership is implied: nullifier depends on sk).
    nullifier === inNote.nullifier;

    // Merkle membership of the input commitment under the public root.
    component mk = MerkleProof(depth);
    mk.leaf <== inNote.commitment;
    for (var i = 0; i < depth; i++) {
        mk.pathElements[i] <== pathElements[i];
        mk.pathIndices[i] <== pathIndices[i];
    }
    root === mk.root;

    // Output commitments (asset fixed to the input asset for the MVP).
    component c1 = Commitment();
    c1.assetId <== inAssetId;
    c1.value <== out1Value;
    c1.ownerPubKey <== out1OwnerPubKey;
    c1.secret <== out1Secret;
    c1.nonce <== out1Nonce;
    outCommitment1 === c1.commitment;

    component c2 = Commitment();
    c2.assetId <== inAssetId;
    c2.value <== out2Value;
    c2.ownerPubKey <== out2OwnerPubKey;
    c2.secret <== out2Secret;
    c2.nonce <== out2Nonce;
    outCommitment2 === c2.commitment;

    // Range checks (prevent field overflow in the sum below).
    component rIn = ValueRange();
    rIn.value <== inValue;
    component r1 = ValueRange();
    r1.value <== out1Value;
    component r2 = ValueRange();
    r2.value <== out2Value;

    // Value conservation.
    inValue === out1Value + out2Value;
}

component main {public [root, nullifier, outCommitment1, outCommitment2]} = Transfer(20);
