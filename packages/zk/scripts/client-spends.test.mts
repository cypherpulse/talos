/**
 * B4 end-to-end: NON-CUSTODIAL split / transfer / merge proving.
 *
 * Proves each multi-output spend entirely from CLIENT-derived keys (sk never leaves the
 * client) against the real circuits + PLONK keys, using the frontend witness builders
 * (notes.ts) + isomorphic prover (proof.ts), snarkjs + circomlibjs injected as the browser
 * will. Output notes get fresh secrets/nonces from the viewing key. Builds each input's
 * Merkle path off the shared (on-chain-mirroring) tree.
 * Run: `pnpm --filter @talos/zk zk:spendstest`.
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

import { deriveTalosKeys, deriveNoteSecret, deriveNoteNonce } from "../../../apps/web/src/lib/talos/keys.ts";
import {
  splitWitness,
  transferWitness,
  mergeWitness,
  deriveOwnerPubKey,
  type OutputSpec,
  type MerklePath,
  type Poseidon,
} from "../../../apps/web/src/lib/talos/notes.ts";
import { provePlonk } from "../../../apps/web/src/lib/talos/proof.ts";
import { ASSET_ID, MerkleTree, commitmentOf } from "./lib.mjs";

const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const fs = require("fs") as typeof import("fs");

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const artifacts = (name: string) => ({
  wasm: path.join(ROOT, "circuits", "build", name, `${name}_js`, `${name}.wasm`),
  zkey: path.join(ROOT, "circuits", "build", name, `${name}_final.zkey`),
  vkey: JSON.parse(fs.readFileSync(path.join(ROOT, "circuits", "build", name, "verification_key.json"), "utf8")),
});

let fail = 0;
const ok = (m: string) => console.log("  PASS:", m);
const bad = (m: string) => {
  console.error("  FAIL:", m);
  fail++;
};

async function pathFor(commitment: bigint): Promise<MerklePath> {
  const tree = await MerkleTree.build();
  tree.insert(commitment);
  const mk = await tree.proof(0);
  return { root: mk.root.toString(), pathElements: mk.pathElements.map((x: bigint) => x.toString()), pathIndices: mk.pathIndices };
}

async function main() {
  console.log("B4 non-custodial split / transfer / merge proving:\n");

  const keys = await deriveTalosKeys("0x" + "7a".repeat(65));
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const P: Poseidon = (i: bigint[]) => F.toObject(poseidon(i));
  const selfPub = deriveOwnerPubKey(P, keys.spendingKey);

  const outSpec = async (value: bigint, idx: number, ownerPubKey: bigint): Promise<OutputSpec> => ({
    value,
    secret: await deriveNoteSecret(keys.viewingKey, idx),
    nonce: await deriveNoteNonce(keys.viewingKey, idx),
    ownerPubKey,
  });

  const checkSignals = async (
    label: string,
    name: string,
    witness: Record<string, string | string[]>,
    expected: string[],
  ) => {
    const a = artifacts(name);
    const { proof, publicSignals } = await provePlonk(snarkjs.plonk, a.wasm, a.zkey, a.vkey, witness);
    if (proof.length !== 24) return bad(`${label}: proof length ${proof.length} != 24`);
    JSON.stringify(publicSignals) === JSON.stringify(expected)
      ? ok(`${label}: 24-word proof + correct public signals`)
      : bad(`${label}: signals ${JSON.stringify(publicSignals)} != ${JSON.stringify(expected)}`);
  };

  // --- SPLIT: 100 -> 60 + 40, same owner ---
  {
    const input = { assetId: ASSET_ID, value: 100n, sk: keys.spendingKey, secret: await deriveNoteSecret(keys.viewingKey, 0), nonce: await deriveNoteNonce(keys.viewingKey, 0) };
    const p = await pathFor(await commitmentOf(input));
    const o1 = await outSpec(60n, 101, selfPub);
    const o2 = await outSpec(40n, 102, selfPub);
    const w = splitWitness(P, input, p, o1, o2);
    await checkSignals("split", "split", w, [p.root, w["nullifier"] as string, w["outCommitment1"] as string, w["outCommitment2"] as string]);
  }

  // --- TRANSFER: 100 -> 70 (counterparty) + 30 (self change) ---
  {
    const recipient = await deriveTalosKeys("0x" + "b0".repeat(65));
    const recipientPub = deriveOwnerPubKey(P, recipient.spendingKey);
    const input = { assetId: ASSET_ID, value: 100n, sk: keys.spendingKey, secret: await deriveNoteSecret(keys.viewingKey, 10), nonce: await deriveNoteNonce(keys.viewingKey, 10) };
    const p = await pathFor(await commitmentOf(input));
    const o1 = await outSpec(70n, 111, recipientPub);
    const o2 = await outSpec(30n, 112, selfPub);
    const w = transferWitness(P, input, p, o1, o2);
    await checkSignals("transfer", "transfer", w, [p.root, w["nullifier"] as string, w["outCommitment1"] as string, w["outCommitment2"] as string]);
  }

  // --- MERGE: 60 + 40 -> 100, same owner ---
  {
    const in1 = { assetId: ASSET_ID, value: 60n, sk: keys.spendingKey, secret: await deriveNoteSecret(keys.viewingKey, 20), nonce: await deriveNoteNonce(keys.viewingKey, 20) };
    const in2 = { assetId: ASSET_ID, value: 40n, sk: keys.spendingKey, secret: await deriveNoteSecret(keys.viewingKey, 21), nonce: await deriveNoteNonce(keys.viewingKey, 21) };
    const c1 = await commitmentOf(in1);
    const c2 = await commitmentOf(in2);
    const tree = await MerkleTree.build();
    tree.insert(c1);
    tree.insert(c2);
    const mk1 = await tree.proof(0);
    const mk2 = await tree.proof(1);
    const toPath = (mk: { root: bigint; pathElements: bigint[]; pathIndices: number[] }): MerklePath => ({
      root: mk.root.toString(),
      pathElements: mk.pathElements.map((x) => x.toString()),
      pathIndices: mk.pathIndices,
    });
    const out = await outSpec(100n, 121, selfPub);
    const w = mergeWitness(P, in1, toPath(mk1), in2, toPath(mk2), out);
    await checkSignals("merge", "merge", w, [mk1.root.toString(), w["nullifier1"] as string, w["nullifier2"] as string, w["outCommitment"] as string]);
  }

  console.log(fail === 0 ? "\nNon-custodial split/transfer/merge proving works end-to-end." : `\n${fail} check(s) FAILED.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
