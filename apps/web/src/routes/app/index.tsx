import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Boxes,
  BrainCircuit,
  Coins,
  GitMerge,
  Send,
  ShieldCheck,
  Split,
  type LucideIcon,
} from "lucide-react";

import {
  useChainStatus,
  useGuardIdentity,
  useOperationList,
  usePrivateBalance,
  useTrackedOperations,
} from "@/lib/talos/hooks";
import { formatTime } from "@/lib/talos/format";
import { assetById, formatAssetAmount, shieldedBalances, useAssets } from "@/lib/talos/assets";
import { AssetLogo } from "@/components/talos/asset-logo";
import {
  EmptyState,
  ErrorState,
  HashChip,
  SectionLabel,
  StatusPill,
} from "@/components/talos/primitives";
import { GlassCard, PageHeader } from "@/components/talos/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="relative space-y-6">
      <div aria-hidden className="aurora aurora-a pointer-events-none absolute -top-28 left-0 h-72 w-72" />
      <PageHeader
        title="Dashboard"
        description="Your private balance on X Layer — shielded notes, not public balances."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <BalanceCard />
        <div className="space-y-6">
          <NetworkCard />
          <GuardCard />
        </div>
      </div>

      <QuickActions />

      <div className="grid gap-6 lg:grid-cols-2">
        <NotesCard />
        <ActivityCard />
      </div>
    </div>
  );
}

function BalanceCard() {
  const { available, noteCount, isLoading, isError, error, refetch } = usePrivateBalance();
  const { assets } = useAssets();
  const balances = shieldedBalances(available, assets);

  return (
    <GlassCard glow className="relative overflow-hidden lg:col-span-2">
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-primary/15 blur-3xl" />
      <SectionLabel>Private balance</SectionLabel>
      {isError ? (
        <div className="mt-4">
          <ErrorState message={String(error)} onRetry={() => void refetch()} />
        </div>
      ) : (
        <>
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Boxes className="size-4 text-primary" />
            {noteCount} shielded {noteCount === 1 ? "note" : "notes"} across {balances.length || 0}{" "}
            {balances.length === 1 ? "asset" : "assets"}
          </p>

          <div className="mt-4 space-y-2">
            {isLoading ? (
              <span className="text-4xl font-semibold tracking-tight text-muted-foreground">—</span>
            ) : balances.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No shielded balance yet. Shield an asset to create your first private note.
              </p>
            ) : (
              balances.map(({ asset, total, count }) => (
                <div
                  key={asset.assetId}
                  className="glass-2 flex items-center justify-between rounded-xl px-3.5 py-3"
                >
                  <div className="flex items-center gap-3">
                    <AssetLogo asset={asset} size={34} />
                    <div>
                      <p className="text-sm font-semibold text-foreground">{asset.symbol}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {count} {count === 1 ? "note" : "notes"}
                      </p>
                    </div>
                  </div>
                  <span className="text-2xl font-semibold tracking-tight text-foreground">
                    {formatAssetAmount(total, asset)}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              to="/app/shield"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-strong"
            >
              <Coins className="size-4" /> Shield assets
            </Link>
            <Link
              to="/app/agent"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface/60 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <BrainCircuit className="size-4" /> Ask the agent
            </Link>
          </div>
        </>
      )}
    </GlassCard>
  );
}

function NetworkCard() {
  const status = useChainStatus();
  const rows: [string, string][] = [
    ["Block", status.data ? `#${status.data.blockNumber}` : "…"],
    ["Merkle depth", status.data ? String(status.data.merkleDepth) : "…"],
    ["Leaves", status.data ? String(status.data.nextLeafIndex) : "…"],
    ["Chain", status.data ? String(status.data.chainId) : "…"],
  ];
  return (
    <GlassCard>
      <div className="flex items-center justify-between">
        <SectionLabel>X Layer</SectionLabel>
        <span
          className={cn(
            "size-2 rounded-full",
            status.isSuccess ? "bg-primary" : status.isError ? "bg-destructive" : "bg-muted-foreground",
          )}
        />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] text-muted-foreground">{k}</dt>
            <dd className="mono text-sm text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </GlassCard>
  );
}

function GuardCard() {
  const { data, isError } = useGuardIdentity();
  return (
    <GlassCard>
      <SectionLabel>Talos Guard</SectionLabel>
      <div className="mt-3 flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl border border-primary/25 bg-primary-soft text-primary">
          <ShieldCheck className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{data?.agentName ?? "Talos Agent"}</p>
          <p className="mono text-[11px] text-muted-foreground">{isError ? "policy engine" : (data?.policyId ?? "…")}</p>
        </div>
        <StatusPill
          className="ml-auto"
          status={isError ? "CREATED" : "APPROVED"}
          label={isError ? "offline" : "active"}
        />
      </div>
    </GlassCard>
  );
}

const ACTIONS: { to: string; label: string; icon: LucideIcon; sub: string }[] = [
  { to: "/app/shield", label: "Shield", icon: Coins, sub: "Assets → note" },
  { to: "/app/split", label: "Split", icon: Split, sub: "1 note → 2" },
  { to: "/app/merge", label: "Merge", icon: GitMerge, sub: "2 notes → 1" },
  { to: "/app/transfer", label: "Transfer", icon: Send, sub: "Private send" },
  { to: "/app/withdraw", label: "Withdraw", icon: ArrowUpRight, sub: "Note → public" },
];

function QuickActions() {
  return (
    <div>
      <SectionLabel>Private operations</SectionLabel>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {ACTIONS.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="glass card-hi group rounded-2xl p-4 transition-all hover:-translate-y-1 hover:border-primary/30"
          >
            <span className="grid size-10 place-items-center rounded-xl border border-border bg-background/50 text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:bg-primary-soft group-hover:text-primary">
              <a.icon className="size-4.5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-foreground">{a.label}</p>
            <p className="mono text-[11px] text-muted-foreground">{a.sub}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function NotesCard() {
  const { available, isLoading, isError, error, refetch } = usePrivateBalance();
  const { assets } = useAssets();
  return (
    <GlassCard>
      <SectionLabel>Private notes</SectionLabel>
      <div className="mt-4">
        {isError ? (
          <ErrorState message={String(error)} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading notes…</p>
        ) : available.length === 0 ? (
          <EmptyState title="No private notes yet" description="Shield your first asset to start using Talos." />
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {available.map((n) => {
              const asset = assetById(assets, n.assetId);
              return (
              <div key={n.id} className="glass-2 rounded-xl px-3.5 py-3">
                <div className="flex items-baseline justify-between">
                  <span className="flex items-baseline gap-1.5 text-lg font-semibold text-foreground">
                    <AssetLogo asset={asset} size={18} className="self-center" />
                    {formatAssetAmount(n.value, asset)}
                    <span className="mono text-[11px] text-muted-foreground">{asset.symbol}</span>
                  </span>
                  <StatusPill status="AVAILABLE" label="available" />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="mono text-[11px] text-muted-foreground">
                    {n.leafIndex !== null ? `leaf #${n.leafIndex}` : "pending"}
                  </span>
                  <HashChip value={n.commitment} head={6} tail={4} />
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </GlassCard>
  );
}

function ActivityCard() {
  const { ids } = useTrackedOperations();
  const { data } = useOperationList(ids);
  const recent = (data ?? []).slice(0, 5);

  return (
    <GlassCard>
      <div className="flex items-center justify-between">
        <SectionLabel>Recent activity</SectionLabel>
        <Link to="/app/activity" className="text-xs text-muted-foreground hover:text-primary">
          View all →
        </Link>
      </div>
      <div className="mt-4">
        {recent.length === 0 ? (
          <EmptyState title="No activity yet" description="Your operations will appear here as you use Talos." />
        ) : (
          <ul className="space-y-2">
            {recent.map((op) => (
              <li key={op.operationId}>
                <Link
                  to="/app/activity/$operationId"
                  params={{ operationId: op.operationId }}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/40 px-3.5 py-2.5 transition-colors hover:border-primary/25"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {op.type[0] + op.type.slice(1).toLowerCase()}
                    </p>
                    <p className="mono truncate text-[11px] text-muted-foreground">{formatTime(op.updatedAt)}</p>
                  </div>
                  <StatusPill status={op.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </GlassCard>
  );
}
