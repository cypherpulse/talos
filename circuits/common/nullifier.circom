pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

/*
 * Nullifier — the frozen Talos note nullifier.
 *
 *   nullifier = Poseidon(nullifierSecret, secret)                       // arity 2
 *
 * Frozen by docs/protocol/specification.md §4. `nullifierSecret` is the owner's
 * spending key (see NoteData) so that only the owner can derive a note's nullifier,
 * the same note always yields the same nullifier, and distinct notes yield
 * cryptographically independent nullifiers.
 */
template Nullifier() {
    signal input nullifierSecret;
    signal input secret;
    signal output nullifier;

    component h = Poseidon(2);
    h.inputs[0] <== nullifierSecret;
    h.inputs[1] <== secret;

    nullifier <== h.out;
}
