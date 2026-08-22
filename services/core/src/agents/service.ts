import type { Repositories, AgentRole } from "../database/repositories.js";
import type { NoteManager } from "../notes/manager.js";
import type { NoteEncryptionService } from "../notes/encryption.js";
import type { ExecutionEngine } from "../execution/engine.js";
import type { OperationDispatcher } from "../execution/dispatcher.js";
import type { Logger } from "../observability/logger.js";

import { loadAgentsConfig, type AgentsConfig } from "./config.js";
import { createTradingProvider, type TradingProvider } from "./trading/index.js";
import { createPriceProvider, type PriceProvider } from "./prices/index.js";
import { tradePolicyFromEnv, type TradePolicy } from "./guard/trade-policy.js";
import { AgentWalletService } from "./wallets/service.js";
import { ResearchAgent } from "./researcher/agent.js";
import { PortfolioAgent } from "./portfolio/agent.js";
import { TradeExecutionService, type TradeResult } from "./execution/service.js";
import { TraderAgent } from "./trader/agent.js";
import { Orchestrator, type OrchestrationResult } from "./orchestrator/orchestrator.js";
import { MemoryService } from "./memory/service.js";
import { createTradingTools, runTool, type AgentTool } from "./tools/index.js";
import type { AgentMemoryRecord } from "../database/repositories.js";
import { assetBySymbol } from "./shared/assets.js";
import type { Quote, ResearchResult, SimulationResult, TokenRef } from "./types/index.js";

export interface AgentsServiceDeps {
  repos: Repositories;
  engine: ExecutionEngine;
  dispatcher: OperationDispatcher;
  notes: NoteManager;
  encryption: NoteEncryptionService;
  chain: { id: number; rpcUrl: string };
  logger: Logger;
  config?: AgentsConfig;
}

/**
 * AgentsService (Phase 6) — the single wiring hub the API layer talks to. It composes the
 * providers (trading/price), the agent wallet/signer boundary, the three agents, the Guard
 * trade policy, the execution service, and the orchestrator. Every mutation flows through
 * the Guard-gated execution service or the existing Core engine — never raw RPC.
 */
export class AgentsService {
  readonly config: AgentsConfig;
  readonly policy: TradePolicy;
  readonly trading: TradingProvider;
  readonly prices: PriceProvider;
  readonly wallets: AgentWalletService;
  readonly research: ResearchAgent;
  readonly portfolio: PortfolioAgent;
  readonly exec: TradeExecutionService;
  readonly trader: TraderAgent;
  readonly orchestrator: Orchestrator;
  readonly memory: MemoryService;
  readonly tradingTools: AgentTool[];

  constructor(private readonly d: AgentsServiceDeps) {
    this.config = d.config ?? loadAgentsConfig();
    this.policy = tradePolicyFromEnv();
    this.trading = createTradingProvider(this.config);
    this.prices = createPriceProvider(this.config);
    this.wallets = new AgentWalletService({ repo: d.repos.agents, enc: d.encryption, chain: d.chain });
    this.research = new ResearchAgent(this.config, this.prices, d.logger);
    this.portfolio = new PortfolioAgent(d.repos.notes, d.repos.portfolio, this.prices, d.logger);
    this.exec = new TradeExecutionService({
      tradeIntents: d.repos.tradeIntents,
      tradeExecutions: d.repos.tradeExecutions,
      notesRepo: d.repos.notes,
      notes: d.notes,
      wallets: this.wallets,
      trading: this.trading,
      prices: this.prices,
      policy: this.policy,
      tradingChainId: this.config.tradingChainId,
      logger: d.logger,
    });
    this.trader = new TraderAgent(this.exec, d.logger);
    this.memory = new MemoryService(d.repos.memory, this.config.embeddings);
    this.tradingTools = createTradingTools({ prices: this.prices, trading: this.trading, tradingChainId: this.config.tradingChainId });
    this.orchestrator = new Orchestrator(
      this.research,
      this.portfolio,
      this.trader,
      this.wallets,
      this.prices,
      this.config,
      this.memory,
      d.logger,
    );
  }

  // ---- Agents ----
  /** Only the Trading Agent owns a wallet; this creates/returns it. */
  getTradingAgent(owner: string) {
    return this.wallets.getOrCreate(owner, "TRADER");
  }
  getOrCreateAgent(owner: string, role: AgentRole, name?: string) {
    return this.wallets.getOrCreate(owner, role, name);
  }

  // ---- Tools (LangChain-shape: name/description/schema/func) ----
  listTools(): Array<{ name: string; description: string }> {
    return this.tradingTools.map((t) => ({ name: t.name, description: t.description }));
  }
  invokeTool(name: string, input: unknown): Promise<unknown> {
    return runTool(this.tradingTools, name, input);
  }

  // ---- Memory ----
  listMemory(owner: string, limit?: number): Promise<AgentMemoryRecord[]> {
    return this.memory.recall(owner, limit ? { limit } : {});
  }
  memoryCount(owner: string): Promise<number> {
    return this.memory.count(owner);
  }
  forgetMemory(id: string): Promise<void> {
    return this.memory.forget(id);
  }
  clearMemory(owner: string): Promise<void> {
    return this.memory.clear(owner);
  }
  listAgents(owner: string) {
    return this.wallets.listByOwner(owner);
  }
  getAgent(id: string) {
    return this.wallets.get(id);
  }
  async getReceiveIdentity(id: string) {
    const agent = await this.wallets.get(id);
    return agent ? { agentId: agent.id, talosPublicKey: agent.talosPublicKey, walletAddress: agent.walletAddress } : null;
  }

  // ---- Research ----
  researchAsset(asset: string): Promise<ResearchResult> {
    return this.research.analyze(asset);
  }

  // ---- Portfolio ----
  getPortfolio(owner: string) {
    return this.portfolio.snapshot(owner);
  }
  portfolioHistory(owner: string, limit?: number) {
    return this.d.repos.portfolio.history(owner.toLowerCase(), limit);
  }
  async setTarget(owner: string, allocations: Record<string, number>) {
    await this.portfolio.setTarget(owner, { allocations });
    const desc = Object.entries(allocations).map(([s, w]) => `${(w * 100).toFixed(0)}% ${s}`).join(", ");
    await this.memory.remember(owner, "SEMANTIC", `Target allocation: ${desc}`, { importance: 3, metadata: { allocations } });
  }

  // ---- Quotes / simulation ----
  private tokenRef(symbol: string): TokenRef | null {
    const info = assetBySymbol(symbol);
    return info ? { symbol: info.symbol, address: info.address, decimals: info.decimals } : null;
  }
  async quote(req: { assetIn: string; assetOut: string; amount: string; slippageBps?: number }): Promise<Quote> {
    const fromToken = this.tokenRef(req.assetIn);
    const toToken = this.tokenRef(req.assetOut);
    if (!fromToken || !toToken) throw new Error("unknown asset in quote request");
    return this.trading.getQuote({ chainId: this.config.tradingChainId, fromToken, toToken, amount: req.amount, slippageBps: req.slippageBps ?? 100 });
  }
  async simulate(req: { assetIn: string; assetOut: string; amount: string; slippageBps?: number; wallet: string }): Promise<SimulationResult> {
    const fromToken = this.tokenRef(req.assetIn);
    const toToken = this.tokenRef(req.assetOut);
    if (!fromToken || !toToken) throw new Error("unknown asset in simulate request");
    return this.trading.simulateTrade({ chainId: this.config.tradingChainId, fromToken, toToken, amount: req.amount, slippageBps: req.slippageBps ?? 100, userWalletAddress: req.wallet });
  }

  // ---- Trades ----
  async createTrade(owner: string, req: { assetIn: string; assetOut: string; amount: string; maxSlippageBps?: number }): Promise<TradeResult> {
    const agent = await this.wallets.getOrCreate(owner, "TRADER");
    const intent = this.trader.buildIntent(req);
    const result = await this.trader.execute(agent, intent);
    await this.memory.remember(
      owner,
      "EPISODIC",
      `Trade ${req.assetIn}→${req.assetOut}: ${result.decision}/${result.status}. ${result.reason}`,
      { importance: result.decision === "APPROVED" ? 2 : 1, asset: req.assetOut, agentId: agent.id, metadata: { executionId: result.executionId } },
    );
    return result;
  }
  async approveTrade(executionId: string): Promise<TradeResult> {
    const exec = await this.d.repos.tradeExecutions.get(executionId);
    if (!exec) throw new Error("trade execution not found");
    const intentRec = await this.d.repos.tradeIntents.get(exec.intentId);
    const agent = await this.wallets.get(exec.agentId);
    if (!intentRec || !agent) throw new Error("trade intent/agent not found");
    return this.exec.approve(agent, {
      type: "TRADE",
      assetIn: intentRec.assetIn,
      assetOut: intentRec.assetOut,
      amount: intentRec.amount,
      maxSlippageBps: intentRec.maxSlippageBps,
    });
  }
  getTrade(id: string) {
    return this.d.repos.tradeExecutions.get(id);
  }
  listTrades(owner: string, limit?: number) {
    return this.d.repos.tradeExecutions.listByOwner(owner.toLowerCase(), limit);
  }

  // ---- Agent-to-agent private transfer (reuses the existing TRANSFER operation) ----
  async transfer(
    owner: string,
    fromAgentId: string,
    req: { toAgentId?: string; toPublicKey?: string; assetId: number; amount: string },
  ): Promise<{ operationId: string; status: string }> {
    let toPublicKey = req.toPublicKey;
    if (!toPublicKey && req.toAgentId) {
      const to = await this.wallets.get(req.toAgentId);
      if (!to) throw new Error("recipient agent not found");
      toPublicKey = to.talosPublicKey;
    }
    if (!toPublicKey) throw new Error("recipient (toAgentId or toPublicKey) is required");

    const need = BigInt(req.amount);
    const note = (await this.d.repos.notes.list(1000, owner.toLowerCase())).find(
      (n) => n.state === "AVAILABLE" && Number(n.assetId) === req.assetId && BigInt(n.value) >= need,
    );
    if (!note) throw new Error(`no available note of asset ${req.assetId} worth at least ${need}`);
    const change = (BigInt(note.value) - need).toString();

    const op = await this.d.engine.createOperation(
      "TRANSFER",
      { noteId: note.id, amount1: req.amount, amount2: change, recipientOwnerPubKey: toPublicKey },
      null,
    );
    await this.d.dispatcher.dispatch(op.id);
    await this.d.repos.agentTransfers.create({
      id: `atx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      fromAgentId,
      toPublicKey,
      assetId: req.assetId,
      amount: req.amount,
      operationId: op.id,
      status: op.status,
      createdAt: new Date().toISOString(),
    });
    return { operationId: op.id, status: op.status };
  }

  // ---- Orchestration ----
  async orchestrate(owner: string, message: string): Promise<OrchestrationResult> {
    const result = await this.orchestrator.handle(owner, message);
    await this.memory.remember(owner, "EPISODIC", `User: "${message}" → ${result.reply.slice(0, 180)}`, {
      importance: 1,
      metadata: { hasTrade: Boolean(result.trade), decision: result.trade?.decision ?? null },
    });
    return result;
  }
}
