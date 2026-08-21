pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";
include "./commitment.circom";
include "./nullifier.circom";

/*
 * NoteData — derives every public artifact of an owned note from its private fields.
 *
 * Concrete instantiation of the frozen key model (documented in
 * docs/protocol/zk-system.md):
 *
 *   spending key : sk           (private; authorizes spending)
 *   ownerPubKey  = Poseidon(sk) (committed inside the note commitment)
 *   nullifierSec = sk           (nullifierSecret is the spending key)
 *   commitment   = Poseidon(assetId, value, ownerPubKey, secret, nonce)
 *   nullifier    = Poseidon(sk, secret)
 *
 * Proving knowledge of `sk` such that ownerPubKey = Poseidon(sk) is exactly the
 * ownership check: only the owner can produce a valid spend. This gadget keeps that
 * logic in one place so the spend circuits cannot drift apart.
 */
template NoteData() {
    signal input assetId;
    signal input value;
    signal input sk;
    signal input secret;
    signal input nonce;

    signal output ownerPubKey;
    signal output commitment;
    signal output nullifier;

    // ownerPubKey = Poseidon(sk)
    component pk = Poseidon(1);
    pk.inputs[0] <== sk;
    ownerPubKey <== pk.out;

    // commitment = Poseidon(assetId, value, ownerPubKey, secret, nonce)
    component c = Commitment();
    c.assetId <== assetId;
    c.value <== value;
    c.ownerPubKey <== ownerPubKey;
    c.secret <== secret;
    c.nonce <== nonce;
    commitment <== c.commitment;

    // nullifier = Poseidon(sk, secret)
    component n = Nullifier();
    n.nullifierSecret <== sk;
    n.secret <== secret;
    nullifier <== n.nullifier;
}

/*
 * ValueRange — enforces the frozen note-value bound 0 <= value < 2^128.
 *
 * Num2Bits(128) constrains `value` to 128 bits, preventing a malicious prover from
 * using a near-field-modulus value to overflow a value-conservation sum. Values are
 * therefore safe to add without wrapping the BN254 field.
 */
template ValueRange() {
    signal input value;
    component bits = Num2Bits(128);
    bits.in <== value;
}
