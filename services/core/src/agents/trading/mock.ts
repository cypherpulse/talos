import { randomUUID } from "node:crypto";

import type { Quote, QuoteRequest, SimulationResult, TradeExecution, TradeRequest } from "../types/index.js";
import type { SwapTx, TradingProvider } from "./provider.js";

/**
 * Deterministic mock trading provider. Used when no OKX DEX keys are configured (demo /
 * CI), so the full multi-agent flow runs end-to-end without external calls. Prices are
 * derived from the requested amounts and a fixed reference table — never real quotes.
 */
export class MockTradingProvider implements TradingProvider {
  readonly name = "mock";
  private readonly executions = new Map<string, TradeExecution>();

  // Reference USD prices for deriving mock output amounts.
  private static readonly USD: Record<string, number> = { USDC: 1, USDT: 1, USDG: 1, OKB: 45, WOKB: 45 };

  async getQuote(request: QuoteRequest): Promise<Quote> {
    const inUsd = MockTradingProvider.USD[request.fromToken.symbol] ?? 1;
    const outUsd = MockTradingProvider.USD[request.toToken.symbol] ?? 1;
    const fromHuman = Number(request.amount) / 10 ** request.fromToken.decimals;
    const outHuman = (fromHuman * inUsd) / outUsd;
    const toAmount = BigInt(Math.floor(outHuman * 10 ** request.toToken.decimals)).toString();
    return {
      fromToken: request.fromToken,
      toToken: request.toToken,
      fromAmount: request.amount,
      toAmount,
      priceImpactBps: 5,
      routerAddress: "0x0000000000000000000000000000000000000dex",
      estimatedGas: "180000",
      raw: { mock: true },
    };
  }

  async simulateTrade(request: TradeRequest): Promise<SimulationResult> {
    const quote = await this.getQuote(request);
    return {
      ok: true,
      gasUsed: "180000",
      assetChanges: [
        { symbol: request.fromToken.symbol, rawValue: `-${request.amount}` },
        { symbol: request.toToken.symbol, rawValue: quote.toAmount },
      ],
    };
  }

  async buildSwapTx(request: TradeRequest): Promise<SwapTx> {
    const quote = await this.getQuote(request);
    return {
      to: quote.routerAddress!,
      data: "0x",
      value: request.fromToken.address === "0x0000000000000000000000000000000000000000" ? request.amount : "0",
      gas: "180000",
      spender: quote.routerAddress!,
      quote,
    };
  }

  /** Record a mock execution as immediately settled (used by the execution service in mock mode). */
  settle(txHash: string): TradeExecution {
    const id = `mocktrade_${randomUUID()}`;
    const exec: TradeExecution = { id, status: "SETTLED", txHash };
    this.executions.set(id, exec);
    return exec;
  }

  async getTradeStatus(id: string): Promise<TradeExecution> {
    return this.executions.get(id) ?? { id, status: "SETTLED" };
  }
}
