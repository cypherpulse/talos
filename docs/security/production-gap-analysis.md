# Talos — Production Gap Analysis (Phase 7, Step 1)

> **Status: NOT PRODUCTION-READY FOR REAL FUNDS.**
> This document is the mandatory Phase 7 audit of the frozen Phase 1–6 implementation. It
> describes **actual** behavior only. Every gap that blocks real-fund use is listed with a
> severity and a concrete remediation. No security is claimed by assumption.

Audit date: Phase 7 kickoff. Scope: `contracts/`, `circuits/`, `services/core/src/{crypto,notes,merkle,proofs,execution,contracts,database}`, and the deployed X Layer testnet contracts (chain 1952).

---

## 0. Summary — top blockers

| # | Blocker | Severity | Section |
|---|---------|----------|---------|
| B1 | **Deposit does not bind `amount` to the commitment's value on-chain** (proofless deposit). A depositor can insert a commitment encoding an arbitrary value, then withdraw more than they deposited → pool drain. | 🔴 CRITICAL | [§5.1](#51-deposit-value-binding-critical) |
| B2 | ~~**Trusted setup is development-only**~~ **✅ RESOLVED** — migrated Groth16 → **PLONK** over the public **Perpetual Powers of Tau** universal SRS (contribution #80). No per-circuit ceremony, no per-circuit toxic waste; SHA-256-pinned ptau + verifiable transcript. | ✅ RESOLVED | [§6.4](#64-trusted-setup) |
| B3 | **Verifier is owner-replaceable** (`setVerifier`) with no timelock/governance. A compromised owner can install a malicious verifier and forge spends. | 🔴 CRITICAL | [§4](#4-trusted-components) |
| B4 | **Spending secrets are custodial** — note `secret`/`sk` are generated and held server-side (encrypted). Server compromise = user funds spendable. | 🟠 HIGH | [§4](#4-trusted-components) |
| B5 | **No protocol fee is enforced in-circuit** (value conservation is `in = out`, no fee term). | 🟡 MEDIUM (feature gap) | [§6.5](#65-protocol-fee) |
| B6 | **No viewing/spending key separation**; **no partial/multi-output withdrawal**; **no on-chain proof of change-note correctness beyond conservation**. | 🟡 MEDIUM | [§6](#6-what-must-change-for-production) |

---

## 1. Current privacy guarantees

What the protocol **cryptographically hides today** (with real PLONK + Poseidon, verified on-chain):

- **Private transfer / split / merge**: input note value, owner, `secret`, `nonce`, and the *link between input and outputs* are never public. On-chain the transaction reveals only `[root, nullifier, outCommitment1, outCommitment2]` (transfer/split) or `[root, nullifier1, nullifier2, outCommitment]` (merge). Amounts and ownership stay in the witness.
- **Value conservation** is enforced *in-circuit* for spends: `inValue === out1 + out2` (transfer/split), `in1 + in2 === out` (merge), all range-checked (`ValueRange`) to prevent field overflow.
- **Ownership** is proven in-circuit: the nullifier is `Poseidon(sk, secret)` and `ownerPubKey = Poseidon(sk)`, so only the holder of `sk` can spend.
- **Double-spend prevention**: each spend publishes a nullifier; the pool rejects a repeated nullifier (`_requireUnspentNullifier`).
- **Merkle membership** is proven in-circuit against a **known on-chain root** (`isKnownRoot`).
- **Withdraw recipient binding**: `recipient` is constrained in-circuit (`recipient * recipient`), so a valid proof cannot be re-targeted to a different address.

Poseidon and the note/commitment/nullifier constructions are consistent across Circom, the off-chain builder (`circomlibjs`), and the stored notes (verified by the existing test vectors).

---

## 2. Current public information (what an on-chain observer sees)

| Operation | Public on-chain |
|---|---|
| **Deposit** | `commitment`, `leafIndex`, `assetId`, **`amount`**, `newRoot`, and `msg.sender` (the depositor/funder). |
| **Transfer** | `nullifier`, two output commitments, `newRoot`. No amounts, no owners. |
| **Split** | same shape as transfer. |
| **Merge** | two nullifiers, one output commitment, `newRoot`. |
| **Withdraw** | `nullifier`, **`recipient`**, **`assetId`**, **`amount`**, and the tx sender (gas payer). |

**Unavoidable public data:** deposit amount + depositor (funds enter publicly), and withdrawal recipient + amount + asset (funds leave publicly). Everything between (transfers/splits/merges) is amount- and owner-private.

**Metadata leakage (not yet mitigated):** deposit `amount` and withdraw `amount` can be equal/correlated; the gas payer for spends is currently the server signer (a single relayer), which links operations to one address; timing and output-count patterns are observable. See the planned `privacy-analysis.md`.

---

## 3. Current cryptographic assumptions

- **PLONK soundness** under the BN254 pairing / KZG assumptions, **conditioned on a secure universal setup** — satisfied by the Perpetual Powers of Tau SRS (B2 resolved); residual soundness risk is now circuit correctness, pending audit.
- **Poseidon collision/pre-image resistance** over BN254 (circomlib parameters).
- **Discrete-log-style hiding** of `sk` behind `ownerPubKey = Poseidon(sk)`.
- Field elements are `< p` (BN254 scalar field); range checks bound values to prevent overflow in conservation sums.

---

## 4. Current trusted components (must be minimized for production)

| Component | Trust today | Production requirement |
|---|---|---|
| **Trusted setup / proving keys** | ✅ PLONK universal SRS — Perpetual Powers of Tau #80 (80+ independent contributors), SHA-256-pinned + transcript | met (B2 resolved); no per-circuit ceremony or toxic waste to manage. |
| **Verifier contract** | owner-replaceable via `setVerifier`, no timelock | immutable, or governance + timelock + on-chain transparency (B3). |
| **Pool owner** | can `setVerifier`, `setPaused`, `transferOwnership`. Cannot directly withdraw user funds, forge notes, or mark nullifiers spent. | keep owner unable to move funds; put verifier changes behind timelock; consider renouncing after audit. |
| **Core Server** | generates + holds note secrets (`secret`, `sk`) encrypted (AES-256-GCM); builds proofs; submits txs with a single signer key. | spending secrets must be **client-held**; server must not be able to spend on a user's behalf (B4). |
| **Deposit value integrity** | enforced **off-chain by the backend** (the removed "binding proof") — an on-chain observer/attacker is not bound by it. | must be enforced **on-chain** (B1). |
| **Merkle root** | authoritative on-chain; the Core Server mirrors it and only accepts computed roots that match chain (`synchronizer` retries to on-chain root). ✅ good. | keep; add reorg depth handling + checkpoint verification. |

---

## 5. Current attack surfaces

### 5.1 Deposit value binding (🔴 CRITICAL — B1)

`TalosPool.deposit(assetId, amount, commitment)` is **proofless**: it transfers `amount` tokens and inserts `commitment` **without any on-chain check that `commitment` encodes a note of value `amount`** (or asset `assetId`). The commitment is an opaque field element.

**Exploit:** deposit `amount = 1` while inserting a commitment for a note of value `1_000_000`; later present a valid spend/withdraw proof for `1_000_000` (the circuit only checks the note is well-formed and a tree member — it never checks the note's value was actually funded). The pool pays out `1_000_000`, draining other users' deposits. Pool-wide value conservation is **not** cryptographically enforced at the deposit boundary.

Today this is "mitigated" only because the Core Server constructs the commitment honestly from the deposited amount — a **trusted-backend assertion**, explicitly disallowed for real funds (§1).

**Remediation:** add a **deposit binding proof** verified on-chain (a `DepositVerifier`), proving `commitment = Poseidon(assetId, amount, ownerPubKey, secret, nonce)` with `assetId` and `amount` as public signals equal to the transferred token/amount. Alternatively enforce a canonical deposit-note construction the contract can recompute. This is the #1 mainnet blocker.

### 5.2 Verifier replacement (🔴 CRITICAL — B3)
`setVerifier` (onlyOwner, no timelock) can install a verifier that accepts any proof → forge spends/withdrawals. Mitigate with immutability or timelocked governance.

### 5.3 Custodial spending keys (🟠 HIGH — B4)
`NoteManager.createNote` generates `sk`/`secret` server-side; stored AES-256-GCM encrypted (`secretBlob`). Encryption is authenticated (GCM, fails closed) and never returned by APIs ✅. **But** the server can decrypt and spend any note → not acceptable for real funds. Requires client-side key custody.

### 5.4 Withdrawal is full-note only
`withdraw` requires `amount === inValue` (whole note). No partial withdraw, no change note on withdraw, no multi-recipient. Users must pre-split. Functional gap (§7/§8), not a fund-safety hole.

### 5.5 Relayer / gas-payer linkage
All spends are currently submitted by one server signer → every private op is linked to a single on-chain address, and to the funding of that signer. Undermines sender-unlinkability. Needs a proper relayer boundary (§15).

### 5.6 Lower-severity / to verify under audit
- `transfer`/`split`/`merge` lack `nonReentrant` (no external token calls in them → currently no reentrancy vector, but add for defense-in-depth).
- ERC-20 accounting assumes standard tokens; **fee-on-transfer / rebasing tokens are unsafe** (deposit records `amount`, not the actually-received balance). Define a supported-asset allow-list (§20).
- Native OKB withdraw uses low-level `call` (checked) ✅.
- Nullifier is global (not root-scoped) → correct for permanent double-spend prevention ✅.

---

## 6. What must change for production

### 6.1 Note model
Current: `Poseidon(assetId, value, ownerPubKey, secret, nonce)`; nullifier `Poseidon(sk, secret)`; `ownerPubKey = Poseidon(sk)`. Adequate for hiding, but production should add **viewing/spending key separation** (a viewing key to detect/decrypt incoming notes without spend authority) and consider domain-separation tags per operation. See `production-note-model.md` (to be written).

### 6.2 Deposit binding (B1) — on-chain deposit proof. **Highest priority.**

### 6.3 Withdrawal v2 — partial withdraw + change note; bounded multi-output (fixed N) via a dedicated circuit rather than backend arithmetic (§8).

### 6.4 Trusted setup (B2) — ✅ RESOLVED
Phase 3 used a development ceremony (single-party, reproducible entropy — unsafe). This is
**resolved by switching the proof system from Groth16 to PLONK.** PLONK draws on a
*universal, updatable* structured reference string, so instead of running a bespoke
per-circuit phase-2 ceremony (with its own toxic waste) we anchor to the **Perpetual Powers
of Tau** — a public MPC with **80+ independent contributors**, mirrored by the Ethereum
Foundation's Privacy & Scaling Explorations. Soundness holds iff **≥1** of those 80+
contributors destroyed their secret — a far stronger assumption than any ceremony we could
bootstrap alone, and it required no toxic-waste handling on our side.

Implementation: `packages/zk/scripts/setup-plonk.mjs` fetches the ptau, **verifies its
SHA-256** against a pinned digest, and regenerates every circuit's proving key + Solidity
verifier deterministically; `circuits/build/ceremony-transcript.json` records the SRS
source, hash, contribution number, and per-circuit key hashes so anyone can reproduce and
check the artifacts. Optional cryptographic chain verification via
`SETUP_VERIFY_PTAU=1 pnpm zk:setup` (`snarkjs powersoftau verify`). Privacy is unchanged —
privacy is a property of the circuits, not the proof scheme.

**Residual:** the trusted-setup *ceremony* risk is closed; **circuit correctness** (§8
audit) remains the dominant unforgeability risk and must be externally audited before real
funds.

### 6.5 Protocol fee (B5)
No fee exists in circuits or contract. Production requires an in-circuit fee term (`inValue === out1 + out2 + fee`), an on-chain-enforced max fee, an explicit fee recipient, controlled fee administration, and value-conservation including the fee. See `fees.md` (to be written).

### 6.6 Key management, relayer, metadata — §13/§15/§16 deliverables (docs + design), with client-side key custody as the core change.

---

## 7. What remains impossible (or out of scope) to guarantee

- **Deposit/withdraw amounts and the public recipient/depositor are inherently public** — funds cross the shielded boundary in the clear. Talos hides the *link* between them, not the boundary events themselves.
- **Metadata-level anonymity is not absolute.** Timing, gas payer, amount correlation, and anonymity-set size limit unlinkability. Talos must claim *cryptographic amount/owner privacy for shielded operations*, not "untraceable."
- **PLONK setup security** rests on the Perpetual Powers of Tau (external, public, 80+ contributors), not on any ceremony we run; the SRS hash is pinned and re-derivable.
- **Global adversary / chain-analysis correlation** cannot be fully prevented at the protocol layer.

---

## 8. Required setup & audit requirements

1. ✅ **Trusted setup** — **DONE via PLONK + Perpetual Powers of Tau** universal SRS
   (contribution #80, 80+ independent contributors; SHA-256-pinned; transcript in
   `ceremony-transcript.json`; optional `snarkjs powersoftau verify`). No per-circuit
   ceremony, phase-2 MPC, or toxic-waste destruction is required of us.
2. **External audits** — (a) circuit audit (constraint completeness, under-constraint bugs, malleability), (b) smart-contract audit (accounting, admin powers, reentrancy, token edge cases), (c) cryptographic review of the note/nullifier/fee construction.
3. **Formal invariants / fuzzing** — value, asset, and fee conservation; nullifier uniqueness; Merkle membership (Phase 7 §23).
4. **Operational** — verifier immutability or timelocked governance, monitoring/alerting, emergency pause runbook, reorg-depth policy, client-side key custody + recovery.

---

## 9. Remediation order (Phase 7 §28)

1. ✅ **This audit** + freeze production spec.
2. **B1 — on-chain deposit binding proof** (circuit + `DepositVerifier` + pool `deposit` verification). *Highest priority; without it real funds are unsafe regardless of everything else.*
3. Note/nullifier hardening + viewing/spending key separation.
4. Fee mechanism (circuit + contract + `fees.md`).
5. Withdrawal v2 (partial + change + bounded multi-output).
6. Contract hardening (verifier governance/timelock, supported-asset policy, reentrancy defense-in-depth).
7. Key architecture (client-side custody) + relayer boundary + metadata analysis.
8. Security/property/fuzz tests + real-proof integration regression.
9. ✅ Trusted setup — **done** (PLONK migration over the Perpetual Powers of Tau universal SRS).
10. `mainnet-readiness.md`.

---

## 10. Verdict

The Phase 1–6 protocol is a **sound MVP with real ZK primitives** (real **PLONK**, real Poseidon, real on-chain verification, in-circuit value conservation for spends, double-spend and replay prevention). Of the original blockers, **B1 (deposit binding)**, **B2 (trusted setup — now PLONK over the Perpetual Powers of Tau universal SRS)**, and **B3 (verifier governance/timelock)** are **resolved**; it remains **not safe for real funds** primarily because of **B4 (custodial spending keys)** and the absence of an **external circuit/contract audit**. These, plus the fee and withdrawal-v2 work, define the remaining Phase 7 program.

**Do not enable real funds until B4 is resolved and an external audit is complete.**
