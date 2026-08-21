# Talos ZK System (Phase 3)

The real zero-knowledge proving system that enforces the frozen Talos protocol:
Circom circuits, Poseidon hashing, and a Groth16 proving system over BN254, with a
snarkjs-generated Solidity verifier wired into `TalosPool`.

> This document describes what is implemented. It refines — but does not change —
> the frozen protocol in [`specification.md`](specification.md).

## 1. Toolchain

| Concern      | Choice                                                        |
| ------------ | ------------------------------------------------------------ |
| Circuit DSL  | Circom 2.2.3                                                  |
| Prover/setup | snarkjs 0.7.x                                                 |
| Hash         | Poseidon (circomlib) over BN254                              |
| Proof system | Groth16, curve BN254                                          |
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

## 6. Groth16 setup (development ceremony)

> **DEVELOPMENT ONLY — NOT production-secure.** A single contributor with published,
> fixed entropy strings; the toxic waste is reproducible. A production deployment
> requires a real multi-party ceremony. This is deliberate for the hackathon/testnet MVP.

- **Powers of Tau:** locally generated `bn128`, power **15** (2¹⁵ = 32,768 ≥ the
  largest circuit, merge ≈ 12k constraints). One `contribute`, then `prepare phase2`.
  Entropy string: `"talos development entropy — NOT production"`.
- **Phase 2 (per circuit):** `groth16 setup` → one `zkey contribute`
  (entropy `"talos phase2 entropy — NOT production"`) → `verification_key.json` +
  Solidity verifier.
- Reproduce end-to-end with `pnpm zk:setup`.

## 7. Proving & verifier generation workflow

```text
witness input (private)  →  snarkjs groth16 fullProve  →  proof + public signals
                                     │
                                     ├─ snarkjs verify (off-chain)
                                     └─ generated Solidity verifier (on-chain)
```

Per-circuit Solidity verifiers are generated to
[`contracts/src/verifiers/`](../../contracts/src/verifiers/) (`{Deposit,Transfer,
Split,Merge,Withdraw}Verifier.sol`) and are **generated, never hand-edited**. The
[`TalosVerifier`](../../contracts/src/TalosVerifier.sol) adapter presents each behind
the frozen `ITalosVerifier` interface, reshaping the pool's dynamic `uint256[]`
public signals into the circuit's fixed-size array without touching the generated
pairing check.

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

- Groth16 soundness over BN254; Poseidon preimage/collision resistance.
- The dev trusted setup is **not** production-secure (see §6). Production needs a
  proper ceremony and a re-export of every verifier.
- On-chain verification cost is ~210k gas per proof (see the final report).
