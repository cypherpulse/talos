import { z } from "zod";

import type { PriceProvider } from "../prices/index.js";
import type { TradingProvider } from "../trading/index.js";
import { assetBySymbol, toBase, toHuman } from "../shared/assets.js";

/**
 * Agent tools in the LangChain StructuredTool shape (name + description + zod schema +
 * func), WITHOUT the LangChain dependency. Each tool is a typed, self-describing unit the
 * agents/orchestrator (or an LLM function-caller) can invoke. Tools only ever touch the
 * typed providers — never raw RPC, keys, or arbitrary contracts.
 */
export interface AgentTool<I = unknown, O = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<I>;
  func: (input: I) => Promise<O>;
  /** Validate input against the schema, then execute. */
  invoke(input: unknown): Promise<O>;
}

function tool<I, O>(def: { name: string; description: string; schema: z.ZodType<I>; func: (input: I) => Promise<O> }): AgentTool {
  return {
    name: def.name,
    description: def.description,
    schema: def.schema as z.ZodType<unknown>,
    func: def.func as (input: unknown) => Promise<unknown>,
    async invoke(input: unknown) {
      return def.func(def.schema.parse(input));
    },
  };
}

/** JSON-schema-ish spec for exposing a tool to an OpenAI/Grok function-caller. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface TradingToolDeps {
  prices: PriceProvider;
  trading: TradingProvider;
  tradingChainId: number;
}

const ZERO = "0x0000000000000000000000000000000000000000";

/** Build the price + swap tool set from the configured providers. */
export function createTradingTools(deps: TradingToolDeps): AgentTool[] {
  const { prices, trading, tradingChainId } = deps;

  const resolve = (symbol: string) => {
    const info = assetBySymbol(symbol);
    if (!info) throw new Error(`unknown asset "${symbol}"`);
    return info;
  };

  const getPrice = tool({
    name: "get_price",
    description:
      "Get the current USD spot price for a token symbol (e.g. OKB, USDC, USDT). Use before sizing a trade or valuing a position.",
    schema: z.object({ symbol: z.string().describe("Token symbol, e.g. OKB") }),
    func: async ({ symbol }) => {
      const priceUsd = await prices.getPriceUsd(symbol);
      return { symbol: symbol.toUpperCase(), priceUsd, source: prices.name };
    },
  });

  const getSwapQuote = tool({
    name: "get_swap_quote",
    description:
      "Get a DEX swap quote: expected output amount for swapping `amount` (in whole tokens) of `assetIn` into `assetOut`, at `maxSlippageBps`. Read-only.",
    schema: z.object({
      assetIn: z.string().describe("Symbol to sell, e.g. USDC"),
      assetOut: z.string().describe("Symbol to buy, e.g. OKB"),
      amount: z.union([z.string(), z.number()]).describe("Amount of assetIn in whole tokens, e.g. 50"),
      maxSlippageBps: z.number().int().positive().max(10_000).optional(),
    }),
    func: async ({ assetIn, assetOut, amount, maxSlippageBps }) => {
      const inInfo = resolve(assetIn);
      const outInfo = resolve(assetOut);
      const amountBase = toBase(Number(amount), inInfo.decimals);
      const quote = await trading.getQuote({
        chainId: tradingChainId,
        fromToken: { symbol: inInfo.symbol, address: inInfo.address, decimals: inInfo.decimals },
        toToken: { symbol: outInfo.symbol, address: outInfo.address, decimals: outInfo.decimals },
        amount: amountBase,
        slippageBps: maxSlippageBps ?? 100,
      });
      return {
        provider: trading.name,
        assetIn: inInfo.symbol,
        assetOut: outInfo.symbol,
        amountIn: Number(amount),
        expectedOut: toHuman(quote.toAmount, outInfo.decimals),
        expectedOutBase: quote.toAmount,
        priceImpactBps: quote.priceImpactBps ?? null,
        estimatedGas: quote.estimatedGas ?? null,
      };
    },
  });

  const simulateSwap = tool({
    name: "simulate_swap",
    description:
      "Simulate a swap and report whether it would succeed plus the expected asset changes. Read-only; does not execute or sign anything.",
    schema: z.object({
      assetIn: z.string(),
      assetOut: z.string(),
      amount: z.union([z.string(), z.number()]),
      maxSlippageBps: z.number().int().positive().max(10_000).optional(),
      wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional().describe("Wallet that would sign the swap"),
    }),
    func: async ({ assetIn, assetOut, amount, maxSlippageBps, wallet }) => {
      const inInfo = resolve(assetIn);
      const outInfo = resolve(assetOut);
      const sim = await trading.simulateTrade({
        chainId: tradingChainId,
        fromToken: { symbol: inInfo.symbol, address: inInfo.address, decimals: inInfo.decimals },
        toToken: { symbol: outInfo.symbol, address: outInfo.address, decimals: outInfo.decimals },
        amount: toBase(Number(amount), inInfo.decimals),
        slippageBps: maxSlippageBps ?? 100,
        userWalletAddress: wallet ?? ZERO,
      });
      return {
        provider: trading.name,
        ok: sim.ok,
        failReason: sim.failReason ?? null,
        gasUsed: sim.gasUsed ?? null,
        assetChanges: sim.assetChanges ?? [],
      };
    },
  });

  return [getPrice, getSwapQuote, simulateSwap];
}

/** Convert a tool to an OpenAI/Grok function-calling spec (best-effort JSON schema). */
export function toToolSpec(t: AgentTool): ToolSpec {
  return {
    name: t.name,
    description: t.description,
    parameters: { type: "object", description: `Input for ${t.name}` },
  };
}

/** Look up and invoke a tool by name from a registry. */
export async function runTool(tools: AgentTool[], name: string, input: unknown): Promise<unknown> {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`unknown tool: ${name}`);
  return t.invoke(input);
}
