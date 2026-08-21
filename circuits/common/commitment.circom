pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

/*
 * Commitment — the frozen Talos note commitment.
 *
 *   commitment = Poseidon(assetId, value, ownerPubKey, secret, nonce)   // arity 5
 *
 * Field order is FROZEN by docs/protocol/specification.md §3 and MUST match the
 * off-chain builder (@talos crypto/circomlibjs) exactly. The on-chain contract never
 * recomputes this — it treats the commitment as an opaque field element.
 */
template Commitment() {
    signal input assetId;
    signal input value;
    signal input ownerPubKey;
    signal input secret;
    signal input nonce;
    signal output commitment;

    component h = Poseidon(5);
    h.inputs[0] <== assetId;
    h.inputs[1] <== value;
    h.inputs[2] <== ownerPubKey;
    h.inputs[3] <== secret;
    h.inputs[4] <== nonce;

    commitment <== h.out;
}
