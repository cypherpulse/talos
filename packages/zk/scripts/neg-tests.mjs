// Circuit-level negative tests (Phase 3 §20).
//
// A malicious prover must NOT be able to satisfy a circuit with an invalid witness,
// and a tampered proof / public signal must fail verification. Each case below must
// behave as asserted or the script exits non-zero.

import {
  ASSET_ID,
  require_,
  ownerPubKey,
  commitmentOf,
  nullifierOf,
  commitmentFromPub,
  MerkleTree,
} from "./lib.mjs";
import path from "path";
import { ROOT } from "./lib.mjs";

const snarkjs = require_("snarkjs");
const BUILD = path.join(ROOT, "circuits", "build");
const wasm = (n) => path.join(BUILD, n, `${n}_js`, `${n}.wasm`);
const zkey = (n) => path.join(BUILD, n, `${n}_final.zkey`);
const S = (x) => x.toString();

let failures = 0;
function ok(msg) {
  console.log("  PASS:", msg);
}
function bad(msg) {
  console.error("  FAIL:", msg);
  failures++;
}

async function expectProveFails(name, input, label) {
  try {
    await snarkjs.groth16.fullProve(input, wasm(name), zkey(name));
    bad(`${label} — proof unexpectedly SUCCEEDED (constraint not enforced!)`);
  } catch {
    ok(`${label} — witness rejected by constraints`);
  }
}

async function buildValidSplit(overrides = {}) {
  const input = { assetId: ASSET_ID, value: 100n, sk: 1001n, secret: 21n, nonce: 22n };
  const pubA = await ownerPubKey(input.sk);
  const inC = await commitmentOf(input);
  const tree = await MerkleTree.build();
  tree.insert(inC);
  const mk = await tree.proof(0);
  const nullifier = await nullifierOf(input);
  const out1 = await commitmentFromPub(ASSET_ID, 60n, pubA, 61n, 62n);
  const out2 = await commitmentFromPub(ASSET_ID, 40n, pubA, 71n, 72n);
  return {
    root: S(mk.root),
    nullifier: S(nullifier),
    outCommitment1: S(out1),
    outCommitment2: S(out2),
    inAssetId: S(ASSET_ID),
    inValue: "100",
    inSk: "1001",
    inSecret: "21",
    inNonce: "22",
    pathElements: mk.pathElements.map(S),
    pathIndices: mk.pathIndices.map(S),
    out1Value: "60",
    out1Secret: "61",
    out1Nonce: "62",
    out2Value: "40",
    out2Secret: "71",
    out2Nonce: "72",
    ...overrides,
  };
}

async function main() {
  console.log("Circuit negative tests:");

  // 1. Value conservation violation: 60 + 40 != 100? make outputs sum to 90.
  await expectProveFails(
    "split",
    await buildValidSplit({ out2Value: "30" }), // 60 + 30 != 100
    "value conservation (out1+out2 != in)"
  );

  // 2. Wrong nullifier (public input inconsistent with derived nullifier).
  await expectProveFails(
    "split",
    await buildValidSplit({ nullifier: "12345" }),
    "wrong nullifier public signal"
  );

  // 3. Wrong Merkle root (does not match the authentication path).
  await expectProveFails(
    "split",
    await buildValidSplit({ root: "99999" }),
    "wrong Merkle root"
  );

  // 4. Wrong output commitment (does not match the output note fields).
  await expectProveFails(
    "split",
    await buildValidSplit({ outCommitment1: "424242" }),
    "wrong output commitment"
  );

  // 5. Tampered proof / public signal must fail verification.
  {
    const input = await buildValidSplit();
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm("split"), zkey("split"));
    const vkey = require_("fs").readFileSync(
      path.join(BUILD, "split", "verification_key.json")
    );
    const vk = JSON.parse(vkey);

    if (!(await snarkjs.groth16.verify(vk, publicSignals, proof))) bad("valid proof did not verify");
    else ok("valid proof verifies");

    const tampered = JSON.parse(JSON.stringify(proof));
    tampered.pi_a[0] = (BigInt(tampered.pi_a[0]) + 1n).toString();
    if (await snarkjs.groth16.verify(vk, publicSignals, tampered)) bad("tampered PROOF verified!");
    else ok("tampered proof rejected");

    const tamperedPub = publicSignals.slice();
    tamperedPub[1] = (BigInt(tamperedPub[1]) + 1n).toString();
    if (await snarkjs.groth16.verify(vk, tamperedPub, proof)) bad("tampered PUBLIC SIGNAL verified!");
    else ok("tampered public signal rejected");
  }

  console.log(failures === 0 ? "\nAll negative tests passed." : `\n${failures} negative test(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
