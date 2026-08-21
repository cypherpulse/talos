/**
 * @talos/relayer
 *
 * The relayer service submits already-authorized, proof-carrying transactions to
 * X Layer on behalf of agents, so that the agent key need not directly pay gas or
 * be exposed. It is transport only — it does not authorize actions; authorization
 * comes from the ZK proof and the on-chain verifier.
 *
 * Phase 1 is a placeholder. Relayer logic is implemented in a later phase.
 */

export const RELAYER_SERVICE = "@talos/relayer" as const;
