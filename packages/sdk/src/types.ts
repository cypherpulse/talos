/** Public shapes returned by the Talos Core Server (public data only — never secrets). */

export type NoteState = "CREATED" | "AVAILABLE" | "PENDING_SPEND" | "SPENT" | "LOCKED" | "INVALID";

export interface NotePublic {
  id: string;
  assetId: number;
  value: string;
  commitment: string;
  state: NoteState;
  leafIndex: number | null;
  createdAt: string;
}

export interface Asset {
  assetId: number;
  symbol: string;
  decimals: number;
  address: string;
  isNative: boolean;
}

export interface ChainStatus {
  chainId: number;
  blockNumber: number;
  root: string;
  nextLeafIndex: number;
  merkleDepth: number;
}

export interface OperationView {
  operationId: string;
  type: string;
  status: string;
  txHash: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  result: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface MerklePathResponse {
  root: string;
  pathElements: string[];
  pathIndices: number[];
  leafIndex: number | null;
}

export interface DepositPrepareResponse {
  operationId: string;
  status: string;
  commitment: string;
  /** B1 binding proof; `null` on the non-custodial path (client supplies its own). */
  proof: string[] | null;
  asset: Asset;
  poolAddress: string;
  chainId: number;
}
