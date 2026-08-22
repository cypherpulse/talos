import type { Quote, QuoteRequest, SimulationResult, TradeExecution, TradeRequest } from "../types/index.js";

/**
 * Trading provider abstraction (Phase 6 §7). The agents and Guard only ever see this
 * interface — never a concrete DEX API — so additional providers can be added later
 * and the whole flow can run against a deterministic mock when no keys are configured.
 */
export interface TradingProvider {
  readonly name: string;
  getQuote(request: QuoteRequest): Promise<Quote>;
  simulateTrade(request: TradeRequest): Promise<SimulationResult>;
  /**
   * Build the swap transaction (calldata) for `request`. Execution is NOT signing here —
   * the returned tx is handed to the signer/execution boundary, never to the LLM.
   */
  buildSwapTx(request: TradeRequest): Promise<SwapTx>;
  getTradeStatus(id: string): Promise<TradeExecution>;
}

/** An unsigned swap transaction ready for the signer/execution layer. */
export interface SwapTx {
  to: string;
  data: string;
  value: string;
  gas?: string;
  /** The router/spender the fromToken must be approved for (ERC-20 only). */
  spender?: string;
  quote: Quote;
}
