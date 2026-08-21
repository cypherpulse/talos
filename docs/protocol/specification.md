# Talos Protocol Specification (MVP)

> **Authoritative specification for Phase 2 and Phase 3.**
> This document freezes the note model, commitment/nullifier construction, Merkle
> tree, state transitions, public/private inputs, events, and errors. The Phase 2
> Solidity in `contracts/` implements the on-chain half; the Phase 3 Circom circuits
> MUST match every construction and input ordering defined here exactly.

## 0. Status of cryptography

Phase 2 implemented the protocol **state machine**; **Phase 3 wired in the real
cryptography** — the circomlib Poseidon(2) hasher and the snarkjs-generated Groth16
verifiers (see [`zk-system.md`](zk-system.md)). The pool now provides ZK soundness and
privacy when deployed with those verifiers; it never fakes proof verification. See
[`../security/threat-model.md`](../security/threat-model.md).

## 1. Constants (frozen)

Defined in [`contracts/src/TalosTypes.sol`](../../contracts/src/TalosTypes.sol).

| Constant           | Value                                                                 |
| ------------------ | --------------------------------------------------------------------- |
| `FIELD_SIZE` (`r`) | `21888242871839275222246405745257275088548364400416034343698204186575808495617` (BN254 scalar field) |
| `MERKLE_DEPTH`     | `20` (2²⁰ = 1,048,576 leaves)                                          |
| `ROOT_HISTORY_SIZE`| `30`                                                                  |
| `ZERO_VALUE`       | `keccak256("Talos")` = `0x00690d…dd431f` (already `< r`)               |
| `ASSET_ID`         | `1` (the single test asset)                                           |
| `MAX_VALUE`        | `2¹²⁸ − 1`                                                             |

All commitments, nullifiers, and Merkle nodes are elements of `GF(r)`: canonical
values in `[0, r)`. The contract validates this on every external input.

## 2. Note model

A note is the private representation of value. Fields (frozen order):

```text
Note {
    assetId      // field element; MUST equal ASSET_ID for the MVP
    value        // integer in (0, MAX_VALUE]
    ownerPubKey  // field element; Poseidon-based spending public key
    secret       // field element; per-note random secret
    nonce        // field element; per-note random nonce (uniqueness / domain sep.)
}
```

The full note is **never** stored on-chain. Only its commitment is inserted into the
Merkle tree. `secret`/`ownerPubKey` are private and never leave the client.

## 3. Commitment (frozen)

```text
commitment = Poseidon(assetId, value, ownerPubKey, secret, nonce)   // arity 5
```

- Input order is fixed exactly as above.
- The result is a field element in `[0, r)`.
- The contract treats commitments as **opaque** field elements: it validates the
  range and nonzero-ness and rejects duplicates, but never recomputes Poseidon
  on-chain. The Phase 3 deposit/spend circuits are the sole producers of valid
  commitments.

## 4. Nullifier (frozen)

```text
nullifier = Poseidon(nullifierSecret, secret)                       // arity 2
```

- `nullifierSecret` is derived from the owner's spending key such that only the
  owner can compute it.
- Properties: the **same note ⇒ the same nullifier** (deterministic), and
  **different notes ⇒ cryptographically independent nullifiers** (Poseidon
  collision/preimage resistance over distinct secrets).
- The contract maintains a spent-nullifier set; a nullifier is accepted at most
  once, ever. This is the core double-spend / replay defence.

## 5. Merkle tree (frozen)

- **Type:** append-only incremental Merkle tree, fixed depth `MERKLE_DEPTH`.
- **Arity:** binary. **Leaf:** a note commitment. **Internal node:**
  `Poseidon(left, right)` (arity 2), the same hasher the membership circuit uses.
- **Empty leaf:** `ZERO_VALUE`; empty-subtree roots are precomputed per level.
- **Root history:** the last `ROOT_HISTORY_SIZE` roots are retained so a proof built
  against a recent (possibly no-longer-current) root still verifies. A spend’s
  `root` public input must be a known historical root.
- Implemented in [`MerkleTreeLib`](../../contracts/src/libraries/MerkleTreeLib.sol);
  the hasher is injected via [`IHasher`](../../contracts/src/interfaces/IHasher.sol)
  (real Poseidon in Phase 3).

## 6. Operations, state transitions, and inputs

Transaction shapes are fixed; arbitrary N-to-M is out of scope.

| Operation | Inputs        | Outputs          | Value invariant (Phase 3 circuit) |
| --------- | ------------- | ---------------- | --------------------------------- |
| Deposit   | public asset  | 1 note           | `value == amount` (deposit circuit) |
| Transfer  | 1 note        | 2 notes          | `in = out₁ + out₂`                |
| Split     | 1 note        | 2 notes          | `in = out₁ + out₂`                |
| Merge     | 2 notes       | 1 note           | `in₁ + in₂ = out`                 |
| Withdraw  | 1 note        | public recipient | `in.value == amount`              |

### Public inputs (frozen order — the verifier’s `publicSignals`)

The pool builds these arrays and passes them to the operation’s verifier. Phase 3
circuits must expose public signals in exactly this order.

| Operation | `publicSignals` (in order)                                   |
| --------- | ------------------------------------------------------------ |
| Transfer  | `[root, nullifier, outputCommitment1, outputCommitment2]`     |
| Split     | `[root, nullifier, outputCommitment1, outputCommitment2]`     |
| Merge     | `[root, nullifier1, nullifier2, outputCommitment]`            |
| Withdraw  | `[root, nullifier, amount, recipient, assetId]`              |
| Deposit\* | `[assetId, amount, commitment]`                              |

\*Deposit has **no proof in Phase 2**; the row reserves the public-input layout for
the Phase 3 deposit circuit that will bind `commitment` to the public `amount`/`assetId`.
`recipient` is encoded as `uint256(uint160(address))`.

### Private inputs (witness — Phase 3, informative)

- **Transfer/Split:** input note fields (`assetId, value, ownerPubKey, secret,
  nonce`), the Merkle authentication path (siblings + index bits) proving the input
  commitment is under `root`, `nullifierSecret`, and the two output notes’ fields.
- **Merge:** the two input notes and their two authentication paths, both
  `nullifierSecret`s, and the single output note.
- **Withdraw:** the input note, its authentication path, and `nullifierSecret`.
- **Deposit:** the output note fields (proving `commitment` encodes public
  `assetId`/`amount`).

### On-chain state transition (Phase 2, enforced now)

For each private operation the pool enforces, in order (checks → effects):

1. `root` is a known historical root, else `Talos__InvalidRoot`.
2. every input `nullifier` is a canonical, unspent field element, else
   `Talos__InvalidFieldElement` / `Talos__NullifierAlreadySpent`; for Merge the two
   nullifiers must differ (`Talos__DuplicateNullifier`).
3. every output `commitment` is a canonical, nonzero, not-yet-inserted field
   element (`Talos__InvalidCommitment`); the two outputs of Transfer/Split must
   differ.
4. the operation’s verifier accepts `(proof, publicSignals)`, else
   `Talos__InvalidProof` (or `Talos__InvalidVerifier` if none configured).
5. **effects:** mark nullifier(s) spent; insert output commitment(s); advance the
   Merkle root.
6. **interactions (Withdraw only):** transfer `amount` of the asset to `recipient`.

## 7. Asset handling

One ERC-20 test asset, fixed at deployment (`asset`), addressed by `ASSET_ID`.
Deposit pulls `amount` via `transferFrom`; Withdraw pays `amount` via `transfer`.
Both use a safe wrapper that reverts on failure and tolerates non-standard tokens.
Multi-asset support (a registry keyed by `assetId`) is a documented future extension.

## 8. Events

Declared in [`ITalosPool`](../../contracts/src/interfaces/ITalosPool.sol). Every
event carries **public data only** — never secrets, keys, or witness data.

| Event                | Fields                                                            |
| -------------------- | ---------------------------------------------------------------- |
| `Deposit`            | `commitment`, `leafIndex`, `assetId`, `amount`, `newRoot`         |
| `CommitmentInserted` | `commitment`, `leafIndex`, `newRoot`                             |
| `PrivateTransfer`    | `nullifier`, `outputCommitment1`, `outputCommitment2`, `newRoot`  |
| `Split`              | `nullifier`, `outputCommitment1`, `outputCommitment2`, `newRoot`  |
| `Merge`              | `nullifier1`, `nullifier2`, `outputCommitment`, `newRoot`         |
| `Withdrawal`         | `nullifier`, `recipient`, `assetId`, `amount`                    |
| `NullifierSpent`     | `nullifier`                                                       |
| `RootUpdated`        | `newRoot`, `leafIndex`                                           |

Admin events: `OwnershipTransferred`, `VerifierUpdated`, `PausedSet`.

## 9. Errors

Custom errors (`Talos__*`) in
[`TalosErrors.sol`](../../contracts/src/TalosErrors.sol): `InvalidCommitment`,
`InvalidFieldElement`, `InvalidProof`, `InvalidVerifier`, `InvalidRoot`,
`NullifierAlreadySpent`, `DuplicateNullifier`, `InvalidRecipient`, `InvalidAsset`,
`InvalidAmount`, `TransferFailed`, `InvalidParameters`, `MerkleTreeFull`,
`ReentrantCall`, `NotOwner`, `EnforcedPause`, `NotImplemented`.

## 10. Replay protection

A note’s nullifier is revealed on spend and permanently recorded. Any later
submission bearing a recorded nullifier reverts (`Talos__NullifierAlreadySpent`) —
whether it is a byte-for-byte replay of the same transaction or the same nullifier
inside a different operation. For Withdraw, `recipient` and `amount` are public
inputs, so a valid proof is additionally bound to one exact payout and cannot be
redirected.

## 11. Value conservation

Value equalities (`in = out₁ + out₂`, `in₁ + in₂ = out`, `in.value == amount`) are
**private** and are proven in-circuit in Phase 3; the contract cannot see amounts
for the private operations and does not attempt to. `MAX_VALUE = 2¹²⁸ − 1` bounds
note values so in-circuit sums cannot overflow the field.

## 12. Proof verification boundary

`TalosPool` holds one [`ITalosVerifier`](../../contracts/src/interfaces/ITalosVerifier.sol)
per operation (`verifiers[Operation]`), configured by the owner. `verifyProof(a, b,
c, publicSignals)` is the Groth16 shape snarkjs emits. As of Phase 3 the production
[`TalosVerifier`](../../contracts/src/TalosVerifier.sol) is an adapter that forwards
to the snarkjs-generated per-circuit verifiers in
[`contracts/src/verifiers/`](../../contracts/src/verifiers/); it returns exactly what
the generated pairing check returns and never fabricates a `true`.

## 13. Access control

A single `owner` may: configure verifiers (`setVerifier`), pause/unpause
(`setPaused`), and transfer ownership (`transferOwnership`). The owner **cannot**
move user funds, spend notes, forge proofs, or mutate the tree. The asset is
immutable, so it is not an administrative lever. This is the entire privileged
surface.
