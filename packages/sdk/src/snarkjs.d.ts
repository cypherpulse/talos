// snarkjs ships no types. The strongly-typed surface the SDK relies on is the PlonkBackend
// shape in proof.ts; this just makes the import resolve.
declare module "snarkjs" {
  export const plonk: {
    fullProve(
      input: Record<string, unknown>,
      wasm: string,
      zkey: string,
    ): Promise<{ proof: unknown; publicSignals: string[] }>;
    verify(vkey: unknown, publicSignals: string[], proof: unknown): Promise<boolean>;
    exportSolidityCallData(proof: unknown, publicSignals: string[]): Promise<string>;
  };
}
