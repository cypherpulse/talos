import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  canTransitionNote,
  isTerminal,
} from "../../src/domain/state-machine.js";

describe("operation state machine", () => {
  it("allows the happy-path progression", () => {
    const path = [
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
    ] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it("rejects illegal transitions", () => {
    expect(canTransition("CREATED", "FINALIZED")).toBe(false);
    expect(canTransition("FINALIZED", "PROVING")).toBe(false);
    expect(() => assertTransition("CONFIRMED", "PROVING")).toThrow();
  });

  it("marks terminal states", () => {
    expect(isTerminal("FINALIZED")).toBe(true);
    expect(isTerminal("FAILED")).toBe(true);
    expect(isTerminal("REJECTED")).toBe(true);
    expect(isTerminal("PROVING")).toBe(false);
  });

  it("allows a failed spend to return the note to AVAILABLE", () => {
    expect(canTransitionNote("PENDING_SPEND", "AVAILABLE")).toBe(true);
    expect(canTransitionNote("PENDING_SPEND", "SPENT")).toBe(true);
    expect(canTransitionNote("SPENT", "AVAILABLE")).toBe(false);
  });
});
