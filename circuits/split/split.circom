pragma circom 2.1.6;

include "../common/note.circom";
include "../common/commitment.circom";
include "../common/merkle.circom";

/*
 * Split — 1 input note -> 2 output notes, SAME owner.
 *
 * Identical proof obligations to Transfer, except both outputs are bound to the
 * input note's owner (`ownerPubKey = Poseidon(inSk)`): a split divides value without
 * changing ownership. Proves ownership, Merkle membership, nullifier derivation,
 * two well-formed output commitments, asset consistency, and value conservation:
 *
 *   inputValue = out1Value + out2Value
 *
 * Public signals (FROZEN order): [root, nullifier, outCommitment1, outCommitment2].
 */
template Split(depth) {
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

    // --- private: output notes (owner is the input owner) ---
    signal input out1Value;
    signal input out1Secret;
    signal input out1Nonce;
    signal input out2Value;
    signal input out2Secret;
    signal input out2Nonce;

    component inNote = NoteData();
    inNote.assetId <== inAssetId;
    inNote.value <== inValue;
    inNote.sk <== inSk;
    inNote.secret <== inSecret;
    inNote.nonce <== inNonce;

    nullifier === inNote.nullifier;

    component mk = MerkleProof(depth);
    mk.leaf <== inNote.commitment;
    for (var i = 0; i < depth; i++) {
        mk.pathElements[i] <== pathElements[i];
        mk.pathIndices[i] <== pathIndices[i];
    }
    root === mk.root;

    // Both outputs keep the input owner and asset.
    component c1 = Commitment();
    c1.assetId <== inAssetId;
    c1.value <== out1Value;
    c1.ownerPubKey <== inNote.ownerPubKey;
    c1.secret <== out1Secret;
    c1.nonce <== out1Nonce;
    outCommitment1 === c1.commitment;

    component c2 = Commitment();
    c2.assetId <== inAssetId;
    c2.value <== out2Value;
    c2.ownerPubKey <== inNote.ownerPubKey;
    c2.secret <== out2Secret;
    c2.nonce <== out2Nonce;
    outCommitment2 === c2.commitment;

    component rIn = ValueRange();
    rIn.value <== inValue;
    component r1 = ValueRange();
    r1.value <== out1Value;
    component r2 = ValueRange();
    r2.value <== out2Value;

    inValue === out1Value + out2Value;
}

component main {public [root, nullifier, outCommitment1, outCommitment2]} = Split(20);
