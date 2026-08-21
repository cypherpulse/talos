/**
 * Core domain types: operation & note lifecycles, proof packages, and the shapes
 * shared across the orchestration layer. These mirror the frozen Phase 2/3 protocol
 * (see docs/protocol/specification.md); they never redefine it.
 */

export const OPERATION_TYPES = ["DEPOSIT", "TRANSFER", "SPLIT", "MERGE", "WITHDRAW"] as const;
export type OperationType = (typeof OPERATION_TYPES)[number];

/** Operation lifecycle (Phase 4 §7). Not a single success boolean. */
export const OPERATION_STATUSES = [
  "CREATED",
  "VALIDATING",
  "PROVING",
  "PROOF_READY",
  "READY_TO_SUBMIT",
  "SUBMITTING",
  "SUBMITTED",
  "CONFIRMING",
  "CONFIRMED",
  "FINALIZED",
  // terminal failure states
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "REJECTED",
] as const;
export type OperationStatus = (typeof OPERATION_STATUSES)[number];

export const TERMINAL_STATUSES: readonly OperationStatus[] = [
  "FINALIZED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "REJECTED",
];

/** Note lifecycle (Phase 4 §12). */
export const NOTE_STATES = [
  "CREATED",
  "AVAILABLE",
  "PENDING_SPEND",
  "SPENT",
  "LOCKED",
  "INVALID",
] as const;
export type NoteState = (typeof NOTE_STATES)[number];

/** Transaction lifecycle status (Phase 4 §9/§10). */
export type TxStatus = "PENDING" | "SUBMITTED" | "INCLUDED" | "CONFIRMED" | "FINALIZED" | "DROPPED" | "FAILED";

/**
 * A private note. `secret`, `nullifierSecret`, and `ownerPubKey` are sensitive and
 * are only ever persisted encrypted (see NoteEncryptionService). Field decimal
 * strings hold BN254 field elements.
 */
export interface Note {
  id: string;
  assetId: string;
  value: string; // decimal, < 2^128
  ownerPubKey: string;
  secret: string;
  nonce: string;
  nullifierSecret: string; // = spending key sk (Phase 3 key model)
  commitment: string; // Poseidon(assetId, value, ownerPubKey, secret, nonce)
  nullifier: string; // Poseidon(nullifierSecret, secret)
  state: NoteState;
  leafIndex: number | null; // set once observed on-chain
  owner: string | null; // lowercased wallet address that owns this note (per-user scoping)
  createdAt: string;
  updatedAt: string;
}

/** The public, non-secret projection of a note returned by the API. */
export interface NotePublic {
  id: string;
  assetId: string;
  value: string;
  commitment: string;
  state: NoteState;
  leafIndex: number | null;
  createdAt: string;
}

export function toNotePublic(note: Note): NotePublic {
  return {
    id: note.id,
    assetId: note.assetId,
    value: note.value,
    commitment: note.commitment,
    state: note.state,
    leafIndex: note.leafIndex,
    createdAt: note.createdAt,
  };
}

/** A Groth16 proof in the Solidity-verifier encoding. */
export interface Groth16Proof {
  a: [string, string];
  b: [[string, string], [string, string]];
  c: [string, string];
}

/** A proof plus its context (Phase 4 §17). */
export interface ProofPackage {
  operation: OperationType;
  circuit: string;
  proof: Groth16Proof;
  publicSignals: string[];
  verificationKeyId: string;
  generatedAt: string;
}

export interface OperationRecord {
  id: string;
  type: OperationType;
  status: OperationStatus;
  idempotencyKey: string | null;
  noteIds: string[];
  proofId: string | null;
  txHash: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  request: Record<string, unknown>;
  result: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionRecord {
  id: string;
  operationId: string;
  txHash: string | null;
  chainId: number;
  from: string;
  to: string;
  nonce: number | null;
  status: TxStatus;
  blockNumber: number | null;
  blockHash: string | null;
  gasUsed: string | null;
  effectiveGasPrice: string | null;
  confirmations: number;
  createdAt: string;
  updatedAt: string;
}
