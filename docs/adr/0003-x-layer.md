# ADR 0003 — X Layer as the Target Chain

- **Status:** Accepted (frozen for the MVP)
- **Date:** 2026-08-20
- **Context:** Phase 1 — Foundation & Architecture

## Context

Talos executes agent-driven, ZK-private value transfers on-chain. It needs an
EVM-compatible chain with low fees (every operation verifies a Groth16 proof
on-chain), standard Ethereum tooling, and a usable testnet for the MVP.

## Decision

Target **X Layer** (an EVM-compatible zk-based L2) for the MVP. The MVP is built and
tested on **X Layer testnet**.

## Rationale

- **EVM compatibility** means the entire Solidity + Foundry + viem/wagmi toolchain
  applies unchanged, and the snarkjs-exported Solidity verifier deploys as-is.
- **Low fees** keep on-chain Groth16 verification economical, which is central to
  Talos's per-operation proof model.
- **Standard tooling and a public testnet** let us develop and demo the MVP without
  mainnet risk.

## Configuration

Network parameters are supplied via the environment (never hardcoded). See
`.env.example`:

```text
XLAYER_TESTNET_RPC_URL
XLAYER_TESTNET_CHAIN_ID   # 195 (X Layer testnet)
XLAYER_EXPLORER_URL
```

Foundry reads the RPC endpoint from `XLAYER_TESTNET_RPC_URL` via
`contracts/foundry.toml` (`[rpc_endpoints].xlayer_testnet`).

## Consequences

- The MVP is **single-chain**; multi-chain support is explicitly out of scope and
  would require a new ADR.
- Deployment addresses (`TALOS_POOL_ADDRESS`, `TALOS_VERIFIER_ADDRESS`,
  `TEST_USDC_ADDRESS`) are environment-provided and populated after deployment.
- No **mainnet** deployment in the MVP; testnet only.
