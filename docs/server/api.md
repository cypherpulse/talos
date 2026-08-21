# Talos Core API

Versioned under `/api/v1`. Long-running operations return an `operationId`
immediately (HTTP 202); poll for completion. Only specific, supported operations are
exposed — there is **no** generic RPC / `eth_sendTransaction` endpoint (§31/§32).

## Liveness / readiness

| Method | Path      | Description                                              |
| ------ | --------- | ------------------------------------------------------- |
| GET    | `/health` | Liveness: `{ status: "ok" }`                            |
| GET    | `/ready`  | Readiness: checks chain RPC, circuit artifacts, pool    |

## Reads

| Method | Path                          | Description                          |
| ------ | ----------------------------- | ------------------------------------ |
| GET    | `/api/v1/status`              | chainId, blockNumber, root, next leaf|
| GET    | `/api/v1/merkle/root`         | current on-chain Merkle root         |
| GET    | `/api/v1/notes`               | notes (public projection only)       |
| GET    | `/api/v1/notes/:id`           | one note (public projection)         |
| GET    | `/api/v1/operations/:id`      | operation status + result            |
| GET    | `/api/v1/transactions/:id`    | transaction record                   |

Note responses are the **public** projection: id, assetId, value, commitment, state,
leafIndex — never secrets, keys, or witnesses.

## Operations (async, return `{ operationId, status }`, HTTP 202)

| Method | Path                      | Body                                                     |
| ------ | ------------------------- | -------------------------------------------------------- |
| POST   | `/api/v1/deposits`        | `{ amount }`                                             |
| POST   | `/api/v1/splits`          | `{ noteId, amount1, amount2 }`                           |
| POST   | `/api/v1/merges`          | `{ noteId1, noteId2 }`                                   |
| POST   | `/api/v1/transfers`       | `{ noteId, amount1, amount2, recipientOwnerPubKey }`     |
| POST   | `/api/v1/withdrawals`     | `{ noteId, recipient }`                                  |

All requests are validated with Zod. Pass `Idempotency-Key: <key>` to make a
submission idempotent.

## Errors

`{ "error": { "code": "<STABLE_CODE>", "message": "...", "details": {...} } }` with
codes like `INVALID_REQUEST`, `NOTE_ALREADY_SPENT`, `NULLIFIER_ALREADY_SPENT`,
`INVALID_MERKLE_ROOT`, `PROOF_GENERATION_FAILED`, `TRANSACTION_SUBMISSION_FAILED`,
`BLOCKCHAIN_UNAVAILABLE` (see `src/errors`).

## Example

```bash
# Deposit
curl -sX POST localhost:3000/api/v1/deposits \
  -H 'content-type: application/json' -H 'idempotency-key: dep-1' \
  -d '{"amount":"100"}'
# => { "operationId": "talos_op_...", "status": "CREATED" }

# Poll
curl -s localhost:3000/api/v1/operations/talos_op_...
# => { "status": "FINALIZED", "result": { "noteId": "note_...", "txHash": "0x..." } }
```
