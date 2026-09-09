# Changelog

All notable changes to `@talos/sdk` are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## 0.1.0 — Unreleased

Initial release.

### Added

- **`TalosClient`** — one-call, non-custodial `prepareDeposit`, `withdraw`, `split`,
  `merge`, and `transfer`, plus reads. Keys are derived on the client from a wallet
  signature and never leave the process; spends are proved locally and relayed.
- **`TalosApi`** — typed `fetch` REST client for the Talos Core Server.
- **Signers** — `signerFromPrivateKey` (Node/CLI/agents, viem) and `signerFromInjected`
  (browser wallet), behind a small `TalosSigner` interface.
- **Artifact sources** — `fileArtifacts` (Node) and `httpArtifacts` (browser) for loading
  circuit proving keys at runtime.
- **Primitives** — key derivation (`deriveTalosKeys`, …), commitment/nullifier helpers,
  circuit witness builders, and `provePlonk` (self-verifies before returning).
- Isomorphic across Node 20+ and modern browsers; ships ESM with type declarations.

### Notes

- Circuit artifacts are not bundled (spend keys are tens of MB); point the SDK at them via
  `fileArtifacts`/`httpArtifacts`.
- Deposits require an on-chain transaction from the caller's wallet; spends are server-relayed.
- Not audited. Recipient note discovery for transfers (viewing-key note encryption) is not
  yet implemented.
