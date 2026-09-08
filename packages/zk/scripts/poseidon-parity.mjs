// Poseidon parity check: poseidon-lite (used in the browser) MUST produce identical field
// elements to circomlibjs (used off-chain + matching the circuits). If these ever diverge,
// browser-computed commitments would not match the circuit and client-side proofs would be
// invalid. Run: `pnpm --filter @talos/zk zk:poseidon-check`.

import { createRequire } from "module";
import { poseidon1, poseidon2, poseidon5 } from "poseidon-lite";

const require = createRequire(import.meta.url);
const { buildPoseidon } = require("circomlibjs");

const P = await buildPoseidon();
const F = P.F;
const circom = (arr) => F.toObject(P(arr));

let fail = 0;
const check = (label, lite, ref) => {
  if (lite === ref) console.log("  PASS:", label);
  else {
    console.error(`  FAIL: ${label}\n    poseidon-lite = ${lite}\n    circomlibjs   = ${ref}`);
    fail++;
  }
};

// The exact arities Talos uses: nullifier=Poseidon(sk,secret) [2], ownerPubKey=Poseidon(sk)
// [1], commitment=Poseidon(assetId,value,ownerPubKey,secret,nonce) [5].
const sk = 1001n;
const pub = poseidon1([sk]);

check("poseidon1([sk]) (ownerPubKey)", pub, circom([sk]));
check("poseidon2([sk, secret]) (nullifier)", poseidon2([sk, 11n]), circom([sk, 11n]));
check(
  "poseidon5([assetId,value,pub,secret,nonce]) (commitment)",
  poseidon5([1n, 100n, pub, 11n, 12n]),
  circom([1n, 100n, pub, 11n, 12n]),
);
// A few more vectors for confidence.
check("poseidon2([0,0])", poseidon2([0n, 0n]), circom([0n, 0n]));
check("poseidon1([12345])", poseidon1([12345n]), circom([12345n]));

console.log(fail === 0 ? "\nPoseidon parity OK — poseidon-lite matches circomlibjs." : `\n${fail} MISMATCH(es).`);
process.exit(fail === 0 ? 0 : 1);
