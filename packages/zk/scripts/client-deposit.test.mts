/**
 * B4 end-to-end: NON-CUSTODIAL deposit proving.
 *
 * Proves that a deposit binding proof can be produced entirely from CLIENT-derived key
 * material, with the spending key `sk` NEVER leaving the client, using the real deposit
 * circuit + PLONK proving key. Ties together the client modules:
 *   apps/web/src/lib/talos/{keys,notes,proof}.ts
 * with snarkjs (PLONK) + circomlibjs (Poseidon) injected — exactly how the browser will
 * wire them. Run: `pnpm --filter @talos/zk zk:clienttest`.
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

// keys.ts is dependency-free; notes.ts / proof.ts take injected poseidon / plonk.
import { deriveTalosKeys, deriveNoteSecret, deriveNoteNonce } from "../../../apps/web/src/lib/talos/keys.ts";
import { depositWitness, depositArtifacts, type Poseidon } from "../../../apps/web/src/lib/talos/notes.ts";
import { provePlonk } from "../../../apps/web/src/lib/talos/proof.ts";

const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const fs = require("fs") as typeof import("fs");

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const BUILD = path.join(ROOT, "circuits", "build", "deposit");
const wasm = path.join(BUILD, "deposit_js", "deposit.wasm");
const zkey = path.join(BUILD, "deposit_final.zkey");
const vkey = JSON.parse(fs.readFileSync(path.join(BUILD, "verification_key.json"), "utf8"));

let fail = 0;
const ok = (m: string) => console.log("  PASS:", m);
const bad = (m: string) => {
  console.error("  FAIL:", m);
  fail++;
};

async function main() {
  console.log("B4 non-custodial deposit proving:\n");

  // 1. Client derives its whole key tree from a wallet signature (nothing server-side).
  const walletSig = "0x" + "3a".repeat(65); // stand-in for a real personal_sign result
  const keys = await deriveTalosKeys(walletSig);
  const secret = await deriveNoteSecret(keys.viewingKey, 0);
  const nonce = await deriveNoteNonce(keys.viewingKey, 0);

  // 2. Poseidon (circomlibjs) injected, matching the circuit + Core Server.
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const P: Poseidon = (inputs: bigint[]) => F.toObject(poseidon(inputs));

  const note = { assetId: 1n, value: 100n, sk: keys.spendingKey, secret, nonce };

  // 3. Public artifacts the client may disclose — and the witness (note: NO `sk`).
  const artifacts = depositArtifacts(P, note);
  const witness = depositWitness(P, note);

  Object.keys(witness).includes("sk")
    ? bad("deposit witness LEAKS sk!")
    : ok("deposit witness contains no spending key (sk stays client-side)");
  witness.commitment === artifacts.commitment
    ? ok("commitment consistent between artifacts and witness")
    : bad("commitment mismatch");

  // 4. Prove the deposit binding with the REAL circuit + PLONK key (self-verifies inside).
  const { proof, publicSignals } = await provePlonk(snarkjs.plonk, wasm, zkey, vkey, witness);

  proof.length === 24 ? ok("produced a 24-word PLONK proof") : bad(`proof length ${proof.length} != 24`);

  // 5. Public signals must be the frozen [assetId, amount, commitment].
  const expected = [note.assetId.toString(), note.value.toString(), artifacts.commitment];
  JSON.stringify(publicSignals) === JSON.stringify(expected)
    ? ok("public signals == [assetId, amount, commitment] (frozen order)")
    : bad(`public signals ${JSON.stringify(publicSignals)} != ${JSON.stringify(expected)}`);

  // 6. Independent re-verify with the verification key (belt-and-suspenders).
  const reVerify = await snarkjs.plonk.verify(vkey, publicSignals, await rebuild(snarkjs, wasm, zkey, witness));
  reVerify ? ok("re-verification with vkey succeeds") : bad("re-verification failed");

  console.log(fail === 0 ? "\nNon-custodial deposit proving works end-to-end." : `\n${fail} check(s) FAILED.`);
  process.exit(fail === 0 ? 0 : 1);
}

// Re-run fullProve to get a raw proof object for the independent vkey check.
async function rebuild(snarkjs: any, wasm: string, zkey: string, input: Record<string, string>) {
  const { proof } = await snarkjs.plonk.fullProve(input, wasm, zkey);
  return proof;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
