# Execution Engine

The `ExecutionEngine` (`src/execution/engine.ts`) is the only component that spends
notes. Each operation runs a lifecycle, not a single success boolean.

## Operation lifecycle

```text
CREATED → VALIDATING → PROVING → PROOF_READY → READY_TO_SUBMIT
→ SUBMITTING → SUBMITTED → CONFIRMING → CONFIRMED → FINALIZED
failure: FAILED | CANCELLED | EXPIRED | REJECTED
```

Transitions are validated (`domain/state-machine.ts`); an illegal transition throws.
Pre-execution failures (bad request, unavailable note) become `REJECTED`; failures
once proving/submission began become `FAILED`.

## Note lifecycle

```text
CREATED → AVAILABLE → PENDING_SPEND → SPENT
                         ↳ AVAILABLE (on failed spend, before nullifier is consumed)
```

## Security checks before every submission (§18)

1. the proof `root` is a **known on-chain root** (`isKnownRoot`);
2. every input `nullifier` is **unspent on-chain** (`isNullifierSpent`);
3. proof public signals **exactly match** the intended values (`assertPublicSignals`).

## Per-operation pipelines

- **Deposit**: create note → deposit binding proof (off-chain) → ERC-20 approve (if
  needed) → `TalosPool.deposit` → reconcile → note AVAILABLE.
- **Split / Transfer** (1→2): lock input → resolve Merkle path → build outputs →
  prove → submit → consume nullifier, insert outputs.
- **Merge** (2→1): lock both → paths → prove `in1+in2=out` → submit → consume both.
- **Withdraw** (1→public): lock → prove (recipient/amount bound) → submit → pay.

## Idempotency & locking

- Every request may carry an `Idempotency-Key`; a repeat returns the same operation.
- Spends acquire a per-note lock (`LockService`: Redis in prod, in-memory in tests),
  so a note cannot be concurrently spent by two operations.
- Workers are idempotent: `runOperation` is a no-op unless the operation is `CREATED`,
  so a re-run causes the blockchain action **at most once**.
