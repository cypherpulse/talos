import type { Note } from "../domain/types.js";
import type { MerklePath } from "../merkle/synchronizer.js";

/**
 * Witness assembly (Phase 4 §16). Converts resolved domain notes + Merkle paths into
 * the exact private-input records the Phase 3 circuits expect. Field values are
 * decimal strings. These records contain secrets and must never be logged/persisted.
 *
 * Output notes must be created consistently with each circuit's ownership rule:
 *   - split:    output owner == input owner (create outputs with the input's sk)
 *   - transfer: output owner may differ (out1 to a recipient key, out2 to self)
 *   - merge:    output owned by self
 * The output note's `commitment` is a public input and is bound in-circuit.
 */

export function depositWitness(note: Note): Record<string, unknown> {
  return {
    assetId: note.assetId,
    amount: note.value,
    commitment: note.commitment,
    ownerPubKey: note.ownerPubKey,
    secret: note.secret,
    nonce: note.nonce,
  };
}

export function splitWitness(inNote: Note, path: MerklePath, out1: Note, out2: Note): Record<string, unknown> {
  return {
    root: path.root,
    nullifier: inNote.nullifier,
    outCommitment1: out1.commitment,
    outCommitment2: out2.commitment,
    inAssetId: inNote.assetId,
    inValue: inNote.value,
    inSk: inNote.nullifierSecret,
    inSecret: inNote.secret,
    inNonce: inNote.nonce,
    pathElements: path.pathElements,
    pathIndices: path.pathIndices.map((x) => x.toString()),
    out1Value: out1.value,
    out1Secret: out1.secret,
    out1Nonce: out1.nonce,
    out2Value: out2.value,
    out2Secret: out2.secret,
    out2Nonce: out2.nonce,
  };
}

export function transferWitness(inNote: Note, path: MerklePath, out1: Note, out2: Note): Record<string, unknown> {
  return {
    root: path.root,
    nullifier: inNote.nullifier,
    outCommitment1: out1.commitment,
    outCommitment2: out2.commitment,
    inAssetId: inNote.assetId,
    inValue: inNote.value,
    inSk: inNote.nullifierSecret,
    inSecret: inNote.secret,
    inNonce: inNote.nonce,
    pathElements: path.pathElements,
    pathIndices: path.pathIndices.map((x) => x.toString()),
    out1OwnerPubKey: out1.ownerPubKey,
    out1Value: out1.value,
    out1Secret: out1.secret,
    out1Nonce: out1.nonce,
    out2OwnerPubKey: out2.ownerPubKey,
    out2Value: out2.value,
    out2Secret: out2.secret,
    out2Nonce: out2.nonce,
  };
}

export function mergeWitness(in1: Note, path1: MerklePath, in2: Note, path2: MerklePath, out: Note): Record<string, unknown> {
  return {
    root: path1.root,
    nullifier1: in1.nullifier,
    nullifier2: in2.nullifier,
    outCommitment: out.commitment,
    in1AssetId: in1.assetId,
    in1Value: in1.value,
    in1Sk: in1.nullifierSecret,
    in1Secret: in1.secret,
    in1Nonce: in1.nonce,
    path1Elements: path1.pathElements,
    path1Indices: path1.pathIndices.map((x) => x.toString()),
    in2AssetId: in2.assetId,
    in2Value: in2.value,
    in2Sk: in2.nullifierSecret,
    in2Secret: in2.secret,
    in2Nonce: in2.nonce,
    path2Elements: path2.pathElements,
    path2Indices: path2.pathIndices.map((x) => x.toString()),
    outOwnerPubKey: out.ownerPubKey,
    outSecret: out.secret,
    outNonce: out.nonce,
  };
}

export function withdrawWitness(inNote: Note, path: MerklePath, amount: string, recipientField: string): Record<string, unknown> {
  return {
    root: path.root,
    nullifier: inNote.nullifier,
    amount,
    recipient: recipientField,
    assetId: inNote.assetId,
    inValue: inNote.value,
    inSk: inNote.nullifierSecret,
    inSecret: inNote.secret,
    inNonce: inNote.nonce,
    pathElements: path.pathElements,
    pathIndices: path.pathIndices.map((x) => x.toString()),
  };
}
