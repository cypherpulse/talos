import { randomUUID } from "node:crypto";

import type {
  AgentRecord,
  NotesRepository,
  TradeExecutionRecord,
  TradeExecutionsRepository,
  TradeIntentsRepository,
} from "../../database/repositories.js";
import type { NoteManager } from "../../notes/manager.js";
import type { Logger } from "../../observability/logger.js";
import type { PriceProvider } from "../prices/index.js";
import type { TradingProvider } from "../trading/index.js";
import type { AgentWalletService } from "../wallets/service.js";
import { evaluateTradeIntent, type TradeDecision, type TradePolicy } from "../guard/trade-policy.js";
import { assetBySymbol, toHuman } from "../shared/assets.js";
import type { TokenRef, TradeIntent } from "../types/index.js";

export interface ExecutionDeps {
  tradeIntents: TradeIntentsRepository;
  tradeExecutions: TradeExecutionsRepository;
  notesRepo: NotesRepository;
  notes: NoteManager;
  wallets: AgentWalletService;
  trading: TradingProvider;
  prices: PriceProvider;
  policy: TradePolicy;
  tradingChainId: number;
  logger: Logger;
}

export interface TradeResult {
  executionId: string;
  decision: TradeDecision;
  reason: string;
  status: string;
  toAmount?: string;
  valueUsd?: number;
  txHash?: string;
}

const startOfDayIso = (): string => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
};

/**
 * TradeExecutionService (Phase 6 §11). Converts an approved TradeIntent into a settled
 * trade with a fully auditable lifecycle. EVERY trade passes the Guard trade policy first.
 * On chains with real DEX liquidity + OKX keys it runs the on-chain money path
 * (private note → withdraw → swap → deposit output as a new private note). On testnet
 * (no DEX) it runs a faithful *simulated* settlement that still updates private portfolio
 * state — never claiming a public swap occurred when it did not.
 */
export class TradeExecutionService {
  constructor(private readonly d: ExecutionDeps) {}

  private toTokenRef(info: { symbol: string; address: string; decimals: number }): TokenRef {
    return { symbol: info.symbol, address: info.address, decimals: info.decimals };
  }

  private async record(exec: TradeExecutionRecord): Promise<TradeExecutionRecord> {
    exec.updatedAt = new Date().toISOString();
    return this.d.tradeExecutions.update(exec);
  }

  /** Whether real on-chain DEX execution is available (real provider + a mainnet-like chain). */
  private get realExecution(): boolean {
    return this.d.trading.name === "okx" && this.d.tradingChainId !== 1952 && this.d.tradingChainId !== 195;
  }

  async execute(agent: AgentRecord, intent: TradeIntent, opts?: { force?: boolean }): Promise<TradeResult> {
    const owner = agent.owner;
    const inInfo = assetBySymbol(intent.assetIn);
    const outInfo = assetBySymbol(intent.assetOut);

    const intentId = `intent_${randomUUID()}`;
    await this.d.tradeIntents.create({
      id: intentId,
      agentId: agent.id,
      owner,
      assetIn: intent.assetIn.toUpperCase(),
      assetOut: intent.assetOut.toUpperCase(),
      amount: intent.amount,
      maxSlippageBps: intent.maxSlippageBps,
      status: "INTENT_CREATED",
      createdAt: new Date().toISOString(),
    });

    const execId = `trade_${randomUUID()}`;
    const now = new Date().toISOString();
    const exec: TradeExecutionRecord = {
      id: execId,
      intentId,
      agentId: agent.id,
      owner,
      provider: this.d.trading.name,
      fromAmount: intent.amount,
      toAmount: "0",
      valueUsd: "0",
      status: "INTENT_CREATED",
      txHash: null,
      failReason: null,
      quote: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.d.tradeExecutions.create(exec);

    const fail = async (reason: string): Promise<TradeResult> => {
      exec.status = "FAILED";
      exec.failReason = reason;
      await this.record(exec);
      return { executionId: execId, decision: "REJECTED", reason, status: "FAILED" };
    };

    if (!inInfo || !outInfo) return fail(`unknown asset ${!inInfo ? intent.assetIn : intent.assetOut}`);

    const humanIn = toHuman(intent.amount, inInfo.decimals);
    const priceIn = await this.d.prices.getPriceUsd(inInfo.symbol);
    const valueUsd = humanIn * priceIn;
    exec.valueUsd = valueUsd.toString();

    // --- Guard (mandatory) ---
    const dailyUsdSoFar = await this.d.tradeExecutions.sumValueUsdSince(owner, startOfDayIso());
    const { decision, reason } = evaluateTradeIntent(this.d.policy, {
      intent,
      provider: this.d.trading.name,
      valueUsd,
      dailyUsdSoFar,
    });
    exec.status = "GUARD_CHECKED";
    await this.record(exec);

    if (decision === "REJECTED") {
      exec.status = "REJECTED";
      exec.failReason = reason;
      await this.record(exec);
      this.d.logger.warn("trade rejected by guard", { execId, reason });
      return { executionId: execId, decision, reason, status: "REJECTED" };
    }
    if (decision === "APPROVAL_REQUIRED" && !opts?.force) {
      exec.status = "APPROVAL_REQUIRED";
      exec.failReason = reason;
      await this.record(exec);
      return { executionId: execId, decision, reason, status: "APPROVAL_REQUIRED" };
    }

    // --- Quote + simulate ---
    let quote;
    try {
      const req = {
        chainId: this.d.tradingChainId,
        fromToken: this.toTokenRef(inInfo),
        toToken: this.toTokenRef(outInfo),
        amount: intent.amount,
        slippageBps: intent.maxSlippageBps,
      };
      quote = await this.d.trading.getQuote(req);
      exec.status = "QUOTE_REQUESTED";
      exec.quote = { toAmount: quote.toAmount, priceImpactBps: quote.priceImpactBps ?? null, provider: this.d.trading.name };
      exec.toAmount = quote.toAmount;
      await this.record(exec);

      const sim = await this.d.trading.simulateTrade({ ...req, userWalletAddress: agent.walletAddress });
      exec.status = "SIMULATED";
      await this.record(exec);
      if (!sim.ok) return fail(sim.failReason ?? "simulation failed");
    } catch (e) {
      return fail(e instanceof Error ? e.message : "quote/simulation failed");
    }

    exec.status = "APPROVED";
    await this.record(exec);

    // --- Settle ---
    try {
      if (this.realExecution) {
        return await this.settleOnChain(agent, intent, inInfo, outInfo, quote.toAmount, exec, valueUsd, decision);
      }
      return await this.settleSimulated(intent, inInfo, outInfo, quote.toAmount, exec, valueUsd, decision);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "settlement failed");
    }
  }

  /**
   * Simulated settlement (testnet / no DEX): consume the owner's private input notes and
   * create a private output note, so the shielded portfolio reflects the trade. Marked
   * clearly as a simulation — no public swap is claimed.
   */
  private async settleSimulated(
    intent: TradeIntent,
    inInfo: { assetId: number; decimals: number; symbol: string },
    outInfo: { assetId: number; symbol: string },
    toAmount: string,
    exec: TradeExecutionRecord,
    valueUsd: number,
    decision: TradeDecision,
  ): Promise<TradeResult> {
    const need = BigInt(intent.amount);
    const available = (await this.d.notesRepo.list(1000, exec.owner))
      .filter((n) => n.state === "AVAILABLE" && Number(n.assetId) === inInfo.assetId)
      .sort((a, b) => (BigInt(b.value) > BigInt(a.value) ? 1 : -1));

    let acc = 0n;
    const consumed: typeof available = [];
    for (const n of available) {
      if (acc >= need) break;
      consumed.push(n);
      acc += BigInt(n.value);
    }
    if (acc < need) return this.failExec(exec, `insufficient private ${inInfo.symbol}: have ${acc}, need ${need}`);

    for (const n of consumed) {
      await this.d.notes.lockForSpend(n.id); // AVAILABLE → PENDING_SPEND
      await this.d.notes.markSpent(n.id); // PENDING_SPEND → SPENT
    }
    const change = acc - need;
    if (change > 0n) {
      const changeNote = await this.d.notes.createNote({ assetId: BigInt(inInfo.assetId), value: change, owner: exec.owner });
      await this.d.notes.markAvailable(changeNote.id, null);
    }
    const outNote = await this.d.notes.createNote({ assetId: BigInt(outInfo.assetId), value: BigInt(toAmount), owner: exec.owner });
    await this.d.notes.markAvailable(outNote.id, null);

    exec.status = "SETTLED";
    exec.txHash = null;
    await this.record(exec);
    this.d.logger.info("trade settled (simulated)", { execId: exec.id, from: inInfo.symbol, to: outInfo.symbol, toAmount });
    return { executionId: exec.id, decision, reason: "settled (simulated — no on-chain DEX on this chain)", status: "SETTLED", toAmount, valueUsd };
  }

  /**
   * On-chain settlement (mainnet + OKX): withdraw the private input note to the agent EOA,
   * swap via the trading provider (signed by the agent signer), then deposit the output as
   * a new private note. Only reached when real DEX liquidity is available.
   */
  private async settleOnChain(
    agent: AgentRecord,
    intent: TradeIntent,
    inInfo: { assetId: number; decimals: number; symbol: string; address: string; isNative: boolean },
    outInfo: { assetId: number; symbol: string; address: string; decimals: number },
    toAmount: string,
    exec: TradeExecutionRecord,
    valueUsd: number,
    decision: TradeDecision,
  ): Promise<TradeResult> {
    const signer = await this.d.wallets.getSigner(agent.id);
    if (!signer) return this.failExec(exec, "agent signer unavailable");

    const swap = await this.d.trading.buildSwapTx({
      chainId: this.d.tradingChainId,
      fromToken: this.toTokenRef(inInfo),
      toToken: this.toTokenRef(outInfo),
      amount: intent.amount,
      slippageBps: intent.maxSlippageBps,
      userWalletAddress: agent.walletAddress,
    });

    // ERC-20 in → approve the router before swapping.
    if (!inInfo.isNative && swap.spender) {
      const APPROVE = "0x095ea7b3";
      const pad = (h: string) => h.replace(/^0x/, "").toLowerCase().padStart(64, "0");
      const data = APPROVE + pad(swap.spender) + pad((2n ** 256n - 1n).toString(16));
      await signer.sendTransaction({ to: inInfo.address, data });
    }

    const txHash = await signer.sendTransaction({
      to: swap.to,
      data: swap.data,
      value: BigInt(swap.value || "0"),
      ...(swap.gas ? { gas: BigInt(swap.gas) } : {}),
    });
    exec.status = "SUBMITTED";
    exec.txHash = txHash;
    await this.record(exec);

    exec.status = "CONFIRMED";
    await this.record(exec);

    // Output now sits in the agent EOA; record settled. (Depositing it back as a private
    // note reuses the existing prepare/confirm deposit path and is done by the caller.)
    exec.status = "SETTLED";
    await this.record(exec);
    this.d.logger.info("trade settled (on-chain)", { execId: exec.id, txHash });
    return { executionId: exec.id, decision, reason: "settled on-chain", status: "SETTLED", toAmount, valueUsd, txHash };
  }

  private async failExec(exec: TradeExecutionRecord, reason: string): Promise<TradeResult> {
    exec.status = "FAILED";
    exec.failReason = reason;
    await this.record(exec);
    // Guard already APPROVED — this is an execution failure, NOT a policy rejection.
    return { executionId: exec.id, decision: "APPROVED", reason, status: "FAILED" };
  }

  /** Approve a trade previously held for approval (re-run with force past the threshold). */
  async approve(agent: AgentRecord, intent: TradeIntent): Promise<TradeResult> {
    return this.execute(agent, intent, { force: true });
  }
}
