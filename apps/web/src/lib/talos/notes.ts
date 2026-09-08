/**
 * Talos note construction (client-side, B4).
 *
 * Builds note commitments/nullifiers and circuit witnesses from client-held key material
 * (see keys.ts) so the browser — not the server — owns every private note field. These are
 * pure functions over an INJECTED Poseidon hash: the module has no crypto dependency of its
 * own, so it is environment-agnostic and unit-testable in Node (inject circomlibjs) exactly
 * as it runs in the browser. The frozen field orders mirror the circuits and the Core
 * Server's `crypto/poseidon.ts`.
 *
 *   ownerPubKey = Poseidon(sk)
 *   commitment  = Poseidon(assetId, value, ownerPubKey, secret, nonce)
 *   nullifier   = Poseidon(sk, secret)
 */

/** Poseidon over BN254 field elements → field element. Inject circomlibjs (browser/node). */
export type Poseidon = (inputs: bigint[]) => bigint;

export interface NoteFields {
  assetId: bigint;
  value: bigint;
  sk: bigint; // spending key (client-held; NEVER sent to the server)
  secret: bigint;
  nonce: bigint;
}

/** ownerPubKey = Poseidon(sk). This is the value safe to hand the server for a deposit. */
export function deriveOwnerPubKey(P: Poseidon, sk: bigint): bigint {
  return P([sk]);
}

/** commitment = Poseidon(assetId, value, ownerPubKey, secret, nonce). */
export function deriveCommitment(
  P: Poseidon,
  assetId: bigint,
  value: bigint,
  ownerPubKey: bigint,
  secret: bigint,
  nonce: bigint,
): bigint {
  return P([assetId, value, ownerPubKey, secret, nonce]);
}

/** nullifier = Poseidon(sk, secret). Requires `sk`, so only the key holder can compute it. */
export function deriveNullifier(P: Poseidon, sk: bigint, secret: bigint): bigint {
  return P([sk, secret]);
}

/** A Merkle inclusion proof for a note (from the server's synchronized tree). */
export interface MerklePath {
  root: string;
  pathElements: string[];
  pathIndices: number[];
}

/**
 * Witness for the withdraw circuit (1 input note -> public recipient). Whole-note
 * withdraw, so `amount == inValue`. `recipientField` is the recipient address as a field
 * element (`BigInt(address).toString()`). Public signals (frozen):
 * [root, nullifier, amount, recipient, assetId]. Needs `sk` — client-only.
 */
export function withdrawWitness(
  P: Poseidon,
  note: NoteFields,
  path: MerklePath,
  recipientField: string,
): Record<string, string | string[]> {
  const nullifier = deriveNullifier(P, note.sk, note.secret);
  return {
    root: path.root,
    nullifier: nullifier.toString(),
    amount: note.value.toString(),
    recipient: recipientField,
    assetId: note.assetId.toString(),
    inValue: note.value.toString(),
    inSk: note.sk.toString(),
    inSecret: note.secret.toString(),
    inNonce: note.nonce.toString(),
    pathElements: path.pathElements,
    pathIndices: path.pathIndices.map(String),
  };
}

/** Public artifacts of a note the client can safely disclose (no `sk`, no `secret`). */
export interface DepositArtifacts {
  ownerPubKey: string;
  commitment: string;
}

/**
 * Compute the public deposit artifacts from client-held fields. The server needs only
 * `ownerPubKey` + `commitment` to accept the deposit; it never receives `sk`.
 */
export function depositArtifacts(P: Poseidon, note: NoteFields): DepositArtifacts {
  const ownerPubKey = deriveOwnerPubKey(P, note.sk);
  const commitment = deriveCommitment(P, note.assetId, note.value, ownerPubKey, note.secret, note.nonce);
  return { ownerPubKey: ownerPubKey.toString(), commitment: commitment.toString() };
}

/**
 * Witness for the deposit binding circuit. NOTE: deposit needs only
 * {ownerPubKey, secret, nonce} — NOT `sk` — so the deposit proof can be produced without
 * ever exposing spend authority. Public signals (frozen): [assetId, amount, commitment].
 */
export function depositWitness(P: Poseidon, note: NoteFields): Record<string, string> {
  const { ownerPubKey, commitment } = depositArtifacts(P, note);
  return {
    assetId: note.assetId.toString(),
    amount: note.value.toString(),
    commitment,
    ownerPubKey,
    secret: note.secret.toString(),
    nonce: note.nonce.toString(),
  };
}
