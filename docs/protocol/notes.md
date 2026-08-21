# Protocol: Notes

> **Status: fully implemented.** The note model, commitment preimage, and nullifier
> preimage are frozen in [`specification.md`](specification.md); the concrete
> key model and Poseidon hashing are in [`zk-system.md`](zk-system.md). The on-chain
> half shipped in Phase 2; Phase 3 implemented the circuits that produce and prove
> these commitments/nullifiers. This page is an orientation summary; where it and the
> specification differ, the specification wins.

## What a note is

Talos represents private value as **notes** (a UTXO-style model). Only a note's
**commitment** is published on-chain; the underlying fields stay client-side.

Frozen note fields (see the spec for exact semantics):

```text
Note { assetId, value, ownerPubKey, secret, nonce }
```

- `assetId` must equal `ASSET_ID` (= 1) for the single-asset MVP.
- `value` is bounded: `0 < value ≤ MAX_VALUE` (`2¹²⁸ − 1`).
- `ownerPubKey`, `secret`, `nonce` are field elements in `[0, r)`.

## Commitment (frozen)

```text
commitment = Poseidon(assetId, value, ownerPubKey, secret, nonce)   // arity 5
```

The contract treats commitments as **opaque** field elements: it validates the
range, rejects zero and duplicates, inserts them into the Merkle tree, but never
computes Poseidon on-chain. The commitment producer is the Phase 3 circuit.

## Lifecycle

```text
create  → commitment inserted into the on-chain Merkle tree   (implemented, Phase 2)
spend   → nullifier revealed and recorded as spent            (implemented, Phase 2)
```

Deposit/receive create output commitments; Transfer/Split/Merge/Withdraw spend input
notes (via nullifiers) and create output notes (via commitments). Value conservation
is enforced privately by the Phase 3 circuit; the contract enforces the surrounding
state transition today (root/nullifier/commitment checks + verifier boundary).

## Secret handling

`secret`, `ownerPubKey`, and any spending-key material are **never** logged, never
persisted in plaintext, and never emitted in events. They exist only client-side to
build witnesses. See [`../security/threat-model.md`](../security/threat-model.md).
