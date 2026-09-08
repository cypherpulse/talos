# Talos — Security Audit Report

| | |
|---|---|
| **Engagement** | Phase 7 hardening + Groth16→PLONK migration + internal circuit audit |
| **Type** | **Internal audit** (implementer self-review) — *not* an independent third-party audit |
| **Scope** | ZK circuits, trusted setup, `TalosPool` + verifier boundary, proof pipeline (server + frontend), key custody, secrets hygiene |
| **Proof system** | PLONK over BN254 (universal SRS: Perpetual Powers of Tau #80) |
| **Verdict** | **NOT production-ready for real funds.** Blockers reduced to **B4 (custodial keys)** + an **independent external audit**. B1/B2/B3 resolved. |

> **Honesty statement (Phase 7 §27).** This is a self-review by the people who wrote the
> code. It raises assurance and is backed by executable tests, but it does **not** replace
> an independent circuit + contract audit. No privacy or safety property is claimed beyond
> what the code enforces. We do **not** claim "untraceable," "perfect privacy," or "better
> than Zcash/Tornado."

---

## 1. Executive summary

Talos is a note-based (UTXO) privacy pool on X Layer: Poseidon commitments in an
append-only Merkle tree, nullifiers for spend, and per-operation zero-knowledge proofs
verified on-chain. This engagement audited the protocol for real-funds readiness and
remediated the critical blockers that could be closed inside the repository.

**Headline results:**

- **3 CRITICAL blockers resolved** — deposit value binding (B1), trusted setup (B2, via a
  Groth16→PLONK migration onto a public universal SRS), and verifier governance (B3).
- **Circuit correctness internally audited** — no soundness/fund-loss findings; all
  unforgeability-critical properties enforced in-circuit and re-verified on-chain, with a
  27-check executable soundness suite.
- **1 HIGH blocker remains** — custodial spending keys (B4), an architectural change that
  must not be faked; documented with a concrete staged remediation.
- **External independent audit** is now the other gate; with B2's ceremony risk removed,
  circuit correctness is the dominant residual unforgeability risk.

Validation at report time: **81 contract tests** (incl. 10 real-PLONK-proof E2E),
**43 backend unit tests**, **27 circuit soundness checks**, core + web typecheck clean,
`forge fmt`/`forge build` clean.

---

## 2. Findings register

Severity: 🔴 Critical · 🟠 High · 🟡 Medium · 🔵 Low · ⚪ Info.
Status: ✅ Resolved · ⛔ Open · 📝 Documented (by design / accepted).

| ID | Title | Severity | Status |
|----|-------|----------|--------|
| **B1** | Proofless deposit — `amount` not bound to committed note value (pool-drain) | 🔴 Critical | ✅ Resolved |
| **B2** | Development-only trusted setup (forgeable proofs) | 🔴 Critical | ✅ Resolved |
| **B3** | Owner-replaceable verifier, no timelock | 🔴 Critical | ✅ Resolved |
| **B4** | Custodial spending keys (server can spend user notes) | 🟠 High | ⏳ In progress (client key derivation + non-custodial deposit proving landed & tested; client-side *spend* proving remains) |
| **C-1** | Nullifier aliasing when `(sk, secret)` reused | ⚪ Info | 📝 Documented |
| **C-2** | Single-asset trust root (asset not pinned in-circuit for spends) | ⚪ Info | 📝 Documented |
| **C-3** | Redundant `amount === inValue` in withdraw | ⚪ Info | 📝 Documented |
| **C-4** | Soundness test suite broken by PLONK migration (`snarkjs.groth16`) | 🔵 Low | ✅ Resolved |
| **M-1** | Proof-shape migration correctness (Groth16 `{a,b,c}` → PLONK `uint256[24]`) across contract/server/frontend | 🟡 Medium | ✅ Resolved |
| **OPS-1** | Secret (`GROK_API_KEY`) previously present in a committed `.env.example` | 🟠 High | ✅ Resolved |
| **AUD-1** | No independent external circuit/contract audit | 🔴 Critical | ⛔ Open |

---

## 3. Resolved critical findings

### B1 — Deposit value binding ✅
**Was:** the pool inserted a deposit commitment without proving the public `amount`/`assetId`
matched the value committed inside the note, so a depositor could insert a commitment
encoding an arbitrary (larger) value and later withdraw more than deposited → **pool drain**.
**Fix:** `TalosPool.deposit` now verifies a Groth16/PLONK binding proof (`DepositVerifier`)
over public `[assetId, amount, commitment]`; the deposit circuit recomputes the commitment
from the note fields and asserts equality, and range-checks `amount < 2^128`. Threaded
through server (`prepareDeposit`) and frontend (`encodeDeposit`).
**Evidence:** `test_E2E_Deposit` (real proof accepted) + `test_E2E_Deposit_RejectsAmountMismatch`
(`amount+1` rejected) + verifier-unset / verifier-reject unit tests.

### B2 — Trusted setup ✅ (migrated Groth16 → PLONK)
**Was:** a development ceremony — single contributor, published fixed entropy → the toxic
waste is reproducible, so anyone could forge proofs.
**Fix:** migrated the entire proof system from Groth16 to **PLONK**, whose *universal,
updatable* SRS removes the per-circuit phase-2 ceremony and per-circuit toxic waste
entirely. Talos now anchors to the **Perpetual Powers of Tau (contribution #80)** — a
public MPC with 80+ independent contributors, mirrored by the Ethereum Foundation's Privacy
& Scaling Explorations. Soundness holds iff **≥1** of those 80+ contributors destroyed
their secret. The ptau is **SHA-256-pinned and verified on every build**
(`ed3622a7…1561cf9`); `setup-plonk.mjs` regenerates all keys/verifiers deterministically and
writes `circuits/build/ceremony-transcript.json`. Optional cryptographic chain-verify:
`SETUP_VERIFY_PTAU=1` (`snarkjs powersoftau verify`). **Privacy is unchanged** — it is a
property of the circuits, not the proof scheme.
**Residual:** circuit correctness (below) is now the dominant unforgeability risk.

### B3 — Verifier governance ✅
**Was:** `setVerifier` let the owner instantly swap in a malicious verifier and forge spends.
**Fix:** `lockVerifiers()` (irreversible) routes all subsequent changes through
`proposeVerifier → wait VERIFIER_TIMELOCK (2 days) → executeVerifier`. No instantaneous
malicious swap once locked. **Deploy MUST call `lockVerifiers()` post-wiring** (operational).
**Evidence:** timelock/lock/authorization unit tests.

---

## 4. Circuit-correctness audit

Full detail in [`circuit-audit.md`](./circuit-audit.md). Summary: **no soundness/fund-loss
findings.** Reviewed against the classic ZK bug classes:

- **Under-constrained outputs** — none; every public output is `===`-bound to a recomputed
  Poseidon value.
- **Field-overflow conservation bypass** — blocked; `ValueRange(Num2Bits(128))` on every
  input, output, and the merge sum `in1+in2`.
- **Merkle path forgery** — path bits boolean-constrained.
- **Merge double-count** — in-circuit distinctness `IsEqual(c1,c2)===0` + on-chain
  duplicate-nullifier reject.
- **Asset substitution / recipient malleability** — outputs inherit input asset; merge
  pins `in1Asset===in2Asset`; withdraw pins `recipient`.

Informational/by-design items: **C-1** nullifier aliasing if `(sk,secret)` reused (benign;
reduces spendability only), **C-2** single-asset trust root (correct for current model),
**C-3** redundant withdraw constraint (harmless).

**C-4 (fixed):** the migration left `neg-tests.mjs` calling `snarkjs.groth16`, so the
soundness suite would not run. Ported to PLONK and expanded from split-only to **all five
circuits** — 27 checks, all passing.

---

## 5. Migration correctness (M-1) ✅

The Groth16→PLONK switch changed the proof wire shape from `{a: uint256[2], b:
uint256[2][2], c: uint256[2]}` to a flat `uint256[24]`. Audited every touch-point for
consistency:

- **Contracts:** `TalosTypes.Proof {uint256[24] data}`, `ITalosVerifier`,
  `TalosPool._verify`, the `TalosVerifier` adapter (selector `verifyProof(uint256[24],uint256[N])`,
  frozen-signal-count guard), `MockVerifier`. All 5 generated verifiers regenerated as PLONK.
- **Server:** `PlonkProof` type, `plonk.fullProve/verify/exportSolidityCallData`, ABI
  struct, `toProofArg`.
- **Frontend:** `encodeDeposit` (24 words; new selector `0x7f6c5081` — **verified against
  the compiled ABI**).
- **Subtlety caught:** PLONK `exportSolidityCallData` emits two adjacent arrays with **no
  separating comma** (`[..24..][..N..]`); the parser splices one in. Both the server and
  the fixture generator use identical parsing, and the resulting fixtures are verified
  on-chain by the E2E suite.

---

## 6. Open findings

### B4 — Custodial spending keys ⏳ (High, architectural; in progress)
`NoteManager.createNote` generates `sk`/`secret`/`nonce` server-side and persists
`nullifierSecret = sk` (AES-256-GCM encrypted at rest, never returned by an API). A server
compromise can therefore **spend user notes**. This is a *custody* issue, not a *circuit*
issue — the circuits are sound; the private witness simply lives server-side.

**Progress this engagement (landed + tested):**
- **Client key derivation** — [`keys.ts`](../../apps/web/src/lib/talos/keys.ts): the whole
  key tree (`sk` spend / `vk` view / per-note `secret`,`nonce`) derived deterministically on
  the client from one wallet signature; nothing extra to back up, no secret leaves the
  browser. Verified: `pnpm --filter tanstack_start_ts test:keys` (12 checks, incl. KATs).
- **Client-side proving core** — dependency-injected isomorphic PLONK prover
  ([`proof.ts`](../../apps/web/src/lib/talos/proof.ts)) + witness builders
  ([`notes.ts`](../../apps/web/src/lib/talos/notes.ts)).
- **Non-custodial deposit proving — proven end-to-end** (`pnpm --filter @talos/zk zk:clienttest`):
  client-derived keys → deposit witness **with no `sk`** → real PLONK proof over the actual
  circuit → correct frozen public signals → re-verified.

**Still open (why B4 is not yet closed):**
1. **Client-side *spend* proving** — move witness gen + PLONK proving for
   transfer/split/merge/withdraw into the browser. This and the non-custodial deposit wiring
   must ship **together**, else a note deposited without a server-held `sk` can't be spent by
   the current server-side flow.
2. **Browser integration** — add/bundle `snarkjs`+`circomlibjs` in the web app and confirm
   in-browser proving **performance** (merge ≈ 30.6k constraints); measurable only in a real
   browser, not headless.
3. **Viewing/spending key separation + note encryption** for recipient discovery.

> Until (1)+(2) land, spends remain custodial and B4 is **not** closed. This engagement built
> and tested the foundation and the deposit path; it does not claim B4 is resolved.

### AUD-1 — No independent external audit ⛔ (Critical)
Internal review + executable tests substantially raise assurance but cannot substitute for
an independent circuit + contract audit. **Required before real funds.**

---

## 7. Resolved operational finding

### OPS-1 — Secret in committed config ✅
A `GROK_API_KEY` value was previously present in a committed `.env.example`. It has been
blanked; a scan at report time found **no non-empty secrets** in committed `.env.example`
files. **Recommendation:** rotate any key that was ever committed (git history retains it),
and add a pre-commit secret scanner.

---

## 8. Test & validation evidence

| Layer | Command | Result |
|---|---|---|
| Contracts | `forge test` | 81 passed (incl. 10 real-PLONK-proof E2E) |
| Circuit soundness | `pnpm zk:negtest` | 27 checks passed (5 baselines + 22 negative/tamper) |
| Backend | `pnpm -C services/core test` | 43 passed |
| Types | core `tsc` / web `tsc` | clean |
| Format/build | `forge fmt --check`, `forge build` | clean |
| SRS integrity | SHA-256 pin in `setup-plonk.mjs` | verified each build |

---

## 9. Prioritized recommendations before real funds

1. **B4** — implement client-side key custody (steps 1+2 above). *Highest remaining risk.*
2. **AUD-1** — commission an independent circuit + contract audit.
3. **Deploy hardening** — call `lockVerifiers()` post-wiring; formalize a supported-asset
   allow-list; define a reorg-depth policy; stand up monitoring + an emergency runbook.
4. **Solidity property/fuzz tests** — value/asset/nullifier conservation invariants
   (circuit-side soundness suite already added).
5. **Secrets** — rotate any historically committed key; add pre-commit secret scanning.
6. **Optional** — run `SETUP_VERIFY_PTAU=1` offline to record a full PPOT chain-verification
   alongside the pinned hash.

---

## 10. Disclaimer

This internal audit reflects the state of the repository at report time and the reviewers'
best effort. It is **not** a guarantee of security and **not** an independent audit. Do not
deploy with real user funds until **B4** and an **independent external audit** are complete.
Related documents: [`circuit-audit.md`](./circuit-audit.md),
[`production-gap-analysis.md`](./production-gap-analysis.md),
[`mainnet-readiness.md`](./mainnet-readiness.md).
