import { createHmac } from "node:crypto";

import type { Quote, QuoteRequest, SimulationResult, TradeExecution, TradeRequest } from "../types/index.js";
import type { SwapTx, TradingProvider } from "./provider.js";

export interface OkxCredentials {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  /** Defaults to https://web3.okx.com */
  baseUrl?: string;
  /** DEX aggregator path prefix. Defaults to /api/v5/dex/aggregator */
  aggregatorPath?: string;
}

interface OkxEnvelope<T> {
  code: string;
  msg: string;
  data: T[];
}

/**
 * OKX Web3 DEX aggregator provider (Phase 6 §7). Real quotes + swap calldata for X Layer.
 * Requests are signed with the standard OKX HMAC scheme. This provider builds the swap
 * transaction; signing/broadcasting happens behind the signer/execution boundary — never
 * here, and never with a key exposed to the LLM.
 */
export class OkxTradingProvider implements TradingProvider {
  readonly name = "okx";
  private readonly baseUrl: string;
  private readonly prefix: string;

  constructor(private readonly creds: OkxCredentials) {
    this.baseUrl = (creds.baseUrl ?? "https://web3.okx.com").replace(/\/+$/, "");
    this.prefix = creds.aggregatorPath ?? "/api/v5/dex/aggregator";
  }

  private headers(method: string, requestPath: string, body = ""): Record<string, string> {
    const timestamp = new Date().toISOString();
    const prehash = timestamp + method.toUpperCase() + requestPath + body;
    const sign = createHmac("sha256", this.creds.secretKey).update(prehash).digest("base64");
    return {
      "Content-Type": "application/json",
      "OK-ACCESS-KEY": this.creds.apiKey,
      "OK-ACCESS-SIGN": sign,
      "OK-ACCESS-PASSPHRASE": this.creds.passphrase,
      "OK-ACCESS-TIMESTAMP": timestamp,
    };
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T[]> {
    const qs = new URLSearchParams(params).toString();
    const requestPath = `${this.prefix}${path}?${qs}`;
    const res = await fetch(`${this.baseUrl}${requestPath}`, {
      method: "GET",
      headers: this.headers("GET", requestPath),
    });
    const json = (await res.json()) as OkxEnvelope<T>;
    if (json.code !== "0") throw new Error(`OKX DEX error ${json.code}: ${json.msg || "request failed"}`);
    return json.data ?? [];
  }

  async getQuote(request: QuoteRequest): Promise<Quote> {
    const [d] = await this.get<Record<string, unknown>>("/quote", {
      chainId: String(request.chainId),
      amount: request.amount,
      fromTokenAddress: request.fromToken.address,
      toTokenAddress: request.toToken.address,
      slippage: (request.slippageBps / 10_000).toString(),
    });
    if (!d) throw new Error("OKX DEX returned no quote");
    return {
      fromToken: request.fromToken,
      toToken: request.toToken,
      fromAmount: request.amount,
      toAmount: String(d.toTokenAmount ?? "0"),
      estimatedGas: d.estimateGasFee ? String(d.estimateGasFee) : undefined,
      raw: d,
    };
  }

  async buildSwapTx(request: TradeRequest): Promise<SwapTx> {
    const [d] = await this.get<Record<string, any>>("/swap", {
      chainId: String(request.chainId),
      amount: request.amount,
      fromTokenAddress: request.fromToken.address,
      toTokenAddress: request.toToken.address,
      slippage: (request.slippageBps / 10_000).toString(),
      userWalletAddress: request.userWalletAddress,
    });
    if (!d?.tx) throw new Error("OKX DEX returned no swap transaction");
    const router: string = d.tx.to ?? d.routerResult?.toTokenAmount ?? "";
    const quote: Quote = {
      fromToken: request.fromToken,
      toToken: request.toToken,
      fromAmount: request.amount,
      toAmount: String(d.routerResult?.toTokenAmount ?? "0"),
      routerAddress: router,
      estimatedGas: d.tx.gas ? String(d.tx.gas) : undefined,
      raw: d,
    };
    return {
      to: d.tx.to,
      data: d.tx.data,
      value: String(d.tx.value ?? "0"),
      gas: d.tx.gas ? String(d.tx.gas) : undefined,
      spender: router,
      quote,
    };
  }

  /**
   * MVP simulation: OKX's on-chain simulate endpoint is whitelist-gated, so we derive the
   * expected asset changes from the quote. Callers still simulate the actual signed tx via
   * the execution layer before broadcasting.
   */
  async simulateTrade(request: TradeRequest): Promise<SimulationResult> {
    const quote = await this.getQuote(request);
    return {
      ok: BigInt(quote.toAmount) > 0n,
      gasUsed: quote.estimatedGas,
      assetChanges: [
        { symbol: request.fromToken.symbol, rawValue: `-${request.amount}` },
        { symbol: request.toToken.symbol, rawValue: quote.toAmount },
      ],
    };
  }

  async getTradeStatus(id: string): Promise<TradeExecution> {
    // Status is tracked by Talos's own TransactionManager after broadcast; the OKX order
    // API can be layered in later. Return the id as pending until the execution layer updates it.
    return { id, status: "SUBMITTED" };
  }
}
