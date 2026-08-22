import type { AgentsConfig } from "../config.js";
import { MockTradingProvider } from "./mock.js";
import { OkxTradingProvider } from "./okx.js";
import type { TradingProvider } from "./provider.js";

export type { TradingProvider, SwapTx } from "./provider.js";
export { MockTradingProvider } from "./mock.js";
export { OkxTradingProvider } from "./okx.js";

/** Real OKX provider when DEX keys are configured, else a deterministic mock. */
export function createTradingProvider(config: AgentsConfig): TradingProvider {
  if (config.okx) return new OkxTradingProvider(config.okx);
  return new MockTradingProvider();
}
