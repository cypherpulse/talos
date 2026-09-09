/**
 * SDK integration test — proves that proofs can be GENERATED and VERIFIED entirely through
 * the public @talos/sdk surface, exactly as an external consumer (CLI / agent) would:
 *   signerFromPrivateKey → deriveTalosKeys → witness builders → provePlonk (fileArtifacts).
 * `provePlonk` self-verifies every proof off-chain, so a PASS means generate+verify both work.
 * Merkle paths (a runtime/server concern) use the zk test tree here. No server needed.
 * Run: `pnpm --filter @talos/sdk test:prove`.
 */
import path from "path";
import { fileURLToPath } from "url";

import {
  signerFromPrivateKey,
  deriveTalosKeys,
  deriveNoteSecret,
  deriveNoteNonce,
  deriveOwnerPubKey,
  depositArtifacts,
  depositWitness,
  withdrawWitness,
  splitWitness,
  fileArtifacts,
  provePlonk,
  TALOS_KEY_MESSAGE,
  type NoteFields,
  type MerklePath,
} from "../src/index";
import { MerkleTree, commitmentOf } from "../../zk/scripts/lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const artifacts = fileArtifacts(path.join(ROOT, "circuits", "build"));

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

async function prove(circuit: string, witness: Record<string, string | string[]>) {
  const a = await artifacts.load(circuit);
  return provePlonk(a.wasm, a.zkey, a.vkey, witness); // self-verifies inside
}

async function main() {
  console.log("@talos/sdk — generate + verify proofs through the SDK:\n");

  // 1. Keys from a private-key signer, exactly as an agent/CLI would.
  const signer = signerFromPrivateKey(`0x${"11".repeat(32)}`);
  const address = await signer.getAddress();
  const keys = await deriveTalosKeys(await signer.signMessage(TALOS_KEY_MESSAGE));
  address.startsWith("0x") ? ok(`signer address derived (${address.slice(0, 10)}…)`) : bad("bad address");

  const note = async (value: bigint, idx: number): Promise<NoteFields> => ({
    assetId: 1n,
    value,
    sk: keys.spendingKey,
    secret: await deriveNoteSecret(keys.viewingKey, idx),
    nonce: await deriveNoteNonce(keys.viewingKey, idx),
  });

  // 2. DEPOSIT. (public signals come back as hex from exportSolidityCallData; compare numerically)
  {
    const n = await note(100n, 0);
    const { commitment } = depositArtifacts(n);
    const { proof, publicSignals } = await prove("deposit", depositWitness(n));
    const got = publicSignals.map((x) => BigInt(x).toString());
    proof.length === 24 && JSON.stringify(got) === JSON.stringify(["1", "100", commitment])
      ? ok("deposit: generated + self-verified, signals bound to [assetId, amount, commitment]")
      : bad(`deposit signals ${JSON.stringify(got)} vs ${JSON.stringify(["1", "100", commitment])}`);
  }

  // 3. WITHDRAW.
  {
    const n = await note(100n, 1);
    const p = await pathFor(await commitmentOf(n));
    const recipient = BigInt("0x000000000000000000000000000000000000B0B1").toString();
    const { proof } = await prove("withdraw", withdrawWitness(n, p, recipient));
    proof.length === 24 ? ok("withdraw: generated + self-verified") : bad("withdraw proof");
  }

  // 4. SPLIT (100 -> 60 + 40, same owner).
  {
    const n = await note(100n, 2);
    const p = await pathFor(await commitmentOf(n));
    const self = deriveOwnerPubKey(keys.spendingKey);
    const o1 = { value: 60n, ownerPubKey: self, secret: await deriveNoteSecret(keys.viewingKey, 201), nonce: await deriveNoteNonce(keys.viewingKey, 201) };
    const o2 = { value: 40n, ownerPubKey: self, secret: await deriveNoteSecret(keys.viewingKey, 202), nonce: await deriveNoteNonce(keys.viewingKey, 202) };
    const { proof } = await prove("split", splitWitness(n, p, o1, o2));
    proof.length === 24 ? ok("split: generated + self-verified") : bad("split proof");
  }

  console.log(fail === 0 ? "\nSDK proving works end-to-end (generate + verify)." : `\n${fail} check(s) FAILED.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
