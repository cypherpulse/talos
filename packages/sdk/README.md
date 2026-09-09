# @talos/sdk

Client SDK for [Talos](https://github.com/cypherpulse/talos), a note-based private-asset
protocol on X Layer. It handles key derivation, witness construction, and PLONK proving on the
client, and talks to the Talos Core Server over REST. The same code runs in Node (CLI, agents)
and the browser.

The design goal is that the server never holds spend authority: the spending key is derived
locally from one wallet signature and never leaves the process, proofs are generated on the
client, and the server only relays them to the on-chain verifier.

Talking to the protocol requires a running Core Server `baseUrl`. A hosted testnet endpoint is
available at `https://talos-c4wi.onrender.com`, and the reference web app runs at
`https://talos.alkebulant.com` (it also serves the proving artifacts for browser consumers).
The pure crypto — key derivation, witnesses, `provePlonk` over local artifacts — works with no
server.

```ts
import { TalosClient, signerFromPrivateKey, fileArtifacts } from "@talos/sdk";

const talos = new TalosClient({
  baseUrl: "https://talos-c4wi.onrender.com",
  signer: signerFromPrivateKey(process.env.TALOS_KEY as `0x${string}`),
  artifacts: fileArtifacts("./circuits/build"),
});

await talos.withdraw({ note, recipient: "0xabc…" });
```

## Install

```bash
npm add @talos/sdk
```

`snarkjs`, `poseidon-lite`, and `viem` are dependencies (installed for you). Requires Node 20+
(for global Web Crypto) or a modern browser. Circuit artifacts are loaded at runtime, not
bundled — see [Proving artifacts](#proving-artifacts).

## Model

```
wallet signature ──▶ key tree ─┬─ sk (spend)  ──▶ nullifiers
                               └─ vk (view)   ──▶ per-note secret / nonce

note + Merkle path ──▶ witness ──▶ provePlonk ──▶ 24-word proof ──▶ server relay ──▶ pool verifier
```

- `sk` authorizes spends and stays on the client. `vk` deterministically derives each note's
  secret and nonce, so the only per-note state you keep is a small integer `noteIndex`.
- The server stores public data and relays proofs. It cannot spend or forge; an invalid proof
  reverts at the pool's verifier.
- Every proof is self-verified with the circuit's verification key before it is returned.

## Usage

### Node, CLI, agents

```ts
import { TalosClient, signerFromPrivateKey, fileArtifacts } from "@talos/sdk";

const talos = new TalosClient({
  baseUrl: process.env.TALOS_API ?? "https://talos-c4wi.onrender.com",
  signer: signerFromPrivateKey(process.env.TALOS_KEY as `0x${string}`),
  artifacts: fileArtifacts("./circuits/build"),
});

// Deposit: prove locally, submit the on-chain tx with your own wallet, then confirm.
const prep = await talos.prepareDeposit({ assetId: 1, amount: "1000000" }); // 1 USDC (6 dp)
// … submit approve + pool.deposit(prep.proof, …) via your walletClient …
await talos.confirmDeposit(prep.operationId, txHash);
// Store prep.noteIndex with the note id; it is required to spend the note later.

// Spend: proved locally, relayed by the server (no client tx).
await talos.withdraw({ note: { id, assetId: 1, value: "1000000", noteIndex }, recipient });
const { outputs } = await talos.split({ note, amount1: "600000", amount2: "400000" });
// Store each outputs[i].noteIndex to spend the change/outputs later.
```

### Browser

```ts
import { TalosClient, signerFromInjected, httpArtifacts } from "@talos/sdk";

const talos = new TalosClient({
  baseUrl: import.meta.env.VITE_TALOS_API_URL,
  signer: signerFromInjected((window as any).ethereum),
  artifacts: httpArtifacts("https://talos.alkebulant.com"), // or location.origin; served at /circuits/<name>/…
});
```

`snarkjs` and `poseidon-lite` reference a few Node built-ins. In a browser bundler, provide a
`Buffer`/`global` shim (the `buffer` package); the Talos web app has a working Vite setup.

### Reads (no signing)

```ts
const status = await talos.api.status();
const { notes } = await talos.api.notes(await talos.address());
```

## API

### `TalosClient`

| Member | Description |
|---|---|
| `new TalosClient({ baseUrl, signer, artifacts, fetch?, nextIndex? })` | Compose signer, REST client, and proving. |
| `keys()` | Derive and cache the key tree (signs `TALOS_KEY_MESSAGE` once). |
| `address()` | The signer's address. |
| `prepareDeposit({ assetId, amount, owner?, noteIndex? })` | Prove the deposit binding and register the note; returns `DepositPrep` (`proof`, `commitment`, `noteIndex`, `poolAddress`, …). The caller submits the on-chain tx. |
| `confirmDeposit(operationId, txHash)` | Finalize a deposit once its tx is broadcast. |
| `withdraw({ note, recipient }, idem?)` | Whole-note withdraw to a public address. |
| `split({ note, amount1, amount2 }, idem?)` | One note into two same-owner notes. |
| `transfer({ note, amount, recipientOwnerPubKey }, idem?)` | Send `amount` to a key; change returns to the sender. |
| `merge({ note1, note2 }, idem?)` | Two same-owner notes into one. |
| `api` | The underlying `TalosApi`. |

`NoteRef = { id, assetId, value, noteIndex }`. `split`/`transfer`/`merge` return
`{ op, outputs }`, where each `OutputRecord` is
`{ commitment, noteIndex, assetId, value, ownerPubKey, mine }`. Persist the `mine` outputs so
they can be spent later.

### `TalosApi`

Typed REST over global `fetch`; throws `TalosApiError` (`status`, `code`).
`status`, `assets`, `notes(owner?)`, `note(id)`, `notePath(id)`, `operation(id)`,
`depositPrepare`, `depositConfirm`, `withdrawSubmit`, `spendSubmit`.

### Signers

- `signerFromPrivateKey(pk)` — Node/CLI/agents (viem account, EIP-191 `personal_sign`).
- `signerFromInjected(provider, address?)` — browser wallet (EIP-1193).

Both implement `TalosSigner`; supply your own by matching `{ getAddress(), signMessage(message) }`.

### Artifact sources

- `fileArtifacts(dir)` — Node; reads `<dir>/<circuit>/…` from disk.
- `httpArtifacts(baseUrl)` — browser; fetches `${baseUrl}/circuits/<circuit>/…`.

### Primitives

For building flows directly: `deriveTalosKeys`, `deriveSpendingKey`, `deriveViewingKey`,
`deriveNoteSecret`, `deriveNoteNonce`, `deriveOwnerPubKey`, `deriveCommitment`,
`deriveNullifier`, `depositArtifacts`, `depositWitness`, `withdrawWitness`, `splitWitness`,
`transferWitness`, `mergeWitness`, `provePlonk`, `poseidon`, `encodePub`, `encodeSec`,
`decodeKey`, `TALOS_KEY_MESSAGE`, `FIELD_SIZE`.

## Proving artifacts

Each circuit needs `<name>.wasm`, `<name>_final.zkey`, and `verification_key.json`. They are
not shipped in the package — the spend keys are tens of megabytes. Point the SDK at them with
`fileArtifacts` (Node) or `httpArtifacts` (browser). The first proof of a circuit loads its
key (deposit ≈ 3.8 MB, spends ≈ 65 MB; the browser caches it). Prove spends in a web worker to
keep the main thread responsive.

## Limitations

- Not audited. See [`docs/security/`](https://github.com/cypherpulse/talos/tree/main/docs/security)
  for the current posture: the trusted setup uses the public Perpetual Powers of Tau, and
  client-side spend proving is recent.
- A transfer's recipient cannot yet discover the incoming note automatically — viewing-key note
  encryption is not implemented. Use it for self-rebalancing or coordinate the note out of band.
- Deposits require an on-chain transaction (approve + `pool.deposit`) sent by your own wallet;
  `prepareDeposit` returns the proof and pool address for that. Spends are relayed by the server.

## License

MIT
