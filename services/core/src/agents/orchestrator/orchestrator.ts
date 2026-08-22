import type { AgentsConfig } from "../config.js";
import type { Logger } from "../../observability/logger.js";
import type { AgentWalletService } from "../wallets/service.js";
import type { ResearchAgent } from "../researcher/agent.js";
import type { PortfolioAgent } from "../portfolio/agent.js";
import type { TraderAgent } from "../trader/agent.js";
import type { TradeResult } from "../execution/service.js";
import type { PriceProvider } from "../prices/index.js";
import type { MemoryService } from "../memory/service.js";
import { assetBySymbol, toBase } from "../shared/assets.js";
import { loadAssets } from "../../domain/assets.js";
import type { PortfolioSnapshot, RebalanceAction, ResearchResult, TradeIntent } from "../types/index.js";

export interface OrchestrationResult {
  reply: string;
  research?: ResearchResult;
  intent?: TradeIntent;
  trade?: TradeResult;
  rebalance?: RebalanceAction[];
  snapshot?: PortfolioSnapshot;
}

interface Plan {
  action: "TRADE" | "RESEARCH" | "REBALANCE" | "BALANCE" | "CHAT";
  assetIn?: string;
  assetOut?: string;
  amountUsd?: number;
  slippageBps?: number;
  allocations?: Record<string, number>;
  reply?: string;
}

/**
 * Talos Orchestrator (Phase 6). The primary user-facing agent: it reasons about the
 * request (LLM planner using the user's portfolio + memory as context), then coordinates
 * the specialist agents — Research → Portfolio → Trader → Guard → execution. Falls back
 * to deterministic routing if no planning LLM is configured.
 */
export class Orchestrator {
  constructor(
    private readonly research: ResearchAgent,
    private readonly portfolio: PortfolioAgent,
    private readonly trader: TraderAgent,
    private readonly wallets: AgentWalletService,
    private readonly prices: PriceProvider,
    private readonly config: AgentsConfig,
    private readonly memory: MemoryService,
    private readonly logger: Logger,
  ) {}

  private symbols(): string[] {
    return loadAssets().map((a) => a.symbol.toUpperCase());
  }

  async handle(owner: string, message: string): Promise<OrchestrationResult> {
    const plan = await this.plan(owner, message).catch(() => null);
    if (!plan) return this.route(owner, message); // deterministic fallback

    switch (plan.action) {
      case "TRADE":
        return this.execTrade(owner, plan);
      case "REBALANCE":
        return this.execRebalance(owner, plan);
      case "RESEARCH": {
        const asset = (plan.assetOut ?? plan.assetIn ?? "OKB").toUpperCase();
        const research = await this.research.analyze(asset, plan.slippageBps ? { maxSlippageBps: plan.slippageBps } : undefined);
        return {
          reply: plan.reply ?? `Research on ${asset}: ${research.recommendation} (${(research.confidence * 100).toFixed(0)}%). ${research.rationale}`,
          research,
        };
      }
      case "BALANCE":
        return this.execBalance(owner, plan.reply);
      case "CHAT":
      default:
        return { reply: plan.reply ?? "Tell me what you'd like to research, trade, or rebalance." };
    }
  }

  /** LLM planner: turn the user's objective into a structured, executable plan. */
  private async plan(owner: string, message: string): Promise<Plan | null> {
    const llm = this.config.grok;
    if (!llm) return null;

    const [snapshot, memoryCtx] = await Promise.all([
      this.portfolio.snapshot(owner).catch(() => null),
      this.memory.context(owner, message).catch(() => ""),
    ]);
    const holdings = snapshot?.positions.map((p) => `${p.symbol} $${p.valueUsd.toFixed(2)}`).join(", ") || "none";

    const system =
      "You are the Talos trading orchestrator. Decide how to handle the user's request and respond with STRICT JSON only:\n" +
      '{"action":"TRADE|RESEARCH|REBALANCE|BALANCE|CHAT","assetIn":"USDC","assetOut":"OKB","amountUsd":50,"slippageBps":100,"allocations":{"USDC":0.7,"OKB":0.3},"reply":"short message to the user"}\n' +
      `Tradable assets: ${this.symbols().join(", ")}. Funding asset is usually USDC. ` +
      "Rules: TRADE needs assetOut + amountUsd (USD to spend). REBALANCE needs allocations summing to ~1. " +
      "You CANNOT guarantee profit or returns — if the user asks for guaranteed/unrealistic profit, use CHAT and set a brief honest reply, optionally suggesting a research or a modest trade within their Guard limits. " +
      "Keep reply under 240 chars. Never invent balances. Output JSON only.";
    const user =
      `Request: "${message}"\n` +
      `User private holdings: ${holdings} (total $${snapshot?.totalValueUsd.toFixed(2) ?? "0"}).\n` +
      (memoryCtx ? `Known preferences:\n${memoryCtx}\n` : "") +
      "Respond with the JSON plan.";

    const res = await fetch(`${llm.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${llm.apiKey}` },
      body: JSON.stringify({ model: llm.model, temperature: 0.2, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    if (!json) return null;
    const plan = JSON.parse(json) as Plan;
    this.logger.info("orchestrator plan", { action: plan.action, assetOut: plan.assetOut, amountUsd: plan.amountUsd });
    return plan;
  }

  private async execTrade(owner: string, plan: Plan): Promise<OrchestrationResult> {
    const assetOut = (plan.assetOut ?? "OKB").toUpperCase();
    const assetIn = (plan.assetIn ?? "USDC").toUpperCase();
    const inInfo = assetBySymbol(assetIn);
    if (!inInfo) return { reply: `Unknown funding asset ${assetIn}.` };
    if (!plan.amountUsd || plan.amountUsd <= 0) {
      return { reply: plan.reply ?? `How much (in USD of ${assetIn}) should I trade into ${assetOut}?` };
    }
    const priceIn = await this.prices.getPriceUsd(assetIn);
    const amount = toBase(plan.amountUsd / (priceIn || 1), inInfo.decimals);
    const research = await this.research.analyze(assetOut, plan.slippageBps ? { maxSlippageBps: plan.slippageBps } : undefined);
    const agent = await this.wallets.getOrCreate(owner, "TRADER");
    const intent = this.trader.buildIntent({ assetIn, assetOut, amount, maxSlippageBps: plan.slippageBps ?? research.maxSlippageBps });
    const trade = await this.trader.execute(agent, intent);
    const outcome = trade.decision === "REJECTED" ? "blocked by Guard" : trade.status === "SETTLED" ? "executed" : trade.status.toLowerCase();
    return {
      reply: `${plan.reply ? plan.reply + " " : ""}Trade ${assetIn}→${assetOut} (~$${plan.amountUsd}): ${outcome}. ${trade.reason}`,
      research,
      intent,
      trade,
    };
  }

  private async execRebalance(owner: string, plan: Plan): Promise<OrchestrationResult> {
    const allocations = plan.allocations ?? {};
    if (Object.keys(allocations).length === 0) return { reply: plan.reply ?? 'Give me target weights, e.g. "70% stablecoins, 30% OKB".' };
    await this.portfolio.setTarget(owner, { allocations });
    const actions = await this.portfolio.decideRebalance(owner, { allocations });
    const snapshot = await this.portfolio.snapshot(owner);
    if (actions.length === 0) return { reply: `Target set. Already within band — no rebalance needed.`, rebalance: [], snapshot };
    const action = actions[0]!;
    const research = await this.research.analyze(action.assetOut);
    const agent = await this.wallets.getOrCreate(owner, "TRADER");
    const intent = this.trader.buildIntent({ assetIn: action.assetIn, assetOut: action.assetOut, amount: action.amount, maxSlippageBps: research.maxSlippageBps });
    const trade = await this.trader.execute(agent, intent);
    return { reply: `${plan.reply ? plan.reply + " " : ""}Rebalancing: ${action.reason}. Guard: ${trade.decision}. ${trade.reason}`, rebalance: actions, research, intent, trade, snapshot };
  }

  private async execBalance(owner: string, reply?: string): Promise<OrchestrationResult> {
    const snapshot = await this.portfolio.snapshot(owner);
    if (snapshot.positions.length === 0) return { reply: reply ?? "Your private portfolio is empty. Shield or trade to build it.", snapshot };
    const lines = snapshot.positions.map((p) => `${p.symbol} $${p.valueUsd.toFixed(2)} (${(p.weight * 100).toFixed(0)}%)`).join(", ");
    return { reply: `${reply ? reply + " " : ""}Portfolio worth $${snapshot.totalValueUsd.toFixed(2)}: ${lines}.`, snapshot };
  }

  // ---------------------------------------------------------------------------
  // Deterministic fallback (no planning LLM configured).
  // ---------------------------------------------------------------------------
  private parseSlippageBps(text: string, fallback = 100): number {
    const m = text.match(/(\d+(?:\.\d+)?)\s*%/);
    if (m) return Math.round(parseFloat(m[1]!) * 100);
    const bps = text.match(/(\d+)\s*bps/);
    return bps ? parseInt(bps[1]!, 10) : fallback;
  }

  private async route(owner: string, message: string): Promise<OrchestrationResult> {
    const text = message.toLowerCase();
    const mentioned = this.symbols().filter((s) => text.includes(s.toLowerCase()));

    if (/\b(balance|holdings|how much|my portfolio|net worth)\b/.test(text) && !/%|rebalanc|allocat|target/.test(text)) {
      return this.execBalance(owner);
    }
    if (/rebalanc|allocat|portfolio at/.test(text) && /%/.test(text)) {
      const allocations: Record<string, number> = {};
      const re = /(\d+(?:\.\d+)?)\s*%\s*(stablecoins?|stable|usdc|usdt|usdg|okb)/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const sym = m[2]!.toLowerCase().startsWith("stable") ? "USDC" : m[2]!.toUpperCase();
        allocations[sym] = (allocations[sym] ?? 0) + parseFloat(m[1]!) / 100;
      }
      return this.execRebalance(owner, { action: "REBALANCE", allocations });
    }
    if (/research|analy(?:s|z)e/.test(text) && !/buy|sell|swap|trade/.test(text)) {
      const asset = mentioned.find((s) => !["USDC", "USDT", "USDG"].includes(s)) ?? mentioned[0] ?? "OKB";
      const research = await this.research.analyze(asset, { maxSlippageBps: this.parseSlippageBps(text) });
      return { reply: `Research on ${asset}: ${research.recommendation} (${(research.confidence * 100).toFixed(0)}%). ${research.rationale}`, research };
    }
    if (/\b(buy|sell|swap|trade)\b/.test(text)) {
      const assetOut = mentioned.find((s) => !["USDC", "USDT", "USDG"].includes(s)) ?? "OKB";
      const assetIn = mentioned.find((s) => ["USDC", "USDT", "USDG"].includes(s)) ?? "USDC";
      const amt = text.match(/(\d+(?:\.\d+)?)/);
      if (!amt) return { reply: `How much ${assetIn} should I trade into ${assetOut}?` };
      return this.execTrade(owner, { action: "TRADE", assetIn, assetOut, amountUsd: parseFloat(amt[1]!), slippageBps: this.parseSlippageBps(text) });
    }
    return {
      reply:
        "I can research an asset, rebalance your private portfolio, or execute a trade within your Guard limits. " +
        'Try: "Invest $50 into OKB", "Research OKB", or "Keep 70% stablecoins and 30% OKB".',
    };
  }
}
