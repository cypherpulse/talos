import { randomBytes } from "node:crypto";
import { FIELD_SIZE } from "./poseidon.js";

/** A uniformly-random, nonzero BN254 field element (for note secrets/nonces/keys). */
export function randomFieldElement(): bigint {
  while (true) {
    const x = BigInt("0x" + randomBytes(32).toString("hex")) % FIELD_SIZE;
    if (x !== 0n) return x;
  }
}
