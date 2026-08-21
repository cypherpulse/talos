# Talos

> **The Private Execution Layer for Autonomous AI Agents**

Talos lets AI agents manage on-chain capital privately, using ZK-private notes and
Groth16 proofs on [X Layer](https://www.okx.com/xlayer). The LLM proposes intents;
a deterministic authorization layer (**Talos Guard**) and zero-knowledge proofs — not
the model — are the cryptographic authority.

> **Status: Phase 1 — Foundation & Architecture.**
> This repository currently contains only the monorepo scaffold, tooling, workspace
> boundaries, configuration, and architecture docs. No protocol functionality is
> implemented yet. See [`docs/`](docs/) for the frozen architecture and decisions.

---

## Architecture at a glance

```text
LLM  →  Intent  →  Talos Guard  →  Deterministic Action  →  ZK Proof  →  X Layer
```

AI reasoning is strictly separated from deterministic authorization. The LLM never
becomes the cryptographic authority. See
[`docs/architecture/overview.md`](docs/architecture/overview.md).

## Frozen technology stack

| Layer          | Choice                                            |
| -------------- | ------------------------------------------------- |
| Chain          | X Layer (EVM), Solidity, Foundry                  |
| ZK             | Circom + snarkjs, Groth16, Poseidon hashing       |
| Backend        | TypeScript, Hono, PostgreSQL + Drizzle, Redis, Zod, viem |
| Agent          | TypeScript, provider-agnostic LLM abstraction     |
| Frontend       | Next.js, wagmi, viem *(built in a later phase)*    |
| Tooling        | pnpm, Node.js, Turborepo, Docker                  |

These decisions are frozen for the MVP — see [`docs/adr/`](docs/adr/).

## Repository layout

```text
apps/        agent (TS) and web (Next.js, later phase)
packages/    sdk, crypto, notes, zk, config — shared TypeScript libraries
contracts/   Foundry project (Solidity 0.8.30)
circuits/    Circom circuits (implemented in Phase 3)
services/    relayer, indexer
docs/        architecture, security, protocol, and ADR documentation
infra/       Docker and local infrastructure
scripts/     repository tooling scripts
config/      shared non-code configuration
```

## Prerequisites

- **Node.js** >= 20 (tested on 22.x)
- **pnpm** >= 9
- **Docker** + Docker Compose (for local PostgreSQL and Redis)
- **Foundry** (`forge`) — for the contracts workspace ([install](https://book.getfoundry.sh/getting-started/installation))
- **Circom** + **snarkjs** — required only from Phase 3 onward (see
  [`circuits/README.md`](circuits/README.md))

## Quick start

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Type-check, build, and test all TypeScript workspaces
pnpm typecheck
pnpm build
pnpm test

# 3. Contracts (requires Foundry)
forge build --root contracts
forge test  --root contracts

# 4. Local infrastructure (PostgreSQL + Redis)
cp .env.example .env
docker compose up -d
docker compose ps        # verify health checks are "healthy"
```

## Security posture

The ultimate source of cryptographic truth is **ZK proof verification + X Layer
contract state**. Off-chain PostgreSQL/Redis are indexes and state-management
infrastructure, never the authority. Never commit private keys or `.env`, never
log note secrets, and never treat LLM output as authorization. See
[`docs/security/threat-model.md`](docs/security/threat-model.md).

## License

[MIT](LICENSE)
