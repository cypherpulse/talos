import type { TradeIntent } from "../types/index.js";

/**
 * Trade policy for the Talos Guard (Phase 6 §6). Enforced in code, outside the LLM —
 * no natural-language instruction can widen a limit. Mirrors the note-operation policy
 * model but adds trading-specific controls (slippage, USD value/day limits, approved
 * providers/routes, approval threshold).
 */
export interface TradePolicy {
  /** Symbols allowed on either side of a trade. */
  allowedAssets: string[];
  /** Trading providers/routes allowed (e.g. "okx", "mock"). */
  approvedProviders: string[];
  maxSlippageBps: number;
  maxTradeValueUsd: number;
  maxDailyTradeValueUsd: number;
  /** Trades above this USD value require human approval. */
  approvalThresholdUsd: number;
}

export type TradeDecision = "APPROVED" | "REJECTED" | "APPROVAL_REQUIRED";

export interface TradeEvalInput {
  intent: TradeIntent;
  provider: string;
  valueUsd: number;
  /** USD already traded by this owner in the current window. */
  dailyUsdSoFar: number;
}

export function defaultTradePolicy(): TradePolicy {
  return {
    allowedAssets: ["USDC", "USDT", "USDG", "OKB"],
    approvedProviders: ["okx", "mock"],
    maxSlippageBps: 300,
    maxTradeValueUsd: 10_000,
    maxDailyTradeValueUsd: 50_000,
    approvalThresholdUsd: 2_000,
  };
}

const list = (v: string | undefined, fallback: string[]): string[] =>
  v ? v.split(",").map((s) => s.trim()).filter(Boolean) : fallback;
const numOr = (v: string | undefined, fallback: number): number => (v && !Number.isNaN(Number(v)) ? Number(v) : fallback);

export function tradePolicyFromEnv(env: NodeJS.ProcessEnv = process.env): TradePolicy {
  const base = defaultTradePolicy();
  return {
    allowedAssets: list(env.GUARD_ALLOWED_TRADE_ASSETS, base.allowedAssets).map((s) => s.toUpperCase()),
    approvedProviders: list(env.GUARD_APPROVED_PROVIDERS, base.approvedProviders).map((s) => s.toLowerCase()),
    maxSlippageBps: numOr(env.GUARD_MAX_SLIPPAGE_BPS, base.maxSlippageBps),
    maxTradeValueUsd: numOr(env.GUARD_MAX_TRADE_VALUE_USD, base.maxTradeValueUsd),
    maxDailyTradeValueUsd: numOr(env.GUARD_MAX_DAILY_TRADE_VALUE_USD, base.maxDailyTradeValueUsd),
    approvalThresholdUsd: numOr(env.GUARD_TRADE_APPROVAL_ABOVE_USD, base.approvalThresholdUsd),
  };
}

/** Pure, deterministic trade-intent decision. The LLM cannot influence this. */
export function evaluateTradeIntent(
  policy: TradePolicy,
  input: TradeEvalInput,
): { decision: TradeDecision; reason: string } {
  const { intent, provider, valueUsd, dailyUsdSoFar } = input;
  const assetIn = intent.assetIn.toUpperCase();
  const assetOut = intent.assetOut.toUpperCase();

  if (!policy.approvedProviders.includes(provider.toLowerCase())) {
    return { decision: "REJECTED", reason: `trading provider "${provider}" is not approved` };
  }
  if (!policy.allowedAssets.includes(assetIn)) {
    return { decision: "REJECTED", reason: `asset ${assetIn} is not allowed for trading` };
  }
  if (!policy.allowedAssets.includes(assetOut)) {
    return { decision: "REJECTED", reason: `asset ${assetOut} is not allowed for trading` };
  }
  if (intent.maxSlippageBps > policy.maxSlippageBps) {
    return { decision: "REJECTED", reason: `slippage ${intent.maxSlippageBps}bps exceeds max ${policy.maxSlippageBps}bps` };
  }
  if (valueUsd > policy.maxTradeValueUsd) {
    return { decision: "REJECTED", reason: `trade value $${valueUsd.toFixed(2)} exceeds max $${policy.maxTradeValueUsd}` };
  }
  if (dailyUsdSoFar + valueUsd > policy.maxDailyTradeValueUsd) {
    return { decision: "REJECTED", reason: `daily trade limit $${policy.maxDailyTradeValueUsd} would be exceeded` };
  }
  if (valueUsd > policy.approvalThresholdUsd) {
    return { decision: "APPROVAL_REQUIRED", reason: `trade value $${valueUsd.toFixed(2)} is above the auto-approve threshold $${policy.approvalThresholdUsd}` };
  }
  return { decision: "APPROVED", reason: "within trading policy" };
}
