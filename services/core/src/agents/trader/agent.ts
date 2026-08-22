import type { AgentRecord } from "../../database/repositories.js";
import type { Logger } from "../../observability/logger.js";
import type { TradeExecutionService, TradeResult } from "../execution/service.js";
import type { TradeIntent } from "../types/index.js";

/**
 * TraderAgent (Phase 6 §5). Turns an approved research/portfolio decision into a typed
 * {TradeIntent} and executes it through the Guard-gated {TradeExecutionService}. It never
 * holds raw keys and never broadcasts arbitrary transactions — only structured trades.
 */
export class TraderAgent {
  constructor(
    private readonly exec: TradeExecutionService,
    private readonly logger: Logger,
  ) {}

  buildIntent(params: {
    assetIn: string;
    assetOut: string;
    amount: string;
    maxSlippageBps?: number;
    deadline?: number;
  }): TradeIntent {
    return {
      type: "TRADE",
      assetIn: params.assetIn.toUpperCase(),
      assetOut: params.assetOut.toUpperCase(),
      amount: params.amount,
      maxSlippageBps: params.maxSlippageBps ?? 100,
      ...(params.deadline ? { deadline: params.deadline } : {}),
    };
  }

  execute(agent: AgentRecord, intent: TradeIntent): Promise<TradeResult> {
    this.logger.info("trader executing intent", { agent: agent.id, assetIn: intent.assetIn, assetOut: intent.assetOut });
    return this.exec.execute(agent, intent);
  }
}
