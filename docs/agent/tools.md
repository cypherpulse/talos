# Agent Tools

The agent can ONLY act through these explicit tools (`services/core/src/agent/tools.ts`).
There is **no** generic RPC / arbitrary-contract / `eth_sendTransaction` tool (§7) —
that is a core security requirement. Read tools query the Core Server; every mutation
goes through the Talos Guard first. Tool results contain only public data (§19).

## Read tools

| Tool                 | Description                                             |
| -------------------- | ------------------------------------------------------ |
| `getNotes()`         | List the agent's private notes (public fields only)    |
| `getBalance()`       | Sum of available note values                           |
| `getMerkleRoot()`    | Current on-chain Merkle root                           |
| `getOperationStatus(operationId)` | Status of a Talos operation                |
| `getTransactionStatus(operationId)` | Tx status + hash of an operation         |

## Mutation tools (each routed through Talos Guard)

| Tool                                  | Effect                                       |
| ------------------------------------- | -------------------------------------------- |
| `deposit(amount)`                     | Deposit the test asset → new private note    |
| `split(amount1, amount2)`             | Split a note into two amounts                |
| `merge()`                             | Merge two available notes into one           |
| `transfer(amount, recipientOwnerPubKey)` | Private transfer; change returns to self  |
| `withdraw(recipient[, amount])`       | Withdraw a note to a public address          |

A mutation tool calls `guard.execute(op, params)`. If **APPROVED**, it polls the
operation to a terminal state and returns `{ decision, operationId, status, txHash }`.
If **REJECTED** or **APPROVAL_REQUIRED**, it returns the decision and reason and
performs no blockchain action.

## Privacy

Note secrets, nonces, nullifier secrets, and witnesses are never returned or logged.
The `NotePublic` projection (id, assetId, value, commitment, state, leafIndex) is the
most the agent ever sees.

## No arbitrary execution

Only the tools above are registered. An LLM request for an unknown tool returns
`{ error: "unknown tool" }`; there is no code path from the agent to raw RPC or an
arbitrary contract call.
