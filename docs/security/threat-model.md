# Threat Model

Scope: the frozen security boundaries for Talos. These rules apply from Phase 1
onward, even though protocol code is not yet implemented.

## Security goals

1. **Value integrity** — no one can create, double-spend, or steal value; every
   state transition is backed by a verified Groth16 proof against on-chain state.
2. **Privacy** — balances, amounts, and transfer relationships are not revealed
   on-chain or through the off-chain index.
3. **Authorization integrity** — actions are authorized by deterministic policy and
   cryptographic proof, never by an LLM's natural-language output.

## Core principle: the LLM is not an authority

The LLM is treated as an **untrusted input source**. It can be wrong, manipulated
(prompt injection), or adversarial. Therefore:

- LLM output is parsed into a **typed intent** and validated (Zod) — never executed
  directly.
- Every intent passes **Talos Guard**, a deterministic policy engine (limits,
  allow-lists, invariants). The Guard is the authorization boundary off-chain.
- The on-chain **verifier + pool** are the authorization boundary on-chain.
- No amount of persuasive text can move funds without a valid proof against real
  state.

```text
LLM (untrusted) → Intent → Talos Guard (deterministic) → Proof → X Layer (verifies)
```

## Trust boundaries

| Component            | Trust level        | Notes                                        |
| -------------------- | ------------------ | -------------------------------------------- |
| LLM / prompt         | Untrusted          | May be adversarial; output is validated only |
| Agent process        | Semi-trusted       | Holds a testnet key; constrained by the Guard|
| Talos Guard          | Trusted (determin.)| Must be simple, auditable, deterministic     |
| ZK circuits / proofs | Trusted (verified) | Correctness assured by verification, not code path |
| PostgreSQL / Redis   | Untrusted for truth| Derived index/cache; rebuildable             |
| X Layer contracts    | Authoritative      | Source of cryptographic truth                |

## Selected threats and mitigations

- **Prompt injection / malicious intent** → Guard policy checks; typed intents;
  hard invariants the model cannot override.
- **Fake/short-circuit verifier** → the on-chain verifier is generated from the
  circuits (Groth16); a verifier that returns `true` unconditionally is forbidden
  and must never be committed.
- **Index treated as truth** → PostgreSQL is derived only; security-sensitive reads
  confirm against X Layer; the index is rebuildable from chain.
- **Secret leakage** → note secrets and private keys are never logged, never stored
  in the repo, never persisted in plaintext; keys are read from the environment.
- **Nullifier reuse / double-spend** → enforced on-chain by the pool's nullifier
  set (implemented in a later phase).

## Non-negotiable rules (apply now)

Never:
- commit private keys or `.env`;
- log private note secrets;
- hardcode production credentials;
- trust LLM output as authorization;
- treat PostgreSQL as the source of cryptographic truth;
- create fake cryptographic implementations;
- disable TypeScript strictness;
- bypass failing tests.

## Phase 2 — on-chain protocol foundation (implemented)

Phase 2 implements the `TalosPool` state machine. Its security posture:

### The cryptographic boundary (still open until Phase 3)

Phase 2 provides **no ZK privacy and no proof soundness**. This is explicit, not
hidden:

- The production verifier
  [`TalosVerifier`](../../contracts/src/TalosVerifier.sol) **always reverts** — it is
  incapable of returning `true`. A dedicated test asserts this
  (`test_Placeholder_AlwaysReverts`).
- The only components that can make a proof "pass" are **test-only** mocks isolated
  under `contracts/test/mocks/` (`MockVerifier`, `TestPoseidonHasher`). They are
  never deployed to production and the pool has no dependency on them.
- Because the Phase 2 Merkle hasher is a keccak stand-in, on-chain roots are **not**
  circuit-consistent yet. Phase 3 injects real Poseidon and the generated verifiers.

### Mitigations implemented now

| Threat                         | Mitigation (Phase 2)                                            |
| ------------------------------ | -------------------------------------------------------------- |
| Double-spend / replay          | Permanent spent-nullifier set; reused nullifier reverts        |
| Withdrawal re-routing          | `recipient`/`amount` are proof public inputs (bound payout)    |
| Duplicate nullifier in Merge   | `nullifier1 != nullifier2` enforced                            |
| Stale/forged Merkle root       | `root` must be within the retained root history                |
| Malformed field inputs         | Commitments/nullifiers validated `∈ [1, r)`; duplicates rejected |
| Reentrancy on token flows      | `nonReentrant` on `deposit`/`withdraw`; strict CEI ordering     |
| Non-standard ERC-20s           | Safe transfer wrappers revert on failure / false return        |
| Unauthorized admin actions     | `onlyOwner`; owner cannot touch funds/notes/proofs/tree        |
| Emergency response             | `setPaused` blocks all state-changing operations               |

### Residual assumptions

- Deposit does not yet bind `commitment` to the public `amount`/`assetId`; the Phase
  3 deposit circuit closes this.
- Value conservation for private operations is asserted only by the (mock) verifier
  boundary until the Phase 3 circuits enforce it.

## Phase 3 — real ZK proving system (implemented)

Phase 3 closed the cryptographic boundary that Phase 2 left open. See
[`../protocol/zk-system.md`](../protocol/zk-system.md).

- **Real verifiers.** The production verifier path is now the snarkjs-generated
  Groth16 verifiers behind the {TalosVerifier} adapter — the honest-reverting
  placeholder is gone. The adapter can only return what the generated pairing check
  returns; it never fabricates a `true`.
- **Real Poseidon.** The Merkle tree uses the circomlib-generated Poseidon(2)
  contract, so on-chain roots equal in-circuit roots. Verified against fixed vectors
  (`PoseidonVectors.t.sol`) and demonstrated end-to-end (`TalosE2E.t.sol`).
- **In-circuit invariants.** Ownership, Merkle membership, nullifier/commitment
  correctness, asset consistency, value conservation, `value < 2^128`, merge
  distinctness, and withdraw recipient-binding are all enforced *inside* the
  circuits — a malicious prover cannot bypass them. Confirmed by circuit negative
  tests (`pnpm zk:negtest`) and on-chain negative tests.
- **Privacy.** Public signals are exactly the frozen sets; no note value, owner,
  secret, or nonce is exposed. Witnesses stay off-chain and are git-ignored.

### Residual assumptions (Phase 3)

- **The trusted setup is a development ceremony, not production-secure**: single
  contributor, published fixed entropy, reproducible toxic waste. A production launch
  requires a real multi-party ceremony and a re-export of every verifier. This is
  the primary caveat and is stated wherever the setup is described.
- Deposit remains proofless on-chain per the freeze; the deposit circuit/verifier
  proves the `commitment ↔ (assetId, amount)` binding off-chain.
- Soundness rests on Groth16 over BN254 and Poseidon resistance.

## Out of scope for Phase 3

The Talos Core Server, APIs, persistence (PostgreSQL/Redis), the AI agent and Talos
Guard, the relayer/indexer, the frontend, a production trusted-setup ceremony, and
mainnet deployment are addressed in later phases. This document fixes the boundaries
those phases must respect.
