// Ambient declarations for untyped ZK libraries used by the proof/crypto layer.

declare module "snarkjs" {
  export interface SnarkProof {
    protocol: string;
    curve: string;
    [k: string]: unknown;
  }
  export const plonk: {
    fullProve(
      input: Record<string, unknown>,
      wasmPath: string,
      zkeyPath: string,
    ): Promise<{ proof: SnarkProof; publicSignals: string[] }>;
    verify(vkey: unknown, publicSignals: string[], proof: SnarkProof): Promise<boolean>;
    exportSolidityCallData(proof: SnarkProof, publicSignals: string[]): Promise<string>;
  };
}

declare module "circomlibjs" {
  export interface PoseidonField {
    toObject(x: unknown): bigint;
    toString(x: unknown): string;
  }
  export interface Poseidon {
    (inputs: (bigint | number | string)[]): unknown;
    F: PoseidonField;
  }
  export function buildPoseidon(): Promise<Poseidon>;
}
