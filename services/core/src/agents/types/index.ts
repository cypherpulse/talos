/**
 * Phase 6 — multi-agent private trading types.
 *
 * These are the typed domain objects that flow between the agents (Research → Portfolio
 * → Trader), the Guard, and the trading/wallet providers. They never carry secrets
 * (private keys, spending keys, witnesses) — those stay behind the signer/encryption
 * boundaries.
 */

export type Recommendation = "BUY" | "SELL" | "HOLD";

/** A token the trading layer understands (on the X Layer trading chain). */
export interface TokenRef {
  symbol: string;
  /** ERC-20 address, or the zero address for the native token. */
  address: string;
  decimals: number;
}

// ---- Research ----

export interface ResearchResult {
  asset: string;
  recommendation: Recommendation;
  /** 0..1 model confidence. */
  confidence: number;
  rationale: string;
  /** Suggested trade size in whole tokens (optional). */
  suggestedAmount?: string;
  maxSlippageBps: number;
  /** Spot price in USD at analysis time, when available. */
  priceUsd?: number;
  source: string;
}

// ---- Portfolio ----

/** Target allocation by asset symbol → fraction in [0,1] (should sum to ~1). */
export interface PortfolioTarget {
  allocations: Record<string, number>;
}

export interface PortfolioPosition {
  symbol: string;
  assetId: number;
  /** Private (shielded) balance in base units. */
  amount: string;
  valueUsd: number;
  /** Current fraction of the portfolio [0,1]. */
  weight: number;
}

export interface PortfolioSnapshot {
  totalValueUsd: number;
  positions: PortfolioPosition[];
  takenAt: string;
}

/** A rebalance step the Portfolio Agent proposes (before it becomes a TradeIntent). */
export interface RebalanceAction {
  assetIn: string;
  assetOut: string;
  /** Amount of assetIn to trade, in base units. */
  amount: string;
  reason: string;
}

// ---- Trading ----

export interface TradeIntent {
  type: "TRADE";
  assetIn: string; // symbol
  assetOut: string; // symbol
  /** Amount of assetIn in base units. */
  amount: string;
  maxSlippageBps: number;
  deadline?: number;
}

export interface QuoteRequest {
  chainId: number;
  fromToken: TokenRef;
  toToken: TokenRef;
  /** Amount of fromToken in base units. */
  amount: string;
  slippageBps: number;
}

export interface Quote {
  fromToken: TokenRef;
  toToken: TokenRef;
  fromAmount: string;
  /** Expected output in base units of toToken. */
  toAmount: string;
  priceImpactBps?: number;
  routerAddress?: string;
  estimatedGas?: string;
  /** Provider-specific raw payload (never rendered to the LLM). */
  raw?: unknown;
}

export interface TradeRequest extends QuoteRequest {
  /** The wallet that will sign/fund the swap. */
  userWalletAddress: string;
}

export interface SimulationResult {
  ok: boolean;
  failReason?: string;
  gasUsed?: string;
  assetChanges?: Array<{ symbol: string; rawValue: string }>;
}

export type TradeState =
  | "INTENT_CREATED"
  | "GUARD_CHECKED"
  | "QUOTE_REQUESTED"
  | "SIMULATED"
  | "APPROVED"
  | "SUBMITTED"
  | "CONFIRMED"
  | "SETTLED"
  | "REJECTED"
  | "FAILED";

export interface TradeExecution {
  id: string;
  status: TradeState;
  txHash?: string;
  orderId?: string;
  failReason?: string;
}
