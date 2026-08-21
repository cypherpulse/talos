# ADR 0001 — MVP Technology Stack

- **Status:** Accepted (frozen for the MVP)
- **Date:** 2026-08-20
- **Context:** Phase 1 — Foundation & Architecture

## Context

Talos is a private execution layer for autonomous AI agents managing on-chain
capital. The MVP must ship a coherent, auditable stack across four domains
(contracts, ZK, backend/agent, tooling) without churn. To keep Phases 2–10 focused
on protocol work, the stack is decided once, now, and frozen.

## Decision

The following stack is frozen for the MVP:

| Domain          | Choice                                                      |
| --------------- | ---------------------------------------------------------- |
| Chain           | X Layer (EVM-compatible) — see `0003-x-layer.md`           |
| Contracts       | Solidity `0.8.30` + Foundry                                |
| ZK circuits     | Circom + snarkjs                                            |
| Proof system    | Groth16 — see `0002-groth16.md`                            |
| ZK hashing      | Poseidon                                                    |
| Backend         | TypeScript + Hono                                          |
| Database        | PostgreSQL + Drizzle ORM                                   |
| Cache / queue   | Redis                                                       |
| Validation      | Zod                                                        |
| Chain client    | viem                                                        |
| Agent           | TypeScript with a provider-agnostic LLM abstraction        |
| Frontend        | Next.js + wagmi + viem (built in Phase 10)                 |
| Runtime         | Node.js (>= 20)                                            |
| Package manager | pnpm (workspaces)                                          |
| Monorepo tasks  | Turborepo                                                   |
| Infrastructure  | Docker + Docker Compose (PostgreSQL, Redis)               |

Development order: **backend/protocol first**; the frontend is built later by a
separate frontend agent and consumes `@talos/sdk`.

## Rationale

- **TypeScript everywhere** off-chain gives one language across agent, services, SDK,
  and (later) frontend, with strong types and shared packages.
- **Foundry** is the fastest, most ergonomic Solidity toolchain for testing.
- **Circom + snarkjs + Groth16 + Poseidon** is the best-supported, cheapest-to-verify
  ZK path on EVM for fixed circuits (details in `0002-groth16.md`).
- **PostgreSQL + Redis** are boring, reliable choices for a derived index and a
  cache/queue — deliberately *not* the source of truth.
- **pnpm + Turborepo** give fast, deterministic monorepo installs and task running.

## Consequences

- Contributors must have Node >= 20, pnpm, Docker, and (for contracts) Foundry.
  Circom/snarkjs are required from Phase 3 onward.
- Substituting any of these technologies during the MVP requires a new ADR that
  supersedes this one.
- The off-chain databases are explicitly non-authoritative (see the threat model).
