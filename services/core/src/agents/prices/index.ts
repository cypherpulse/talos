import type { AgentsConfig } from "../config.js";

/**
 * Price provider (Phase 6) — USD spot prices for portfolio valuation and research.
 * Falls back through providers so it always returns a number; a final static table
 * guarantees the flow never blocks on a missing/unauthorized price feed.
 */
export interface PriceProvider {
  readonly name: string;
  getPriceUsd(symbol: string): Promise<number>;
}

const FALLBACK_USD: Record<string, number> = { USDC: 1, USDT: 1, USDG: 1, DAI: 1, OKB: 45, WOKB: 45, ETH: 3000 };
const fallback = (symbol: string): number => FALLBACK_USD[symbol.toUpperCase()] ?? 0;

/** Stablecoins are pinned to $1 without a network call. */
const isStable = (s: string): boolean => ["USDC", "USDT", "USDG", "DAI"].includes(s.toUpperCase());

class MockPriceProvider implements PriceProvider {
  readonly name = "mock";
  async getPriceUsd(symbol: string): Promise<number> {
    return fallback(symbol);
  }
}

class CoinMarketCapPriceProvider implements PriceProvider {
  readonly name = "coinmarketcap";
  constructor(private readonly apiKey: string) {}
  async getPriceUsd(symbol: string): Promise<number> {
    if (isStable(symbol)) return 1;
    try {
      const res = await fetch(
        `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(symbol.toUpperCase())}`,
        { headers: { "X-CMC_PRO_API_KEY": this.apiKey, Accept: "application/json" } },
      );
      const json = (await res.json()) as { data?: Record<string, { quote?: { USD?: { price?: number } } }> };
      const price = json.data?.[symbol.toUpperCase()]?.quote?.USD?.price;
      return typeof price === "number" ? price : fallback(symbol);
    } catch {
      return fallback(symbol);
    }
  }
}

class CoinbasePriceProvider implements PriceProvider {
  readonly name = "coinbase";
  async getPriceUsd(symbol: string): Promise<number> {
    if (isStable(symbol)) return 1;
    try {
      const res = await fetch(`https://api.coinbase.com/v2/prices/${encodeURIComponent(symbol.toUpperCase())}-USD/spot`);
      const json = (await res.json()) as { data?: { amount?: string } };
      const price = json.data?.amount ? Number(json.data.amount) : NaN;
      return Number.isFinite(price) ? price : fallback(symbol);
    } catch {
      return fallback(symbol);
    }
  }
}

class OkxPriceProvider implements PriceProvider {
  readonly name = "okx";
  async getPriceUsd(symbol: string): Promise<number> {
    if (isStable(symbol)) return 1;
    try {
      const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(symbol.toUpperCase())}-USDT`);
      const json = (await res.json()) as { data?: Array<{ last?: string }> };
      const price = json.data?.[0]?.last ? Number(json.data[0].last) : NaN;
      return Number.isFinite(price) ? price : fallback(symbol);
    } catch {
      return fallback(symbol);
    }
  }
}

export function createPriceProvider(config: AgentsConfig): PriceProvider {
  switch (config.price.provider) {
    case "coinmarketcap":
      return config.price.coinmarketcapApiKey
        ? new CoinMarketCapPriceProvider(config.price.coinmarketcapApiKey)
        : new OkxPriceProvider();
    case "coinbase":
      return new CoinbasePriceProvider();
    case "okx":
      return new OkxPriceProvider();
    default:
      return new MockPriceProvider();
  }
}
