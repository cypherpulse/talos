import type { AgentsConfig } from "../config.js";
import type { Logger } from "../../observability/logger.js";
import type { PriceProvider } from "../prices/index.js";
import type { Recommendation, ResearchResult } from "../types/index.js";

/**
 * ResearchAgent (Phase 6 §3) — READ-ONLY. Produces a structured trade recommendation.
 * Uses xAI Grok (OpenAI-compatible Chat Completions) when configured, else a deterministic
 * rule-based analyst. It never signs, submits, or mutates anything.
 */
export class ResearchAgent {
  constructor(
    private readonly config: AgentsConfig,
    private readonly prices: PriceProvider,
    private readonly logger: Logger,
  ) {}

  async analyze(asset: string, context?: { maxSlippageBps?: number }): Promise<ResearchResult> {
    const priceUsd = await this.prices.getPriceUsd(asset);
    const maxSlippageBps = context?.maxSlippageBps ?? 100;

    if (this.config.grok) {
      try {
        return await this.analyzeWithGrok(asset, priceUsd, maxSlippageBps);
      } catch (e) {
        this.logger.warn("grok research failed, using rule-based fallback", { error: String(e) });
      }
    }
    return this.ruleBased(asset, priceUsd, maxSlippageBps);
  }

  private async analyzeWithGrok(asset: string, priceUsd: number, maxSlippageBps: number): Promise<ResearchResult> {
    const grok = this.config.grok!;
    const system =
      "You are a crypto trading research analyst. Respond ONLY with strict JSON: " +
      '{"recommendation":"BUY|SELL|HOLD","confidence":0..1,"rationale":"...","maxSlippageBps":number}. ' +
      "Be concise and risk-aware. Do not include any text outside the JSON.";
    const user = `Analyze ${asset} for a short-term private-portfolio trade. Current price ≈ $${priceUsd}. Suggest a recommendation and a reasonable max slippage in bps.`;

    const res = await fetch(`${grok.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${grok.apiKey}` },
      body: JSON.stringify({
        model: grok.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
      }),
    });
    if (!res.ok) throw new Error(`Grok API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as {
      recommendation?: string;
      confidence?: number;
      rationale?: string;
      maxSlippageBps?: number;
    };
    const rec = (parsed.recommendation ?? "HOLD").toUpperCase();
    return {
      asset: asset.toUpperCase(),
      recommendation: (["BUY", "SELL", "HOLD"].includes(rec) ? rec : "HOLD") as Recommendation,
      confidence: clamp01(parsed.confidence ?? 0.5),
      rationale: parsed.rationale ?? "No rationale provided.",
      maxSlippageBps: parsed.maxSlippageBps ?? maxSlippageBps,
      priceUsd,
      source: `grok:${grok.model}`,
    };
  }

  private ruleBased(asset: string, priceUsd: number, maxSlippageBps: number): ResearchResult {
    const isStable = ["USDC", "USDT", "USDG", "DAI"].includes(asset.toUpperCase());
    return {
      asset: asset.toUpperCase(),
      recommendation: "HOLD",
      confidence: 0.5,
      rationale: isStable
        ? `${asset} is a USD stablecoin (~$1); no directional trade suggested without a market-data model.`
        : `No live research model configured; holding ${asset} at ≈ $${priceUsd}. Set GROK_API_KEY for model-driven analysis.`,
      maxSlippageBps,
      priceUsd,
      source: "rule-based",
    };
  }
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5);
