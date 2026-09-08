// Ambient declaration for snarkjs, which ships no types and is loaded (dynamically) only
// in the browser proving path. Declared here so typecheck passes; at runtime Vite resolves
// the real package. The strongly-typed surface lives in lib/talos/proof.ts (PlonkBackend).
//
// `poseidon-lite` and `buffer` are intentionally NOT declared here — they ship their own
// types, so declaring them would collide after `pnpm install`.

declare module "snarkjs" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const plonk: any;
}
