# Blockchain Integration

## X Layer client (`src/blockchain/client.ts`)

Built on viem. Exposes `getBlockNumber`, `getBalance`, `getGasPrice`,
`getTransactionReceipt`, `getConfirmations`, `readContract`, `estimateContractGas`,
`writeContract` (simulate + send), and `waitForReceipt(hash, confirmations)`. RPC
failures surface as the typed `BLOCKCHAIN_UNAVAILABLE`. The RPC URL, chain id, and
explorer come from config — never hardcoded.

## Signer (`src/blockchain/signer.ts`)

`SignerProvider` abstracts signing. The dev implementation is environment-backed
(`SIGNER_PRIVATE_KEY`, testnet only); a future HSM/KMS/multisig signer is a drop-in
replacement. Keys are never logged or returned via APIs.

## Contract client (`src/contracts`)

Typed methods for `TalosPool` (deposit/transfer/split/merge/withdraw + reads
getLastRoot/isKnownRoot/isNullifierSpent/nextLeafIndex/merkleDepth) and the ERC-20
test asset. All raw ABI interaction is confined here; the rest of the app works in
decimal strings / bigints. ABIs mirror the frozen Phase 2/3 interfaces.

## Transaction manager (`src/transactions`)

Wraps a contract write in a durable lifecycle: `PENDING → SUBMITTED → CONFIRMED`,
tracking hash, block, gas, and confirmations. A submitted transaction is **never**
assumed confirmed — the manager waits for `X_LAYER_CONFIRMATIONS_REQUIRED` and checks
the receipt status before reporting success. A revert yields `FAILED` and aborts the
operation.

## Confirmation depth

`submitted → included → confirmed → finalized` is distinguished by confirmation
count. `X_LAYER_CONFIRMATIONS_REQUIRED` (default 2) governs when an operation is
treated as confirmed.
