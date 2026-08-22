export type NoteState =
  | "CREATED"
  | "AVAILABLE"
  | "PENDING_SPEND"
  | "SPENT"
  | "LOCKED"
  | "INVALID";

export interface NotePublic {
  id: string;
  assetId: number;
  value: string;
  commitment: string;
  state: NoteState;
  leafIndex: number | null;
  createdAt: string;
}

export type OperationType = "DEPOSIT" | "TRANSFER" | "SPLIT" | "MERGE" | "WITHDRAW";

export type OperationStatus =
  | "CREATED"
  | "VALIDATING"
  | "PROVING"
  | "PROOF_READY"
  | "READY_TO_SUBMIT"
  | "SUBMITTING"
  | "SUBMITTED"
  | "CONFIRMING"
  | "CONFIRMED"
  | "FINALIZED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED"
  | "REJECTED";

export interface OperationView {
  operationId: string;
  type: OperationType;
  status: OperationStatus;
  txHash: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  result: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionRecord {
  id: string;
  operationId: string;
  txHash: string;
  chainId: number;
  from: string;
  to: string;
  nonce: number;
  status: string;
  blockNumber: number | null;
  blockHash: string | null;
  gasUsed: string | null;
  effectiveGasPrice: string | null;
  confirmations: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChainStatus {
  chainId: number;
  blockNumber: number;
  root: string;
  nextLeafIndex: number;
  merkleDepth: number;
}

export interface OperationAck {
  operationId: string;
  status: OperationStatus;
}

export interface Asset {
  assetId: number;
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  isNative: boolean;
  color: string;
  logo: string;
}

export interface AssetsResponse {
  chainId: number;
  poolAddress: string;
  assets: Asset[];
}

export interface DepositPrepareResponse {
  operationId: string;
  status: OperationStatus;
  commitment: string;
  asset: Asset;
  poolAddress: string;
  chainId: number;
}

export type GuardDecision = "APPROVED" | "REJECTED" | "APPROVAL_REQUIRED";

export interface GuardDecisionRecord {
  id: string;
  agentId: string;
  operationType: OperationType | string;
  asset: string | null;
  amount: string | null;
  recipient: string | null;
  decision: GuardDecision;
  reason: string;
  createdAt: string;
}

export interface GuardIdentity {
  agentId: string;
  agentName: string;
  permissions: string[];
  policyId: string;
  status: string;
}

export interface GuardResult {
  decision: GuardDecision;
  reason: string;
  operationId?: string;
  guardOperationId?: string;
  audit: GuardDecisionRecord;
}

export interface AgentStep {
  tool: string;
  arguments: Record<string, unknown>;
  result: Record<string, unknown> & {
    decision?: GuardDecision;
    operationId?: string;
    status?: OperationStatus;
    txHash?: string;
    reason?: string;
    // Non-custodial action the UI must complete (e.g. a wallet-signed shield).
    actionRequired?: string;
    assetId?: number;
    amount?: string;
    guardOperationId?: string;
    message?: string;
  };
}

export interface AgentMessageResponse {
  reply: string;
  steps: AgentStep[];
  decisions: GuardDecisionRecord[];
}

// ---- Phase 6: multi-agent trading ----

export type AgentRole = "RESEARCH" | "TRADER" | "PORTFOLIO";

export interface Agent {
  id: string;
  owner: string;
  role: AgentRole;
  name: string;
  walletAddress: string;
  talosPublicKey: string;
  status: "ACTIVE" | "DISABLED";
  createdAt: string;
}

export interface ReceiveIdentity {
  agentId: string;
  talosPublicKey: string;
  walletAddress: string;
}

export type MemoryType = "WORKING" | "SEMANTIC" | "EPISODIC";

export interface AgentMemory {
  id: string;
  owner: string;
  agentId: string | null;
  memoryType: MemoryType;
  content: string;
  asset: string | null;
  importance: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export type TradeRecommendation = "BUY" | "SELL" | "HOLD";

export interface ResearchResult {
  asset: string;
  recommendation: TradeRecommendation;
  confidence: number;
  rationale: string;
  suggestedAmount?: string;
  maxSlippageBps: number;
  priceUsd?: number;
  source: string;
}

export interface PortfolioPosition {
  symbol: string;
  assetId: number;
  amount: string;
  valueUsd: number;
  weight: number;
}

export interface PortfolioSnapshot {
  totalValueUsd: number;
  positions: PortfolioPosition[];
  takenAt: string;
}

export type TradeDecision = "APPROVED" | "REJECTED" | "APPROVAL_REQUIRED";

export interface TradeResult {
  executionId: string;
  decision: TradeDecision;
  reason: string;
  status: string;
  toAmount?: string;
  valueUsd?: number;
  txHash?: string;
}

export interface TradeExecution {
  id: string;
  intentId: string;
  agentId: string;
  owner: string;
  provider: string;
  fromAmount: string;
  toAmount: string;
  valueUsd: string;
  status: string;
  txHash: string | null;
  failReason: string | null;
  quote: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface Quote {
  fromToken: { symbol: string; address: string; decimals: number };
  toToken: { symbol: string; address: string; decimals: number };
  fromAmount: string;
  toAmount: string;
  priceImpactBps?: number;
  routerAddress?: string;
  estimatedGas?: string;
}

export interface TradeIntent {
  type: "TRADE";
  assetIn: string;
  assetOut: string;
  amount: string;
  maxSlippageBps: number;
}

export interface RebalanceAction {
  assetIn: string;
  assetOut: string;
  amount: string;
  reason: string;
}

export interface OrchestrationResult {
  reply: string;
  research?: ResearchResult;
  intent?: TradeIntent;
  trade?: TradeResult;
  rebalance?: RebalanceAction[];
  snapshot?: PortfolioSnapshot;
}

export const TERMINAL_SUCCESS: OperationStatus[] = ["FINALIZED"];
export const TERMINAL_FAILURE: OperationStatus[] = [
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "REJECTED",
];

export function isTerminal(status: OperationStatus): boolean {
  return TERMINAL_SUCCESS.includes(status) || TERMINAL_FAILURE.includes(status);
}
