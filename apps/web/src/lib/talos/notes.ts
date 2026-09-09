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

/** A fully-specified output note. `ownerPubKey` is the recipient's (self or counterparty). */
export interface OutputSpec {
  value: bigint;
  secret: bigint;
  nonce: bigint;
  ownerPubKey: bigint;
}

type Witness = Record<string, string | string[]>;

/**
 * Split witness (1 input -> 2 outputs, SAME owner). Both outputs' `ownerPubKey` MUST equal
 * `Poseidon(input.sk)` or the in-circuit commitment check fails. Conservation: in = o1 + o2.
 * Public signals: [root, nullifier, outCommitment1, outCommitment2].
 */
export function splitWitness(P: Poseidon, input: NoteFields, path: MerklePath, o1: OutputSpec, o2: OutputSpec): Witness {
  const nullifier = deriveNullifier(P, input.sk, input.secret);
  const c1 = deriveCommitment(P, input.assetId, o1.value, o1.ownerPubKey, o1.secret, o1.nonce);
  const c2 = deriveCommitment(P, input.assetId, o2.value, o2.ownerPubKey, o2.secret, o2.nonce);
  return {
    root: path.root,
    nullifier: nullifier.toString(),
    outCommitment1: c1.toString(),
    outCommitment2: c2.toString(),
    inAssetId: input.assetId.toString(),
    inValue: input.value.toString(),
    inSk: input.sk.toString(),
    inSecret: input.secret.toString(),
    inNonce: input.nonce.toString(),
    pathElements: path.pathElements,
    pathIndices: path.pathIndices.map(String),
    out1Value: o1.value.toString(),
    out1Secret: o1.secret.toString(),
    out1Nonce: o1.nonce.toString(),
    out2Value: o2.value.toString(),
    out2Secret: o2.secret.toString(),
    out2Nonce: o2.nonce.toString(),
  };
}

/**
 * Transfer witness (1 input -> 2 outputs, owners MAY differ). Like split but the output
 * owner keys are explicit inputs (out1 typically a counterparty, out2 self as change).
 */
export function transferWitness(
  P: Poseidon,
  input: NoteFields,
  path: MerklePath,
  o1: OutputSpec,
  o2: OutputSpec,
): Witness {
  const nullifier = deriveNullifier(P, input.sk, input.secret);
  const c1 = deriveCommitment(P, input.assetId, o1.value, o1.ownerPubKey, o1.secret, o1.nonce);
  const c2 = deriveCommitment(P, input.assetId, o2.value, o2.ownerPubKey, o2.secret, o2.nonce);
  return {
    root: path.root,
    nullifier: nullifier.toString(),
    outCommitment1: c1.toString(),
    outCommitment2: c2.toString(),
    inAssetId: input.assetId.toString(),
    inValue: input.value.toString(),
    inSk: input.sk.toString(),
    inSecret: input.secret.toString(),
    inNonce: input.nonce.toString(),
    pathElements: path.pathElements,
    pathIndices: path.pathIndices.map(String),
    out1OwnerPubKey: o1.ownerPubKey.toString(),
    out1Value: o1.value.toString(),
    out1Secret: o1.secret.toString(),
    out1Nonce: o1.nonce.toString(),
    out2OwnerPubKey: o2.ownerPubKey.toString(),
    out2Value: o2.value.toString(),
    out2Secret: o2.secret.toString(),
    out2Nonce: o2.nonce.toString(),
  };
}

/**
 * Merge witness (2 inputs -> 1 output, SAME owner). Both inputs must be distinct notes of
 * the same asset. Conservation: in1 + in2 = out. `out.value` must equal in1.value+in2.value.
 * Public signals: [root, nullifier1, nullifier2, outCommitment].
 */
export function mergeWitness(
  P: Poseidon,
  in1: NoteFields,
  path1: MerklePath,
  in2: NoteFields,
  path2: MerklePath,
  out: OutputSpec,
): Witness {
  const n1 = deriveNullifier(P, in1.sk, in1.secret);
  const n2 = deriveNullifier(P, in2.sk, in2.secret);
  const outC = deriveCommitment(P, in1.assetId, out.value, out.ownerPubKey, out.secret, out.nonce);
  return {
    root: path1.root,
    nullifier1: n1.toString(),
    nullifier2: n2.toString(),
    outCommitment: outC.toString(),
    in1AssetId: in1.assetId.toString(),
    in1Value: in1.value.toString(),
    in1Sk: in1.sk.toString(),
    in1Secret: in1.secret.toString(),
    in1Nonce: in1.nonce.toString(),
    path1Elements: path1.pathElements,
    path1Indices: path1.pathIndices.map(String),
    in2AssetId: in2.assetId.toString(),
    in2Value: in2.value.toString(),
    in2Sk: in2.sk.toString(),
    in2Secret: in2.secret.toString(),
    in2Nonce: in2.nonce.toString(),
    path2Elements: path2.pathElements,
    path2Indices: path2.pathIndices.map(String),
    outOwnerPubKey: out.ownerPubKey.toString(),
    outSecret: out.secret.toString(),
    outNonce: out.nonce.toString(),
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
