import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BrainCircuit,
  Check,
  Copy,
  Cpu,
  KeyRound,
  PieChart,
  Plus,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useState } from "react";

import { talosApi, explorerAddressUrl } from "@/lib/talos/api";
import { useWallet } from "@/lib/talos/wallet";
import { encodePub } from "@/lib/talos/keys";
import { formatTime, truncateMiddle } from "@/lib/talos/format";
import type { Agent, AgentMemory } from "@/lib/talos/types";
import { EmptyState, SectionLabel } from "@/components/talos/primitives";
import { GlassCard, PageHeader } from "@/components/talos/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/agents")({ component: AgentsPage });

function AgentsPage() {
  const { address } = useWallet();
  const queryClient = useQueryClient();

  const agents = useQuery({
    queryKey: ["talos", "agents", address],
    queryFn: () => talosApi.agents(address!),
    enabled: Boolean(address),
  });
  const create = useMutation({
    mutationFn: () => talosApi.createAgentWallet({ owner: address!, role: "TRADER" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["talos", "agents", address] }),
  });

  if (!address) {
    return (
      <div className="space-y-6">
        <PageHeader title="Agents" description="Your AI agents — the Trading Agent executes; Research and Portfolio advise." />
        <GlassCard>
          <EmptyState title="Connect your wallet" description="Connect to activate your agents." />
        </GlassCard>
      </div>
    );
  }

  const trader = (agents.data?.agents ?? []).find((a) => a.role === "TRADER") ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agents"
        description="The Trading Agent owns the execution wallet and coordinates the read-only Research and Portfolio agents. No agent can bypass Talos Guard."
      />

      <div className="rounded-xl border border-primary/20 bg-primary-soft/50 px-4 py-3 text-sm text-primary">
        <ShieldCheck className="mr-2 inline size-4" />
        Your AI agents can reason and act, but they cannot bypass Talos Guard — and the Trading Agent's private key is never exposed to the AI model.
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <CognitiveCard
          icon={BrainCircuit}
          title="Research Agent"
          subtitle="Market Intelligence"
          blurb="Analyzes markets, assets, liquidity and opportunities."
          badge="READ ONLY"
          status="Online"
          tags={["Markets", "Liquidity", "Opportunities"]}
        />
        <CognitiveCard
          icon={PieChart}
          title="Portfolio Agent"
          subtitle="Portfolio Intelligence"
          blurb="Monitors your private portfolio, allocation and risk."
          badge="READ + DECISION"
          status="Monitoring"
          tags={["Allocation", "Risk", "Rebalancing"]}
        />
        <TradingCard trader={trader} onCreate={() => create.mutate()} creating={create.isPending} />
      </div>

      {trader ? <MemorySection owner={address} /> : null}
    </div>
  );
}

function CognitiveCard({
  icon: Icon,
  title,
  subtitle,
  blurb,
  badge,
  status,
  tags,
}: {
  icon: typeof BrainCircuit;
  title: string;
  subtitle: string;
  blurb: string;
  badge: string;
  status: string;
  tags: string[];
}) {
  return (
    <GlassCard className="flex flex-col">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl border border-border bg-surface/60 text-muted-foreground">
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{blurb}</p>
      <div className="mt-3 flex items-center gap-2">
        <span className="rounded-full border border-border bg-surface/60 px-2.5 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          {badge}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-primary">
          <span className="size-1.5 rounded-full bg-primary dot-pulse" /> {status}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span key={t} className="rounded-md bg-surface/60 px-2 py-1 text-[10px] text-muted-foreground">
            {t}
          </span>
        ))}
      </div>
    </GlassCard>
  );
}

const GUARD_LIMITS: [string, string][] = [
  ["Max trade", "$10,000"],
  ["Daily limit", "$50,000"],
  ["Max slippage", "3%"],
  ["Approve above", "$2,000"],
];
const GUARD_META: [string, string][] = [
  ["Allowed assets", "USDC · USDT · USDG · OKB"],
  ["Provider", "OKX"],
];

function TradingCard({ trader, onCreate, creating }: { trader: Agent | null; onCreate: () => void; creating: boolean }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (k: string, v: string) => {
    void navigator.clipboard?.writeText(v);
    setCopied(k);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <GlassCard glow className="flex flex-col border-primary/25">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl border border-primary/30 bg-primary-soft text-primary">
          <TrendingUp className="size-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">Trading Agent</p>
          <p className="text-[11px] text-muted-foreground">Autonomous Execution</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Researches with the other agents, plans execution, and trades on X Layer within your Guard limits.
      </p>

      {!trader ? (
        <button
          type="button"
          onClick={onCreate}
          disabled={creating}
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-strong disabled:opacity-50"
        >
          <Plus className="size-4" /> {creating ? "Creating…" : "Create execution wallet"}
        </button>
      ) : (
        <div className="mt-4 space-y-4">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary-soft px-2.5 py-1 text-[11px] font-medium text-primary">
            <span className="size-1.5 rounded-full bg-primary dot-pulse" /> {trader.status}
          </span>

          {/* Credentials */}
          <div className="space-y-2">
            <CredentialRow
              icon={Wallet}
              label="Execution wallet"
              hint="fund this"
              value={truncateMiddle(trader.walletAddress, 8, 6)}
              href={explorerAddressUrl(trader.walletAddress)}
              copied={copied === "w"}
              onCopy={() => copy("w", trader.walletAddress)}
            />
            <CredentialRow
              icon={KeyRound}
              label="Receive identity"
              hint="share"
              value={truncateMiddle(encodePub(trader.talosPublicKey), 8, 6)}
              copied={copied === "t"}
              onCopy={() => copy("t", encodePub(trader.talosPublicKey))}
            />
          </div>

          {/* Guard limits */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <ShieldCheck className="size-3.5 text-primary" /> Guard limits
            </p>
            <div className="grid grid-cols-2 gap-2">
              {GUARD_LIMITS.map(([k, v]) => (
                <div key={k} className="rounded-xl border border-border bg-surface/40 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">{k}</p>
                  <p className="mono mt-0.5 text-sm font-semibold text-foreground">{v}</p>
                </div>
              ))}
            </div>
            <div className="mt-2 space-y-1.5">
              {GUARD_META.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between rounded-xl border border-border bg-surface/40 px-3 py-2">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</span>
                  <span className="mono text-xs font-medium text-foreground">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  );
}

function CredentialRow({
  icon: Icon,
  label,
  hint,
  value,
  href,
  copied,
  onCopy,
}: {
  icon: typeof Wallet;
  label: string;
  hint: string;
  value: string;
  href?: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface/40 px-3 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-background/50 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
          <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[9px] normal-case text-primary">{hint}</span>
        </p>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="mono block truncate text-sm text-foreground hover:text-primary">
            {value}
          </a>
        ) : (
          <span className="mono block truncate text-sm text-foreground">{value}</span>
        )}
      </div>
      <button type="button" onClick={onCopy} className="shrink-0 text-muted-foreground hover:text-primary" aria-label="Copy">
        {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

const MEM_TONE: Record<string, string> = {
  SEMANTIC: "border-primary/30 bg-primary-soft text-primary",
  EPISODIC: "border-border bg-surface/60 text-muted-foreground",
  WORKING: "border-amber-500/30 bg-amber-500/5 text-amber-500",
};

function MemorySection({ owner }: { owner: string }) {
  const queryClient = useQueryClient();
  const mem = useQuery({
    queryKey: ["talos", "memory", owner],
    queryFn: () => talosApi.agentMemory(owner),
    refetchInterval: 12_000,
  });
  const forget = useMutation({
    mutationFn: (id: string) => talosApi.forgetMemory(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["talos", "memory", owner] }),
  });
  const clear = useMutation({
    mutationFn: () => talosApi.clearMemory(owner),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["talos", "memory", owner] }),
  });

  const memories: AgentMemory[] = mem.data?.memories ?? [];

  return (
    <GlassCard>
      <div className="flex items-center justify-between">
        <SectionLabel>
          <span className="inline-flex items-center gap-1.5">
            <Cpu className="size-3.5" /> Agent memory · {mem.data?.count ?? 0}
          </span>
        </SectionLabel>
        {memories.length > 0 ? (
          <button type="button" onClick={() => clear.mutate()} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive">
            <Trash2 className="size-3.5" /> Clear all
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        The agents remember preferences and past decisions to inform future trades. Secrets are never stored here.
      </p>
      <div className="mt-4">
        {memories.length === 0 ? (
          <p className="text-sm text-muted-foreground">No memories yet — set a portfolio target or run a trade to build memory.</p>
        ) : (
          <div className="space-y-2">
            {memories.map((m) => (
              <div key={m.id} className="glass-2 flex items-start justify-between gap-3 rounded-xl px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{m.content}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide", MEM_TONE[m.memoryType] ?? MEM_TONE["EPISODIC"])}>
                      {m.memoryType.toLowerCase()}
                    </span>
                    <span className="mono text-[10px] text-muted-foreground">{formatTime(m.createdAt)}</span>
                  </div>
                </div>
                <button type="button" onClick={() => forget.mutate(m.id)} className="shrink-0 text-muted-foreground hover:text-destructive" aria-label="Forget">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
