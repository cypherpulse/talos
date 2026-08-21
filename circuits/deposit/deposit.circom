pragma circom 2.1.6;

include "../common/commitment.circom";
include "../common/note.circom";

/*
 * Deposit — public asset -> 1 note.
 *
 * Proves the public deposit is correctly bound to a well-formed note commitment:
 *
 *   commitment = Poseidon(assetId, amount, ownerPubKey, secret, nonce)
 *   0 <= amount < 2^128
 *
 * Public signals (FROZEN order): [assetId, amount, commitment]
 * Private witness: ownerPubKey, secret, nonce.
 *
 * No private note field is exposed. The pool's deposit path stays proofless per the
 * Phase 2 freeze; this circuit/verifier proves the binding off-chain.
 */
template Deposit() {
    // --- public ---
    signal input assetId;
    signal input amount;
    signal input commitment;

    // --- private witness ---
    signal input ownerPubKey;
    signal input secret;
    signal input nonce;

    // amount must be a valid note value.
    component range = ValueRange();
    range.value <== amount;

    // Recompute the commitment and bind it to the public signal.
    component c = Commitment();
    c.assetId <== assetId;
    c.value <== amount;
    c.ownerPubKey <== ownerPubKey;
    c.secret <== secret;
    c.nonce <== nonce;

    commitment === c.commitment;
}

component main {public [assetId, amount, commitment]} = Deposit();
