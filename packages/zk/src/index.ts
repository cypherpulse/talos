/**
 * @talos/zk
 *
 * TypeScript bindings over snarkjs for Groth16 witness/proof generation and
 * verification, plus loading of the compiled circuit artifacts.
 *
 * Phase 1 is a placeholder. Groth16 is the selected proof system (see
 * `docs/adr/0002-groth16.md`). Circuits are implemented in Phase 3; proving keys
 * and trusted-setup artifacts are generated then and are NEVER committed.
 */

export const ZK_PROOF_SYSTEM = "groth16" as const;
