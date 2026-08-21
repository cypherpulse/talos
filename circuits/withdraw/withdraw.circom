pragma circom 2.1.6;

include "../common/note.circom";
include "../common/merkle.circom";

/*
 * Withdraw — 1 input note -> public recipient.
 *
 * Proves ownership and Merkle membership of the input note, derives its nullifier,
 * and binds the public payout to the note:
 *
 *   amount   == inputValue        (withdraw exactly the note's value)
 *   assetId  == inputAssetId       (matches the configured asset)
 *   recipient is bound into the constraint system (non-malleable payout)
 *
 * Public signals (FROZEN order): [root, nullifier, amount, recipient, assetId].
 */
template Withdraw(depth) {
    // --- public ---
    signal input root;
    signal input nullifier;
    signal input amount;
    signal input recipient;
    signal input assetId;

    // --- private witness ---
    signal input inValue;
    signal input inSk;
    signal input inSecret;
    signal input inNonce;
    signal input pathElements[depth];
    signal input pathIndices[depth];

    // Input note derivation. The note's assetId/value are bound to the public
    // signals, so we feed the public assetId/amount straight into the note.
    component inNote = NoteData();
    inNote.assetId <== assetId;
    inNote.value <== amount;
    inNote.sk <== inSk;
    inNote.secret <== inSecret;
    inNote.nonce <== inNonce;

    // Sanity: the private value equals the public amount (defensive redundancy).
    amount === inValue;

    // Nullifier + Merkle membership.
    nullifier === inNote.nullifier;

    component mk = MerkleProof(depth);
    mk.leaf <== inNote.commitment;
    for (var i = 0; i < depth; i++) {
        mk.pathElements[i] <== pathElements[i];
        mk.pathIndices[i] <== pathIndices[i];
    }
    root === mk.root;

    // Amount range.
    component rc = ValueRange();
    rc.value <== amount;

    // Bind `recipient` into the constraint system so a valid proof cannot be
    // replayed against a different recipient public input.
    signal recipientBound;
    recipientBound <== recipient * recipient;
}

component main {public [root, nullifier, amount, recipient, assetId]} = Withdraw(20);
