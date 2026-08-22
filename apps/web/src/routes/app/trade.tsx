import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BrainCircuit,
  Check,
  CheckCircle2,
  CornerDownLeft,
  Cpu,
  Loader2,
  PieChart,
  ShieldCheck,
  TrendingUp,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { talosApi, errorMessage } from "@/lib/talos/api";
import { useWallet } from "@/lib/talos/wallet";
import { formatTime } from "@/lib/talos/format";
import type { OrchestrationResult, TradeRecommendation } from "@/lib/talos/types";
import { SectionLabel, StatusPill } from "@/components/talos/primitives";
import { GlassCard, PageHeader, TextInput } from "@/components/talos/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/trade")({ component: TradePage });

const SUGGESTIONS = [
  "Buy 50 USDC worth of OKB",
  "Research OKB",
  "Keep my portfolio at 70% stablecoins and 30% OKB",
];

type Turn = { role: "user"; text: string } | { role: "result"; data: OrchestrationResult } | { role: "error"; text: string };

function TradePage() {
  const { address } = useWallet();
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [showAllTrades, setShowAllTrades] = useState(false);
  const queryClient = useQueryClient();

  const trades = useQuery({
    queryKey: ["talos", "trades", address],
    queryFn: () => talosApi.trades(address!),
    enabled: Boolean(address),
    refetchInterval: 8000,
  });

  const run = useMutation({
    mutationFn: (message: string) => talosApi.orchestrate({ owner: address!, message }),
    onSuccess: (data) => {
      setTurns((t) => [...t, { role: "result", data }]);
      void queryClient.invalidateQueries({ queryKey: ["talos", "trades", address] });
      void queryClient.invalidateQueries({ queryKey: ["talos", "portfolio", address] });
      void queryClient.invalidateQueries({ queryKey: ["talos", "notes"] });
    },
    onError: (e) => setTurns((t) => [...t, { role: "error", text: errorMessage(e) }]),
  });

  const send = (text: string) => {
    const message = text.trim();
    if (!message || !address || run.isPending) return;
    setTurns((t) => [...t, { role: "user", text: message }]);
    setInput("");
    run.mutate(message);
  };

  const lastResult = [...turns]
    .reverse()
    .find((t): t is Extract<Turn, { role: "result" }> => t.role === "result")?.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Trading"
        description="Speak your intent. The agents research, decide, and trade publicly on X Layer within your Guard limits — and profits can be moved to your wallet privately."
        actions={
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary-soft px-3 py-1.5 text-xs text-primary">
            <span className="size-1.5 rounded-full bg-primary dot-pulse" /> Guard active
          </span>
        }
      />

      {!address ? (
        <GlassCard>
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <TrendingUp className="size-6 text-primary" />
            <p className="text-sm font-medium text-foreground">Connect your wallet to trade</p>
            <p className="text-sm text-muted-foreground">The agents act for your connected address only.</p>
          </div>
        </GlassCard>
      ) : (
        <>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Terminal */}
          <div className="lg:col-span-2">
            <GlassCard className="flex h-[62vh] min-h-[420px] flex-col p-0">
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                {turns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
                    <span className="grid size-12 place-items-center rounded-2xl border border-primary/25 bg-primary-soft text-primary">
                      <BrainCircuit className="size-6" />
                    </span>
                    <p className="text-sm text-muted-foreground">Give Talos a trading intent.</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => send(s)}
                          className="rounded-full border border-border bg-surface/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  turns.map((t, i) => <TurnView key={i} turn={t} address={address} onDone={() => trades.refetch()} />)
                )}
                {run.isPending ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Agents are researching, checking policy, and executing…
                  </p>
                ) : null}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
                className="flex items-center gap-2 border-t border-border p-3"
              >
                <TextInput
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Buy 50 USDC worth of OKB…"
                  className="flex-1"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || run.isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-strong disabled:opacity-50"
                >
                  Execute <CornerDownLeft className="size-4" />
                </button>
              </form>
            </GlassCard>
          </div>

          {/* Recent trades */}
          {(() => {
            const all = trades.data?.trades ?? [];
            const shown = showAllTrades ? all.slice(0, 20) : all.slice(0, 3);
            return (
              <GlassCard className="h-fit">
                <div className="flex items-center justify-between">
                  <SectionLabel>Recent trades</SectionLabel>
                  {all.length > 0 ? <span className="text-[11px] text-muted-foreground">{all.length}</span> : null}
                </div>
                <div className="mt-4 space-y-2">
                  {all.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No trades yet.</p>
                  ) : (
                    shown.map((t) => (
                      <div key={t.id} className="glass-2 flex items-center justify-between gap-2 rounded-xl px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="mono truncate text-xs text-foreground">
                            {t.provider === "mock" ? "Test Trade" : t.provider.toUpperCase()}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            ${Number(t.valueUsd).toFixed(2)} · {formatTime(t.createdAt)}
                          </p>
                        </div>
                        <StatusPill status={t.status} label={t.status.toLowerCase()} />
                      </div>
                    ))
                  )}
                </div>
                {all.length > 3 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllTrades((v) => !v)}
                    className="mt-3 w-full rounded-lg border border-border bg-surface/50 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    {showAllTrades ? "Show less" : `Show ${all.length - 3} more`}
                  </button>
                ) : null}
              </GlassCard>
            );
          })()}
        </div>

        <AgentPipeline pending={run.isPending} result={lastResult} />
        </>
      )}
    </div>
  );
}

/* ----------------------- Agent coordination pipeline ----------------------- */

type StageState = "idle" | "active" | "done" | "blocked";

const STAGES: { key: string; label: string; sub: string; icon: LucideIcon }[] = [
  { key: "orchestrator", label: "Trading Agent", sub: "Orchestrating", icon: Cpu },
  { key: "research", label: "Research Agent", sub: "Market intel", icon: BrainCircuit },
  { key: "portfolio", label: "Portfolio Agent", sub: "Allocation & risk", icon: PieChart },
  { key: "guard", label: "Talos Guard", sub: "Policy check", icon: ShieldCheck },
  { key: "execution", label: "Execution", sub: "X Layer", icon: Zap },
];

function stageStates(result: OrchestrationResult | undefined): Record<string, StageState> {
  if (!result) return Object.fromEntries(STAGES.map((s) => [s.key, "idle"]));
  const trade = result.trade;
  const guard: StageState = trade
    ? trade.decision === "REJECTED"
      ? "blocked"
      : "done"
    : "idle";
  const execution: StageState = trade
    ? trade.status === "SETTLED"
      ? "done"
      : trade.status === "FAILED"
        ? "blocked"
        : "active"
    : "idle";
  return {
    orchestrator: "done",
    research: result.research ? "done" : "idle",
    portfolio: result.snapshot || result.rebalance ? "done" : trade ? "done" : "idle",
    guard,
    execution,
  };
}

function AgentPipeline({ pending, result }: { pending: boolean; result: OrchestrationResult | undefined }) {
  const states = stageStates(result);

  const toneFor = (state: StageState) =>
    state === "done"
      ? "border-primary/40 bg-primary-soft text-primary"
      : state === "blocked"
        ? "border-destructive/40 bg-destructive/5 text-destructive"
        : state === "active"
          ? "border-amber-500/40 bg-amber-500/5 text-amber-500"
          : "border-border bg-surface/50 text-muted-foreground";

  return (
    <GlassCard>
      <div className="flex items-center justify-between">
        <SectionLabel>Agent coordination</SectionLabel>
        <span className="text-[11px] text-muted-foreground">
          {pending ? "Coordinating…" : result ? "Last run" : "Idle — send an intent above"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STAGES.map((stage, i) => {
          const Icon = stage.icon;
          const state = pending ? "active" : states[stage.key]!;
          const active = pending || state === "done" || state === "active" || state === "blocked";
          return (
            <div key={stage.key} className="relative">
              {/* connector to next stage */}
              {i < STAGES.length - 1 ? (
                <div className="pointer-events-none absolute right-[-10px] top-9 hidden h-px w-5 overflow-hidden bg-border lg:block">
                  {pending ? (
                    <motion.div
                      className="h-full w-2 bg-primary"
                      animate={{ x: [-8, 20] }}
                      transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
                    />
                  ) : null}
                </div>
              ) : null}

              <motion.div
                initial={false}
                animate={
                  pending
                    ? { opacity: [0.55, 1, 0.55], scale: [1, 1.02, 1] }
                    : { opacity: active ? 1 : 0.7, scale: 1 }
                }
                transition={pending ? { duration: 1.1, repeat: Infinity, delay: i * 0.18 } : { duration: 0.3 }}
                className={cn("rounded-xl border p-3 transition-colors", toneFor(state))}
              >
                <div className="flex items-center justify-between">
                  <Icon className="size-4" />
                  <StageBadge pending={pending} state={state} />
                </div>
                <p className="mt-2 text-xs font-semibold text-foreground">{stage.label}</p>
                <p className="text-[10px] text-muted-foreground">{stageDetail(stage.key, state, result) ?? stage.sub}</p>
              </motion.div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

function StageBadge({ pending, state }: { pending: boolean; state: StageState }) {
  if (pending) return <Loader2 className="size-3.5 animate-spin text-primary" />;
  if (state === "done") return <Check className="size-3.5 text-primary" />;
  if (state === "blocked") return <XCircle className="size-3.5 text-destructive" />;
  if (state === "active") return <Loader2 className="size-3.5 animate-spin text-amber-500" />;
  return <span className="size-1.5 rounded-full bg-muted-foreground/40" />;
}

function stageDetail(key: string, state: StageState, result: OrchestrationResult | undefined): string | null {
  if (!result || state === "idle") return null;
  if (key === "research" && result.research) return `${result.research.recommendation} · ${(result.research.confidence * 100).toFixed(0)}%`;
  if (key === "guard" && result.trade) return result.trade.decision;
  if (key === "execution" && result.trade) return result.trade.status;
  return null;
}

const REC_TONE: Record<TradeRecommendation, string> = {
  BUY: "text-primary border-primary/30 bg-primary-soft",
  SELL: "text-destructive border-destructive/30 bg-destructive/5",
  HOLD: "text-muted-foreground border-border bg-surface/60",
};

function TurnView({ turn, address, onDone }: { turn: Turn; address: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const approve = useMutation({
    mutationFn: (id: string) => talosApi.approveTrade(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["talos", "trades", address] });
      onDone();
    },
  });

  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm border border-border bg-surface-2 px-4 py-2.5 text-sm text-foreground">
          {turn.text}
        </div>
      </div>
    );
  }
  if (turn.role === "error") {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3">
        <p className="mono text-xs text-destructive">{turn.text}</p>
      </div>
    );
  }

  const { reply, research, trade } = turn.data;

  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary-soft text-primary">
        <BrainCircuit className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="rounded-2xl rounded-tl-sm border border-border bg-background/50 px-4 py-2.5">
          <p className="text-sm text-foreground">{reply}</p>
        </div>

        {research ? (
          <div className="rounded-xl border border-border bg-surface/50 p-3.5">
            <div className="flex items-center justify-between">
              <SectionLabel>Research · {research.asset}</SectionLabel>
              <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold", REC_TONE[research.recommendation])}>
                {research.recommendation} · {(research.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{research.rationale}</p>
            <p className="mono mt-1.5 text-[11px] text-muted-foreground">
              {research.priceUsd ? `≈ $${research.priceUsd}` : ""} · {research.source}
            </p>
          </div>
        ) : null}

        {trade ? (
          (() => {
            const rejected = trade.decision === "REJECTED";
            const needsApproval = trade.decision === "APPROVAL_REQUIRED";
            const failed = !rejected && !needsApproval && trade.status === "FAILED";
            const settled = trade.status === "SETTLED";
            const tone = rejected || failed
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : needsApproval
                ? "border-amber-500/30 bg-amber-500/5 text-amber-500"
                : "border-primary/30 bg-primary-soft text-primary";
            const title = rejected
              ? "Talos Guard blocked this trade"
              : needsApproval
                ? "Approval required by Talos Guard"
                : failed
                  ? "Guard approved — execution failed"
                  : settled
                    ? "Guard approved — trade executed"
                    : `Guard approved — ${trade.status.toLowerCase()}`;
            const IconEl = rejected || failed ? XCircle : needsApproval ? ShieldCheck : CheckCircle2;
            return (
          <div className={cn("flex items-start gap-2 rounded-xl border px-3.5 py-3 text-xs", tone)}>
            <IconEl className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{title}</p>
              <p className="mt-0.5 text-muted-foreground">{trade.reason}</p>
              {trade.decision === "APPROVAL_REQUIRED" ? (
                <button
                  type="button"
                  onClick={() => approve.mutate(trade.executionId)}
                  disabled={approve.isPending}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary-strong disabled:opacity-50"
                >
                  {approve.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
                  Approve &amp; continue <ArrowRight className="size-3" />
                </button>
              ) : null}
            </div>
          </div>
            );
          })()
        ) : null}
      </div>
    </div>
  );
}
