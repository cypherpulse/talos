/**
 * Note construction + circuit witnesses (client-side). Commitments/nullifiers use the
 * frozen Poseidon field orders that match the circuits and the Core Server. `sk` is spend
 * authority and never leaves the caller. Poseidon is bound (poseidon-lite), so consumers
 * pass plain field elements.
 *
 *   ownerPubKey = Poseidon(sk)
 *   commitment  = Poseidon(assetId, value, ownerPubKey, secret, nonce)
 *   nullifier   = Poseidon(sk, secret)
 */
import { poseidon } from "./poseidon";

export interface NoteFields {
  assetId: bigint;
  value: bigint;
  sk: bigint;
  secret: bigint;
  nonce: bigint;
}

/** A fully-specified output note (ownerPubKey = recipient's, self or counterparty). */
export interface OutputSpec {
  value: bigint;
  secret: bigint;
  nonce: bigint;
  ownerPubKey: bigint;
}

/** A Merkle inclusion proof for a note (from the server's synchronized tree). */
export interface MerklePath {
  root: string;
  pathElements: string[];
  pathIndices: number[];
}

export const deriveOwnerPubKey = (sk: bigint): bigint => poseidon([sk]);
export const deriveCommitment = (assetId: bigint, value: bigint, ownerPubKey: bigint, secret: bigint, nonce: bigint): bigint =>
  poseidon([assetId, value, ownerPubKey, secret, nonce]);
export const deriveNullifier = (sk: bigint, secret: bigint): bigint => poseidon([sk, secret]);

export interface DepositArtifacts {
  ownerPubKey: string;
  commitment: string;
}

/** Public deposit artifacts (no `sk`, no `secret`) — safe to hand the server. */
export function depositArtifacts(note: NoteFields): DepositArtifacts {
  const ownerPubKey = deriveOwnerPubKey(note.sk);
  const commitment = deriveCommitment(note.assetId, note.value, ownerPubKey, note.secret, note.nonce);
  return { ownerPubKey: ownerPubKey.toString(), commitment: commitment.toString() };
}

type Witness = Record<string, string | string[]>;

/** Deposit binding witness. Public signals: [assetId, amount, commitment]. Needs no `sk`. */
export function depositWitness(note: NoteFields): Witness {
  const { ownerPubKey, commitment } = depositArtifacts(note);
  return {
    assetId: note.assetId.toString(),
    amount: note.value.toString(),
    commitment,
    ownerPubKey,
    secret: note.secret.toString(),
    nonce: note.nonce.toString(),
  };
}

/** Withdraw witness (whole-note). Public signals: [root, nullifier, amount, recipient, assetId]. */
export function withdrawWitness(note: NoteFields, path: MerklePath, recipientField: string): Witness {
  return {
    root: path.root,
    nullifier: deriveNullifier(note.sk, note.secret).toString(),
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

/** Split witness (1 -> 2, same owner). Public signals: [root, nullifier, outC1, outC2]. */
export function splitWitness(input: NoteFields, path: MerklePath, o1: OutputSpec, o2: OutputSpec): Witness {
  return {
    root: path.root,
    nullifier: deriveNullifier(input.sk, input.secret).toString(),
    outCommitment1: deriveCommitment(input.assetId, o1.value, o1.ownerPubKey, o1.secret, o1.nonce).toString(),
    outCommitment2: deriveCommitment(input.assetId, o2.value, o2.ownerPubKey, o2.secret, o2.nonce).toString(),
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

/** Transfer witness (1 -> 2, owners may differ). Public signals: [root, nullifier, outC1, outC2]. */
export function transferWitness(input: NoteFields, path: MerklePath, o1: OutputSpec, o2: OutputSpec): Witness {
  return {
    root: path.root,
    nullifier: deriveNullifier(input.sk, input.secret).toString(),
    outCommitment1: deriveCommitment(input.assetId, o1.value, o1.ownerPubKey, o1.secret, o1.nonce).toString(),
    outCommitment2: deriveCommitment(input.assetId, o2.value, o2.ownerPubKey, o2.secret, o2.nonce).toString(),
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

/** Merge witness (2 -> 1, same owner). Public signals: [root, nullifier1, nullifier2, outC]. */
export function mergeWitness(in1: NoteFields, path1: MerklePath, in2: NoteFields, path2: MerklePath, out: OutputSpec): Witness {
  return {
    root: path1.root,
    nullifier1: deriveNullifier(in1.sk, in1.secret).toString(),
    nullifier2: deriveNullifier(in2.sk, in2.secret).toString(),
    outCommitment: deriveCommitment(in1.assetId, out.value, out.ownerPubKey, out.secret, out.nonce).toString(),
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
