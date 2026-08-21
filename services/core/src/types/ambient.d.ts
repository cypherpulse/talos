// Ambient declarations for untyped ZK libraries used by the proof/crypto layer.

declare module "snarkjs" {
  export interface Groth16Proof {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  }
  export const groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasmPath: string,
      zkeyPath: string,
    ): Promise<{ proof: Groth16Proof; publicSignals: string[] }>;
    verify(vkey: unknown, publicSignals: string[], proof: Groth16Proof): Promise<boolean>;
    exportSolidityCallData(proof: Groth16Proof, publicSignals: string[]): Promise<string>;
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
