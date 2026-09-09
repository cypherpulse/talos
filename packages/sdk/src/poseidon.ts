import { poseidon1, poseidon2, poseidon5 } from "poseidon-lite";

/**
 * circomlib-compatible Poseidon for the arities Talos uses (1, 2, 5). poseidon-lite is pure
 * JS (isomorphic, no Node built-ins) and produces the SAME field elements as circomlib /
 * circomlibjs (cross-checked in packages/zk `zk:poseidon-check`). Bound here so the SDK's
 * note/commitment/nullifier helpers need no injected hash.
 */
export function poseidon(inputs: bigint[]): bigint {
  switch (inputs.length) {
    case 1:
      return poseidon1(inputs);
    case 2:
      return poseidon2(inputs);
    case 5:
      return poseidon5(inputs);
    default:
      throw new Error(`unsupported Poseidon arity: ${inputs.length}`);
  }
}
