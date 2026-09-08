# Talos — Mainnet Readiness Report (Phase 7)

> **Overall verdict: NOT PRODUCTION-READY FOR REAL FUNDS.**
> Status legend: **PASS** (production-grade, tested) · **FAIL** (unsafe as-is) ·
> **BLOCKED** (needs another item first) · **AUDIT** (requires external audit/ceremony).
> Per Phase 7 §27, no privacy or safety property is claimed beyond what the code enforces.

This report is honest by construction: passing tests do **not** make the system
production-ready. The trusted-setup blocker (B2) is now resolved by adopting PLONK over the
public Perpetual Powers of Tau universal SRS; the remaining prerequisites — external
circuit/contract audits and client-side key custody (B4) — cannot be satisfied inside this
repository alone.

---

## Component status

| Component | Status | Notes |
|---|---|---|
| **Deposit value binding (B1)** | **PASS** | Deposit now verifies a Groth16 binding proof on-chain (`DepositVerifier`) tying public `(assetId, amount)` to the committed note value. Closes the pool-drain hole. Tested: real-proof accept + amount-mismatch reject + verifier-unset + verifier-reject. |
| **Verifier governance (B3)** | **PASS (code)** | `lockVerifiers()` makes verifier changes go through a `proposeVerifier → wait VERIFIER_TIMELOCK (2 days) → executeVerifier` flow — no instantaneous malicious swap. Tested. Production deploy MUST call `lockVerifiers()` post-wiring (not yet done on testnet). |
| **Value conservation (spends)** | **PASS** | Enforced in-circuit: transfer/split `in = out1+out2`; merge `in1+in2 = out`; range-checked. |
| **Double-spend / replay** | **PASS** | Nullifier set on-chain; `Poseidon(sk, secret)` deterministic; cross-root replay yields the same nullifier → rejected. Tested. |
| **Merkle tree** | **PASS** | Append-only, real Poseidon(2), bounded known-root history; server mirrors chain and never authoritative. |
| **Withdraw recipient binding** | **PASS** | `recipient` constrained in-circuit (anti-malleability). |
| **Reentrancy / access control / pausing** | **PASS** | `nonReentrant` on fund-moving paths, `onlyOwner`, `whenNotPaused`; owner cannot move user funds or forge. Tested. |
| **Trusted setup (B2)** | **PASS (setup) / AUDIT (audit)** | **Migrated Groth16 → PLONK.** PLONK uses a *universal, updatable* SRS — the **Perpetual Powers of Tau (contribution #80, 80+ independent contributors)**, mirrored by the Ethereum Foundation's PSE. No per-circuit phase-2 ceremony and **no per-circuit toxic waste** on our side. The SRS is sound iff ≥1 of the 80+ PPOT contributors destroyed their secret. The pinned ptau is SHA-256-verified on every build (`setup-plonk.mjs`) and re-derivable; `circuits/build/ceremony-transcript.json` records the source, hash, and per-circuit zkey/vkey hashes. This closes the *ceremony* blocker; a circuit+contract audit is still required before real funds. |
| **Spending-key custody (B4)** | **FAIL** | Note `secret`/`sk` generated + held server-side (AES-256-GCM encrypted; never returned by APIs). Server can decrypt → can spend. Needs client-side key custody. |
| **Viewing / spending key separation** | **FAIL** | Not implemented. Receive identity = `Poseidon(sk)`; no separate viewing key for note discovery without spend authority. |
| **Note encryption for recipients** | **FAIL** | Recipients don't get encrypted note payloads; discovery is server-side (custodial). Zcash-style Sapling note encryption not implemented. |
| **Protocol fee (in-circuit)** | **NOT IMPLEMENTED** | No fee term in circuits/contract. Requires circuit changes + a new phase-2 setup, or an on-chain withdraw-boundary fee (contract-only, no circuit change). See `fees.md` (spec). |
| **Partial / multi-output withdrawal** | **NOT IMPLEMENTED** | Withdraw is whole-note only. Partial withdraw + change and bounded multi-output need new circuits + setup. |
| **Relayer / gas-payer unlinkability** | **PARTIAL** | Spends are already submitted by the server signer (user's wallet is not the on-chain sender for split/merge/transfer/withdraw), so gas-payer linkage to the *user* is limited; but a single signer links all ops to one address. A dedicated relayer with rotation + client-side proving is not implemented. |
| **Token safety** | **PARTIAL** | Standard ERC-20 + native OKB safe. Fee-on-transfer / rebasing tokens are **unsafe** (deposit records `amount`, not received balance). Needs an explicit supported-asset allow-list. |
| **Backend authority** | **PASS (design)** | Backend cannot forge proofs, fabricate roots, or mark nullifiers; chain is authoritative; DB is derived. Custodial keys (B4) are the exception. |
| **Reorg handling** | **PARTIAL** | Synchronizer converges to on-chain root with retries + checkpoint; explicit reorg-depth policy not formalized. |
| **Monitoring / emergency controls** | **PARTIAL** | `setPaused` exists; no alerting/monitoring stack. |
| **Test coverage** | **PASS (unit/integration)** | 81 contract tests (incl. 10 real-PLONK-proof E2E), 43 backend unit tests, **27 circuit soundness checks** (`pnpm zk:negtest`: valid baseline + conservation/range/binding/merge-distinctness/asset/tamper rejects for all 5 circuits). |
| **Circuit correctness (internal)** | **PASS (internal review)** | Internal circuit-correctness audit completed — see [`circuit-audit.md`](./circuit-audit.md). No soundness/fund-loss findings; all conservation/binding/range/membership properties enforced in-circuit and re-verified on-chain. Does **not** replace an independent audit. |
| **Contract / circuit audit (external)** | **AUDIT** | No *independent* external audit performed. Now the dominant unforgeability risk (B2 ceremony risk removed). |

---

## Techniques inventory (what "top privacy" would require, and where Talos stands)

| Technique | Zcash | Tornado | Talos | Status |
|---|---|---|---|---|
| Amount/owner hiding in shielded ops | ✅ | ✅ | ✅ real PLONK + Poseidon | PASS |
| Shared anonymity set | ✅ | ✅ | ✅ one pool | PASS (set size grows with usage) |
| Deposit value soundness | ✅ | ✅ (fixed denoms) | ✅ **B1 binding proof** | PASS |
| Nullifier double-spend prevention | ✅ | ✅ | ✅ | PASS |
| Verifier immutability/governance | immutable | immutable | ✅ **B3 timelock+lock** | PASS (deploy must lock) |
| Relayer (break payer link) | n/a | ✅ | partial (server-submitted spends) | PARTIAL |
| Note encryption + viewing keys | ✅ Sapling | n/a | ❌ | FAIL |
| Client-side key custody | ✅ | ✅ | ❌ custodial | FAIL |
| Real trusted setup | ✅ MPC (per-circuit) | ✅ MPC (per-circuit) | ✅ **universal SRS — Perpetual PoT #80** (no per-circuit ceremony/toxic waste) | PASS (audit still required) |
| Fixed denominations (uniformity) | n/a | ✅ | ❌ arbitrary amounts | design choice (flexibility vs uniformity) |

**Honest claim boundary:** Talos provides *cryptographic amount- and owner-privacy for
shielded operations, with on-chain value soundness*, over a **PLONK proof system whose
setup is the public Perpetual Powers of Tau universal SRS** (no bespoke ceremony, no
per-circuit toxic waste). It does **not** yet provide Zcash-grade non-custodial key
management/note encryption or Tornado-grade payer unlinkability, and it has **not** been
externally audited. We do **not** claim "untraceable," "perfect privacy," or "better than
Zcash/Tornado." Proof soundness rests on (a) the PPOT 1-of-N-honest assumption and (b) the
correctness of the circuits — the latter is exactly what an external audit must establish.

---

## Exact mainnet blockers (ordered)

1. ~~**B2 — real trusted-setup ceremony**~~ **RESOLVED** by migrating to PLONK over the
   Perpetual Powers of Tau universal SRS (no per-circuit ceremony/toxic waste). Remaining
   dependency is the circuit/contract audit below, not a ceremony we must run.
2. **B4 — client-side spending keys + note encryption + viewing/spending key separation.** Removes custodial spend risk; enables private discovery.
3. **External circuit + contract audits.** With B2 removed as a ceremony risk, circuit
   soundness is now the dominant unforgeability risk and MUST be audited before real funds.
4. **Deploy hardening** — call `lockVerifiers()`; formalize supported-asset allow-list; reorg-depth policy; monitoring + emergency runbook.
5. **Fee mechanism** (if fees are required) + **withdrawal v2** (partial/multi-output) — need new circuits + phase-2 setup.
6. **Property/fuzz tests** for value/asset/fee/nullifier conservation. *(Circuit soundness
   negative-test suite added — `pnpm zk:negtest`, 27 checks; see [`circuit-audit.md`](./circuit-audit.md).
   Solidity property/fuzz tests still to add.)*

---

## What changed in Phase 7 so far

- **B1 (CRITICAL) — RESOLVED**: on-chain deposit binding proof (circuit already existed; wired `DepositVerifier` into `TalosPool.deposit`, threaded through server + frontend). Real-proof + negative tests.
- **B2 (CRITICAL) — RESOLVED**: **migrated the entire proof system Groth16 → PLONK** so the
  trusted setup is the *universal* Perpetual Powers of Tau SRS (contribution #80) instead of
  a dev-generated single-contributor ceremony. New `packages/zk/scripts/setup-plonk.mjs`
  downloads + SHA-256-verifies the real ptau and regenerates all five Solidity verifiers;
  `ceremony-transcript.json` records the provenance. Proof shape changed to the flat
  `uint256[24]` PLONK encoding across contracts, server, and frontend. Privacy is unchanged
  (privacy is a property of the circuits, not the scheme). Validated: **81 contract tests**
  incl. 10 real-PLONK-proof E2E tests (accept + tamper/replay/amount-mismatch rejects),
  **43 backend unit tests**, core + web typecheck clean.
- **B3 (CRITICAL) — RESOLVED (code)**: verifier lock + 2-day timelock governance. Tests added.
- **Audit** — `production-gap-analysis.md` produced (Phase 7 §2).

The remaining items are either **external** (circuit/contract audits) or **large
architectural changes** (client-side keys, new fee/withdrawal circuits) that must not be
faked; they are specified here and in the gap analysis rather than stubbed.
