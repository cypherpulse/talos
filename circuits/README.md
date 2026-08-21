# Talos Circuits

Zero-knowledge circuits for the Talos protocol — **implemented in Phase 3**.

Full design and workflow: [`../docs/protocol/zk-system.md`](../docs/protocol/zk-system.md).

## Toolchain

| Concern      | Tool                                              |
| ------------ | ------------------------------------------------- |
| Circuit DSL  | [Circom](https://docs.circom.io/) 2.2.3           |
| Proof system | **Groth16** over BN254                            |
| Prover/setup | [snarkjs](https://github.com/iden3/snarkjs) 0.7.x |
| Hashing      | Poseidon (`circomlib`)                            |

`circom` is a standalone binary (install from the
[releases](https://github.com/iden3/circom/releases) or via cargo). `snarkjs`,
`circomlib`, and `circomlibjs` are pnpm dependencies of `@talos/zk`.

## Layout

```text
circuits/
├── common/        Commitment, Nullifier, MerkleProof, NoteData, ValueRange gadgets
├── deposit/       deposit.circom      public → 1 note
├── transfer/      transfer.circom     1 note → 2 notes (may change owner)
├── split/         split.circom        1 note → 2 notes (same owner)
├── merge/         merge.circom        2 notes → 1 note
├── withdraw/      withdraw.circom     1 note → public recipient
├── test-vectors/  vectors.json        Poseidon/commitment/nullifier/Merkle vectors
└── build/         generated artifacts (git-ignored)
```

## Commands

Run from the repo root:

```bash
pnpm zk:build      # compile all circuits → circuits/build/<name>/
pnpm zk:setup      # Groth16 dev ceremony → zkeys + Solidity verifiers
pnpm zk:vectors    # regenerate test vectors
pnpm zk:fixtures   # generate real proof fixtures for the Solidity E2E tests
pnpm zk:negtest    # circuit negative tests (invalid witness must fail)
```

## Artifact & security policy

Proving keys (`.zkey`), Powers of Tau (`.ptau`), compiled `.r1cs`/`.wasm`, and
witnesses are **generated, never committed** (git-ignored). Regenerate with the
commands above.

> **The trusted setup here is a DEVELOPMENT ceremony** (single contributor, fixed
> published entropy) — reproducible, but **not production-secure**. A production
> deployment requires a real multi-party ceremony and re-exported verifiers.
