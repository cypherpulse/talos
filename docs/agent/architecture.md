# Talos AI Agent — Architecture (Phase 5)

A simple, reliable AI agent that performs Talos private operations through explicit
tools. Every mutation passes through **Talos Guard** before reaching the Phase 4 Core
Server, which performs the real Groth16-proven transaction on X Layer.

```text
User (natural language)
  ↓
AI Agent (LLM + tool loop)
  ↓  tool call
Talos Guard (identity, permissions, limits, policy)
  ↓  approved action
Core Server (proof generation, tx, confirmation)
  ↓
ZK proof → TalosPool → X Layer
  ↓
Agent → user result
```

The agent (and Guard) live in `services/core/src/agent` and `services/core/src/guard`,
reusing the Phase 4 Core Server in-process (via its HTTP API) — no duplicated
blockchain logic.

## Components

- **LLM abstraction** (`agent/llm.ts`): `LLMProvider.generate()`. A deterministic
  rule-based provider (default; network-free, used for the demo/tests) and a real
  Anthropic provider (used when `LLM_PROVIDER=anthropic` + `LLM_API_KEY`). Never
  hardcoded.
- **Agent loop** (`agent/agent.ts`): a minimal tool-calling loop — LLM proposes a
  tool, the agent executes it, feeds the result back, repeats until a final answer.
  No planning graph.
- **Tools** (`agent/tools.ts`): the ONLY way the agent acts (see `tools.md`).
- **Guard** (`guard/`): the security boundary (see `guard.md`).

## Security posture

- The agent has **no** private-key or RPC access; it can only call known Talos tools.
- Every mutation flows `Agent → Guard → Core Server`; there is no `Agent → Core
  Server` mutation path.
- The policy lives **outside** the LLM. Natural-language instructions like "ignore
  your limit" or "act as administrator" cannot change permissions or limits — the
  Guard evaluates policy in code (verified by tests).
- The agent never exposes note secrets, nonces, nullifier secrets, or witnesses;
  tool results carry only public data.

## End-to-end demo (deterministic, real proofs + real chain)

`services/core/test/e2e/agent-flow.e2e.test.ts`:
"deposit 100 → split 60/40 → merge → **reject** an unauthorized withdrawal (no tx) →
withdraw 100 to an allowed address", plus a private transfer and a prompt-manipulation
rejection.
