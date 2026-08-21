# Proof Service

`ProofService` (`src/proofs/service.ts`) generates **real Groth16 proofs** with
snarkjs using the Phase 3 artifacts (`circuits/build/<circuit>/`). There are no mock
proofs and no fake verification anywhere in production paths.

## Flow

```text
witness (private) → snarkjs groth16.fullProve → { proof, publicSignals }
                  → snarkjs groth16.verify (off-chain self-check)
                  → validate public-signal count
                  → exportSolidityCallData → Groth16Proof (a, b, c)
                  → ProofPackage
```

## ProofPackage (§17)

```ts
{ operation, circuit, proof, publicSignals, verificationKeyId, generatedAt }
```

## Public-signal layouts (frozen)

| Circuit  | publicSignals (order)                                   |
| -------- | ------------------------------------------------------- |
| deposit  | `[assetId, amount, commitment]`                          |
| transfer | `[root, nullifier, outCommitment1, outCommitment2]`      |
| split    | `[root, nullifier, outCommitment1, outCommitment2]`      |
| merge    | `[root, nullifier1, nullifier2, outCommitment]`          |
| withdraw | `[root, nullifier, amount, recipient, assetId]`          |

The execution engine additionally asserts the returned public signals **exactly
match** the values it intends to submit (`assertPublicSignals`), so a prover cannot
substitute a valid proof for a different state.

## Witness handling

Witness inputs contain note secrets and are assembled in memory only
(`src/proofs/witness.ts`); they are never logged, persisted, or returned. Generated
witness files are git-ignored.

## Consistency with the Merkle mirror

Proofs are built against a Merkle path from the `MerkleSynchronizer`, whose Poseidon
matches the on-chain hasher, so the proof's `root` equals a real on-chain root.
