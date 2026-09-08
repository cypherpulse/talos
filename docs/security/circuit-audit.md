# Talos — Internal Circuit-Correctness Audit (Phase 7)

> **Status: internal audit — NOT a substitute for an independent external audit.**
> This is a self-review by the implementers. It raises assurance in circuit soundness and
> is backed by executable soundness tests, but real-funds deployment still requires an
> **independent** circuit + contract audit (see [mainnet-readiness.md](./mainnet-readiness.md)).

With **B2 resolved** (Groth16 → PLONK over the Perpetual Powers of Tau universal SRS), the
trusted-setup ceremony is no longer the dominant unforgeability risk. **Circuit
correctness** is. This document is the internal audit of the five operation circuits and
their shared gadgets, plus the executable evidence that the claimed constraints actually
fire.

## Scope

- Gadgets: [`commitment`](../../circuits/common/commitment.circom),
  [`nullifier`](../../circuits/common/nullifier.circom),
  [`merkle`](../../circuits/common/merkle.circom),
  [`note`](../../circuits/common/note.circom) (`NoteData`, `ValueRange`).
- Circuits: [`deposit`](../../circuits/deposit/deposit.circom),
  [`transfer`](../../circuits/transfer/transfer.circom),
  [`split`](../../circuits/split/split.circom),
  [`merge`](../../circuits/merge/merge.circom),
  [`withdraw`](../../circuits/withdraw/withdraw.circom).

## Method

1. **Manual constraint review** — for every circuit: are all *public outputs* fully
   determined and *bound* (`===`) to recomputed values? Are all witness values that enter
   an additive sum *range-checked*? Are membership/ownership/nullifier constraints present?
2. **Executable soundness tests** — [`packages/zk/scripts/neg-tests.mjs`](../../packages/zk/scripts/neg-tests.mjs)
   (`pnpm zk:negtest`): proves a valid baseline for **every** circuit, then asserts a
   malicious witness is **rejected** for each soundness property, and that tampered
   proofs / public signals fail verification.
3. **On-chain real-proof E2E** — [`contracts/test/TalosE2E.t.sol`](../../contracts/test/TalosE2E.t.sol):
   real PLONK proofs verified by the generated Solidity verifiers, incl. tamper/replay/
   amount-mismatch rejects.

## The classic ZK-circuit bug classes, and where Talos stands

| Bug class | Risk | Talos |
|---|---|---|
| **Under-constrained output** (a public signal not bound to a recomputed value) | forge arbitrary outputs | ✅ every `outCommitment*`, `nullifier*`, `root`, and deposit `commitment` is bound with `===` to a recomputed Poseidon value |
| **Missing range check** → field-overflow value conservation bypass | mint value by wrapping the field | ✅ `ValueRange` (`Num2Bits(128)`) on **every** input, output, **and the merge sum** `in1+in2`; conservation sums cannot wrap BN254 |
| **Merkle path index not boolean** | forge membership | ✅ `pathIndices[i]*(1-pathIndices[i]) === 0` per level |
| **Nullifier not bound to spent note** | double-spend | ✅ `nullifier === Poseidon(sk, secret)` with `ownerPubKey = Poseidon(sk)` inside the committed note; on-chain nullifier set prevents replay |
| **Merge: same note used twice** | double-count value | ✅ in-circuit `IsEqual(c1,c2) === 0`; on-chain also rejects duplicate nullifiers |
| **Asset substitution** in a spend | swap asset | ✅ outputs inherit the input asset; merge enforces `in1Asset === in2Asset` |
| **Recipient malleability** (withdraw) | redirect payout | ✅ `recipient` is a public input pinned into a constraint (`recipient*recipient`); changing it invalidates the proof (E2E-tested) |
| **Assignment without constraint** (`<--` vs `<==`) | unconstrained witness | ✅ none used; all assignments are `<==`/`===` |

## Findings

**No soundness-breaking (fund-loss) findings.** All value-conservation, binding, range,
membership, and distinctness properties are enforced in-circuit and independently
re-verified on-chain. Items below are **informational / design notes**, not exploits.

| # | Severity | Finding |
|---|---|---|
| C-1 | **INFO** | **Nullifier aliasing.** `nullifier = Poseidon(sk, secret)` does not depend on `value`/`nonce`/`assetId`. Two *distinct* notes that share `(sk, secret)` therefore share a nullifier, so only one can ever be spent. This can only harm a user who (needlessly) reuses `(sk, secret)`; secrets are sampled uniformly at random per note, so collision is negligible, and it is **not** a protocol drain vector (it strictly reduces spendability). Documented so key-management code never reuses `secret`. |
| C-2 | **INFO** | **Single-asset trust root.** Spends take `inAssetId` as a private input not pinned to a constant; asset integrity rests on the input note's Merkle membership (deposits validate the asset on-chain) and on outputs inheriting `inAssetId`. Correct for the current single-asset (and registry-gated) model; a multi-asset extension must additionally constrain/expose the asset per note. |
| C-3 | **INFO** | **Withdraw `amount === inValue` is redundant** with `inNote.value <== amount`. Harmless defensive redundancy; kept. |
| C-4 | **LOW (fixed)** | **`neg-tests.mjs` still called `snarkjs.groth16`** after the PLONK migration — the soundness suite would not run. **Fixed**: ported to `snarkjs.plonk` and expanded from split-only to all five circuits + range/merge-distinctness/asset-mismatch/deposit-binding cases. |
| B4 | **HIGH (not fixed — architectural)** | **Custodial spending keys.** `NoteManager.createNote` generates `sk`/`secret`/`nonce` server-side and persists `nullifierSecret = sk` (encrypted at rest). A server compromise can therefore **spend user notes**. This is a *custody* issue, not a *circuit* issue — the circuits are sound; the private witness simply lives server-side. See remediation below. |

## B4 remediation path (concrete, staged)

The building blocks already exist:

- `NoteManager.createExternalNote` already constructs recipient notes **without** knowing
  `sk` (`nullifierSecret = ""`) — the non-custodial pattern, proven usable.
- `createNote` already accepts a caller-supplied `sk` (`CreateNoteParams.sk`), and
  [`app.ts`](../../services/core/src/api/app.ts) exposes a spending-key generation endpoint.
- **Deposits need no `sk` at all**: [`deposit.circom`](../../circuits/deposit/deposit.circom)'s
  private witness is `{ownerPubKey, secret, nonce}` — not `sk`. So the deposit binding proof
  can be generated by the server from a **client-supplied `ownerPubKey`** while the client
  keeps `sk` entirely local. This makes the deposit path non-custodial with no circuit change.

Staged plan:
1. **Deposits non-custodial** (small): client generates `sk` locally, derives
   `ownerPubKey = Poseidon(sk)`, sends only `ownerPubKey` (+ optionally `secret`/`nonce`);
   server proves deposit binding without ever seeing `sk`.
2. **Client-side spend proving** (large): move witness generation + PLONK proving for
   transfer/split/merge/withdraw into the client (the `.wasm` + `_final.zkey` already ship);
   server keeps only public data and the encrypted note *ciphertext* for the owner.
3. **Viewing/spending key separation + note encryption** (large): recipients receive
   encrypted note payloads; a viewing key enables discovery without spend authority.

Until at least (1)+(2) land, **B4 remains open and the system is not safe for real funds.**
This audit does not claim to have fixed B4.

## Verdict

The Talos circuits are, to the depth of this internal review and its executable tests,
**sound with respect to value conservation, binding, range, membership, nullifier
correctness, merge distinctness, and asset consistency** — the properties on which
unforgeability depends. The residual pre-mainnet requirements are (a) an **independent**
external circuit + contract audit and (b) **B4** (client-side key custody). Neither can be
satisfied by self-review alone, and we do not claim otherwise.
