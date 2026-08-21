/**
 * @talos/agent
 *
 * The autonomous AI agent runtime. It turns an LLM's proposed *intent* into a
 * deterministic, authorized action — the LLM never holds cryptographic authority.
 * The deterministic gate (Talos Guard) sits between the model and any action.
 *
 *   LLM → Intent → Talos Guard → Deterministic Action → ZK Proof → X Layer
 *
 * Phase 1 is a placeholder. Agent reasoning, the LLM provider abstraction, and
 * Talos Guard are implemented in later phases.
 */

export const AGENT_APP = "@talos/agent" as const;
