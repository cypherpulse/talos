import type { OperationStatus, NoteState } from "./types.js";
import { TERMINAL_STATUSES } from "./types.js";

/**
 * Operation and note state machines (Phase 4 §7, §12).
 *
 * Transitions are explicit and validated: an illegal transition throws, so a bug
 * cannot silently drive an operation into an inconsistent state. The happy path is
 *   CREATED → VALIDATING → PROVING → PROOF_READY → READY_TO_SUBMIT → SUBMITTING
 *   → SUBMITTED → CONFIRMING → CONFIRMED → FINALIZED
 * and most non-terminal states may also transition to a failure state.
 */

const OPERATION_TRANSITIONS: Record<OperationStatus, readonly OperationStatus[]> = {
  CREATED: ["VALIDATING", "REJECTED", "CANCELLED", "FAILED"],
  VALIDATING: ["PROVING", "REJECTED", "FAILED", "CANCELLED"],
  PROVING: ["PROOF_READY", "FAILED", "CANCELLED", "EXPIRED"],
  PROOF_READY: ["READY_TO_SUBMIT", "FAILED", "CANCELLED", "EXPIRED"],
  READY_TO_SUBMIT: ["SUBMITTING", "FAILED", "CANCELLED", "EXPIRED"],
  SUBMITTING: ["SUBMITTED", "FAILED", "EXPIRED"],
  // From SUBMITTED a dropped tx returns to READY_TO_SUBMIT for a bounded retry.
  SUBMITTED: ["CONFIRMING", "READY_TO_SUBMIT", "FAILED", "EXPIRED"],
  CONFIRMING: ["CONFIRMED", "FAILED", "EXPIRED"],
  CONFIRMED: ["FINALIZED", "FAILED"],
  FINALIZED: [],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
  REJECTED: [],
};

export function isTerminal(status: OperationStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransition(from: OperationStatus, to: OperationStatus): boolean {
  return OPERATION_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OperationStatus, to: OperationStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal operation transition: ${from} -> ${to}`);
  }
}

const NOTE_TRANSITIONS: Record<NoteState, readonly NoteState[]> = {
  CREATED: ["AVAILABLE", "INVALID"],
  AVAILABLE: ["PENDING_SPEND", "LOCKED", "INVALID"],
  PENDING_SPEND: ["SPENT", "AVAILABLE", "INVALID"], // revert to AVAILABLE on failed spend
  LOCKED: ["AVAILABLE", "PENDING_SPEND", "INVALID"],
  SPENT: [],
  INVALID: [],
};

export function canTransitionNote(from: NoteState, to: NoteState): boolean {
  return NOTE_TRANSITIONS[from].includes(to);
}

export function assertNoteTransition(from: NoteState, to: NoteState): void {
  if (!canTransitionNote(from, to)) {
    throw new Error(`Illegal note transition: ${from} -> ${to}`);
  }
}
