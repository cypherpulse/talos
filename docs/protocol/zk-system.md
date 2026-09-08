# Talos ZK System (Phase 3)

The real zero-knowledge proving system that enforces the frozen Talos protocol:
Circom circuits, Poseidon hashing, and a **PLONK** proving system over BN254, with a
snarkjs-generated Solidity verifier wired into `TalosPool`. PLONK's *universal* setup
(the Perpetual Powers of Tau) removes the per-circuit trusted-setup ceremony — see §6.

> This document describes what is implemented. It refines — but does not change —
> the frozen protocol in [`specification.md`](specification.md).

## 1. Toolchain

| Concern      | Choice                                                        |
| ------------ | ------------------------------------------------------------ |
| Circuit DSL  | Circom 2.2.3                                                  |
| Prover/setup | snarkjs 0.7.x                                                 |
| Hash         | Poseidon (circomlib) over BN254                              |
| Proof system | PLONK, curve BN254 (universal setup)                          |
| On-chain     | Generated Solidity verifier + Poseidon(2) contract, solc 0.8.30 |

## 2. Circuit architecture

Reusable gadgets in [`circuits/common/`](../../circuits/common/):

- `commitment.circom` — `Commitment()` = `Poseidon(assetId, value, ownerPubKey, secret, nonce)`.
- `nullifier.circom` — `Nullifier()` = `Poseidon(nullifierSecret, secret)`.
- `merkle.circom` — `MerkleProof(depth)` recomputes a root from a leaf + path using `Poseidon(2)`.
- `note.circom` — `NoteData()` derives `ownerPubKey`, `commitment`, `nullifier` from a note's
  private fields + spending key; `ValueRange()` enforces `0 ≤ value < 2^128`.

Five operation circuits compose these:

| Circuit  | Shape           | Public signals (frozen order)                         | Constraints (non-linear) |
| -------- | --------------- | ----------------------------------------------------- | ------------------------ |
| deposit  | public → 1 note | `[assetId, amount, commitment]`                        | 452                      |
| transfer | 1 → 2           | `[root, nullifier, outCommitment1, outCommitment2]`    | 6,715                    |
| split    | 1 → 2           | `[root, nullifier, outCommitment1, outCommitment2]`    | 6,715                    |
| merge    | 2 → 1           | `[root, nullifier1, nullifier2, outCommitment]`        | 12,075                   |
| withdraw | 1 → recipient   | `[root, nullifier, amount, recipient, assetId]`        | 5,812                    |

## 3. Key model (concrete instantiation)

The Phase 2 spec left `ownerPubKey` and `nullifierSecret` abstract. Phase 3 fixes them:

```text
sk           : spending key (private)
ownerPubKey  = Poseidon(sk)     (committed inside the note commitment)
nullifierSecret = sk            (so nullifier = Poseidon(sk, secret))
```

Proving knowledge of `sk` with `ownerPubKey = Poseidon(sk)` is the ownership check.
This refines, and is consistent with, the frozen commitment/nullifier field orders —
it does not change them.

## 4. What each circuit proves

Every spend circuit enforces, in-circuit (a malicious prover cannot bypass):

- **Ownership** — knowledge of `sk` behind the note's `ownerPubKey`.
- **Merkle membership** — the input commitment is under the public `root`.
- **Nullifier correctness** — the public nullifier equals `Poseidon(sk, secret)`.
- **Commitment correctness** — output commitments equal `Poseidon(...)` of their fields.
- **Asset consistency** — all inputs/outputs share the asset.
- **Value conservation** — `in = out1 + out2` / `in1 + in2 = out` / `amount = value`.
- **Range** — every value is `< 2^128`, so sums cannot overflow the field.
- **Merge distinctness** — the two input notes are different (`commitment1 ≠ commitment2`).
- **Withdraw recipient binding** — `recipient` enters the constraint system, so a valid
  proof cannot be replayed to a different recipient.

Private witness fields (values, secrets, keys, nonces, paths) are never public signals.

## 5. Poseidon compatibility

The in-circuit Poseidon (circomlib), the off-chain builder (circomlibjs), and the
on-chain hasher (the circomlib-generated `Poseidon(2)` contract, deployed from
bytecode) share identical constants. Agreement is proven by:

- [`circuits/test-vectors/vectors.json`](../../circuits/test-vectors/vectors.json) —
  deterministic Poseidon / commitment / nullifier / Merkle vectors.
- [`contracts/test/PoseidonVectors.t.sol`](../../contracts/test/PoseidonVectors.t.sol) —
  deploys the real Poseidon(2) and asserts it reproduces the vector `poseidon2` and
  Merkle `root`.
- The end-to-end proofs verifying on-chain (below), which are built from these hashes.

If they ever disagree, **stop** — do not adjust values to force a match.

## 6. PLONK setup (universal SRS — Perpetual Powers of Tau)

> **Production-grade setup.** PLONK uses a *universal, updatable* structured reference
> string, so there is **no per-circuit phase-2 ceremony and no per-circuit toxic waste**.
> We anchor to the real **Perpetual Powers of Tau** (contribution **#80**, 80+ independent
> contributors), mirrored by the Ethereum Foundation's Privacy & Scaling Explorations
> (PSE). The setup is sound iff **≥1** of those 80+ contributors destroyed their secret.

- **Powers of Tau:** `ppot_0080_16.ptau` (`bn128`, power **16** = 65,536 ≥ the largest
  circuit — merge ≈ 30.6k PLONK constraints). Downloaded from PSE and **SHA-256-verified**
  against a pinned digest on every build; it is a build-time input only (runtime needs just
  the per-circuit `_final.zkey` + `verification_key.json`).
- **Per circuit:** `plonk setup <r1cs> <ptau> <name>_final.zkey` (deterministic — no
  contribution) → `verification_key.json` → Solidity verifier. No secret is produced.
- **Transcript:** [`circuits/build/ceremony-transcript.json`](../../circuits/build/ceremony-transcript.json)
  records the SRS source, hash, contribution number, and per-circuit zkey/vkey/verifier
  hashes so anyone can reproduce and check the artifacts.
- Reproduce end-to-end with `pnpm zk:setup`. Optional cryptographic chain verification of
  the ptau: `SETUP_VERIFY_PTAU=1 pnpm zk:setup` (runs `snarkjs powersoftau verify`; slow).

> **Why this closes B2:** privacy is a property of the *circuits*, not the proof scheme, so
> the migration from Groth16 changed **nothing** about what is hidden — it only replaced a
> dev-only single-party trusted setup with a public multi-party universal one.

## 7. Proving & verifier generation workflow

```text
witness input (private)  →  snarkjs plonk fullProve  →  proof (uint256[24]) + public signals
                                     │
                                     ├─ snarkjs verify (off-chain)
                                     └─ generated Solidity verifier (on-chain)
```

Per-circuit Solidity verifiers are generated to
[`contracts/src/verifiers/`](../../contracts/src/verifiers/) (`{Deposit,Transfer,
Split,Merge,Withdraw}Verifier.sol`) and are **generated, never hand-edited**. Each exposes
`verifyProof(uint256[24] proof, uint256[N] pubSignals)`. The
[`TalosVerifier`](../../contracts/src/TalosVerifier.sol) adapter presents each behind
the frozen `ITalosVerifier` interface, reshaping the pool's dynamic `uint256[]`
public signals into the circuit's fixed-size array without touching the generated
verification.

## 8. Artifacts & regeneration

Generated artifacts (`.r1cs`, `.wasm`, `.zkey`, `.ptau`, witnesses) are **git-ignored**;
proving keys and trusted-setup outputs are never committed. Committed: circuit
sources, generated Solidity verifiers, `verification_key.json` is ignored, the
Poseidon bytecode fixture, and the public proof fixtures (no secrets).

```bash
pnpm --filter @talos/zk zk:build     # circom compile → circuits/build/<name>/
pnpm --filter @talos/zk zk:setup     # ptau + zkeys + Solidity verifiers
pnpm --filter @talos/zk zk:vectors   # test vectors
pnpm --filter @talos/zk zk:fixtures  # real proofs → contracts/test/fixtures/
pnpm --filter @talos/zk zk:negtest   # circuit negative tests
forge build --root contracts
forge test  --root contracts -vvv
```

## 9. End-to-end integration

[`contracts/test/TalosE2E.t.sol`](../../contracts/test/TalosE2E.t.sol) deploys the
real Poseidon(2), the pool, and the generated verifiers, replays deposits to
reproduce the exact on-chain Merkle root, then submits real proofs:

- deposit, split (100 → 60 + 40), merge (60 + 40 → 100), transfer (→ two owners),
  withdraw (note value → recipient, ERC-20 paid) all succeed;
- tampered proof, tampered public signal, unknown root, and nullifier replay all revert.

No mock verifier or mock hasher is used in these paths.

## 10. Witness handling & privacy

Private witnesses stay off-chain. Fixtures contain only public data + proofs; witness
input files with secrets are `.gitignore`d. No secret is ever logged, committed, put
in source, emitted in an event, or stored on-chain.

## 11. Security assumptions

- PLONK soundness over BN254 (KZG); Poseidon preimage/collision resistance.
- The trusted setup is the **public Perpetual Powers of Tau universal SRS** (see §6),
  sound iff ≥1 of its 80+ contributors was honest; residual soundness risk is circuit
  correctness, pending external audit. No per-circuit ceremony is required.
- On-chain verification cost is ~290k gas per proof (PLONK; see the final report).
