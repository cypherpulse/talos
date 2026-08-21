/**
 * Typed error model with stable, machine-readable codes (Phase 4 §34).
 *
 * Every error carries a `code` (stable string), an HTTP `status`, and an optional
 * `details` object safe to return to clients. Secrets are NEVER placed in details.
 */

export type TalosErrorCode =
  | "INVALID_REQUEST"
  | "NOTE_NOT_FOUND"
  | "NOTE_ALREADY_SPENT"
  | "NOTE_NOT_AVAILABLE"
  | "NULLIFIER_ALREADY_SPENT"
  | "INVALID_MERKLE_ROOT"
  | "PROOF_GENERATION_FAILED"
  | "PROOF_VALIDATION_FAILED"
  | "TRANSACTION_SUBMISSION_FAILED"
  | "TRANSACTION_CONFIRMATION_FAILED"
  | "UNSUPPORTED_ASSET"
  | "INSUFFICIENT_BALANCE"
  | "EXECUTION_CONFLICT"
  | "OPERATION_NOT_FOUND"
  | "BLOCKCHAIN_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class TalosError extends Error {
  readonly code: TalosErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: TalosErrorCode, status: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "TalosError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  toJSON(): { error: { code: TalosErrorCode; message: string; details?: Record<string, unknown> } } {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}

const make =
  (code: TalosErrorCode, status: number) =>
  (message: string, details?: Record<string, unknown>): TalosError =>
    new TalosError(code, status, message, details);

export const InvalidRequest = make("INVALID_REQUEST", 400);
export const NoteNotFound = make("NOTE_NOT_FOUND", 404);
export const NoteAlreadySpent = make("NOTE_ALREADY_SPENT", 409);
export const NoteNotAvailable = make("NOTE_NOT_AVAILABLE", 409);
export const NullifierAlreadySpent = make("NULLIFIER_ALREADY_SPENT", 409);
export const InvalidMerkleRoot = make("INVALID_MERKLE_ROOT", 409);
export const ProofGenerationFailed = make("PROOF_GENERATION_FAILED", 500);
export const ProofValidationFailed = make("PROOF_VALIDATION_FAILED", 422);
export const TransactionSubmissionFailed = make("TRANSACTION_SUBMISSION_FAILED", 502);
export const TransactionConfirmationFailed = make("TRANSACTION_CONFIRMATION_FAILED", 502);
export const UnsupportedAsset = make("UNSUPPORTED_ASSET", 400);
export const InsufficientBalance = make("INSUFFICIENT_BALANCE", 409);
export const ExecutionConflict = make("EXECUTION_CONFLICT", 409);
export const OperationNotFound = make("OPERATION_NOT_FOUND", 404);
export const BlockchainUnavailable = make("BLOCKCHAIN_UNAVAILABLE", 503);
export const InternalError = make("INTERNAL_ERROR", 500);

export function isTalosError(e: unknown): e is TalosError {
  return e instanceof TalosError;
}
