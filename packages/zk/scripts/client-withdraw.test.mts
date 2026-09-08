/**
 * B4 end-to-end: NON-CUSTODIAL withdraw proving.
 *
 * Proves a withdraw (1 input note -> public recipient) entirely from CLIENT-derived key
 * material — spending key `sk` never leaves the client — using the real withdraw circuit +
 * PLONK proving key. Builds the input note + its Merkle path off the shared tree (mirrors
 * the on-chain tree), then proves with the frontend witness builder (notes.ts) and the
 * isomorphic prover (proof.ts), snarkjs + circomlibjs injected exactly as the browser will.
 * Run: `pnpm --filter @talos/zk zk:withdrawtest`.
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

import { deriveTalosKeys, deriveNoteSecret, deriveNoteNonce } from "../../../apps/web/src/lib/talos/keys.ts";
import { withdrawWitness, deriveNullifier, type Poseidon } from "../../../apps/web/src/lib/talos/notes.ts";
import { provePlonk } from "../../../apps/web/src/lib/talos/proof.ts";
import { ASSET_ID, MerkleTree, ownerPubKey, commitmentOf } from "./lib.mjs";

const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const fs = require("fs") as typeof import("fs");

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const BUILD = path.join(ROOT, "circuits", "build", "withdraw");
const wasm = path.join(BUILD, "withdraw_js", "withdraw.wasm");
const zkey = path.join(BUILD, "withdraw_final.zkey");
const vkey = JSON.parse(fs.readFileSync(path.join(BUILD, "verification_key.json"), "utf8"));

let fail = 0;
const ok = (m: string) => console.log("  PASS:", m);
const bad = (m: string) => {
  console.error("  FAIL:", m);
  fail++;
};

async function main() {
  console.log("B4 non-custodial withdraw proving:\n");

  // 1. Client derives keys + this note's deterministic secret/nonce (index 0).
  const walletSig = "0x" + "5c".repeat(65);
  const keys = await deriveTalosKeys(walletSig);
  const secret = await deriveNoteSecret(keys.viewingKey, 0);
  const nonce = await deriveNoteNonce(keys.viewingKey, 0);

  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const P: Poseidon = (inputs: bigint[]) => F.toObject(poseidon(inputs));

  const note = { assetId: ASSET_ID, value: 100n, sk: keys.spendingKey, secret, nonce };

  // 2. Build the input commitment + its Merkle path off the shared (on-chain-mirroring) tree.
  //    commitmentOf uses the SAME construction as notes.ts (Poseidon(assetId,value,Poseidon(sk),secret,nonce)).
  const commitment = await commitmentOf(note);
  const tree = await MerkleTree.build();
  tree.insert(commitment);
  const mk = await tree.proof(0);
  const merklePath = {
    root: mk.root.toString(),
    pathElements: mk.pathElements.map((x: bigint) => x.toString()),
    pathIndices: mk.pathIndices as number[],
  };

  // Sanity: notes.ts must derive the same ownerPubKey the tree commitment used.
  const pubFromNotes = P([note.sk]);
  const pubFromLib = await ownerPubKey(note.sk);
  pubFromNotes === pubFromLib ? ok("ownerPubKey consistent (notes.ts == lib)") : bad("ownerPubKey mismatch");

  // 3. Recipient as a field element, then the withdraw witness (needs sk — client-only).
  const recipient = BigInt("0x000000000000000000000000000000000000B0B1");
  const witness = withdrawWitness(P, note, merklePath, recipient.toString());

  // 4. Prove the withdraw with the REAL circuit + PLONK key (self-verifies inside).
  const { proof, publicSignals } = await provePlonk(snarkjs.plonk, wasm, zkey, vkey, witness);
  proof.length === 24 ? ok("produced a 24-word PLONK proof") : bad(`proof length ${proof.length} != 24`);

  // 5. Public signals must be [root, nullifier, amount, recipient, assetId].
  const nullifier = deriveNullifier(P, note.sk, note.secret);
  const expected = [
    merklePath.root,
    nullifier.toString(),
    note.value.toString(),
    recipient.toString(),
    note.assetId.toString(),
  ];
  JSON.stringify(publicSignals) === JSON.stringify(expected)
    ? ok("public signals == [root, nullifier, amount, recipient, assetId]")
    : bad(`public signals ${JSON.stringify(publicSignals)} != ${JSON.stringify(expected)}`);

  console.log(fail === 0 ? "\nNon-custodial withdraw proving works end-to-end." : `\n${fail} check(s) FAILED.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
