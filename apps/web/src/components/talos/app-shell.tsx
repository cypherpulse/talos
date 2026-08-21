import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  ArrowUpRight,
  BrainCircuit,
  Coins,
  GitMerge,
  LayoutDashboard,
  Menu,
  Send,
  ShieldCheck,
  Split,
  Wallet,
  X,
} from "lucide-react";
import { useState, type ComponentType, type ReactNode } from "react";

import { useChainStatus, useGuardIdentity } from "@/lib/talos/hooks";
import { CHAIN_ID, explorerAddressUrl } from "@/lib/talos/api";
import { truncateMiddle } from "@/lib/talos/format";
import { useWallet } from "@/lib/talos/wallet";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: ComponentType<{ className?: string }>; exact: boolean };
const NAV_GROUPS: { label?: string; items: NavItem[] }[] = [
  { items: [{ to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true }] },
  {
    label: "Operations",
    items: [
      { to: "/app/shield", label: "Shield", icon: Coins, exact: false },
      { to: "/app/split", label: "Split", icon: Split, exact: false },
      { to: "/app/merge", label: "Merge", icon: GitMerge, exact: false },
      { to: "/app/transfer", label: "Transfer", icon: Send, exact: false },
      { to: "/app/withdraw", label: "Withdraw", icon: ArrowUpRight, exact: false },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { to: "/app/agent", label: "AI Agent", icon: BrainCircuit, exact: false },
      { to: "/app/activity", label: "Activity", icon: Activity, exact: false },
    ],
  },
];

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
        <ShieldCheck className="size-4.5 text-primary" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="mono text-sm font-semibold tracking-[0.24em] text-foreground">TALOS</span>
        <span className="mt-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Private execution
        </span>
      </span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav aria-label="Talos sections" className="flex flex-col gap-5">
      {NAV_GROUPS.map((group, gi) => (
        <div key={gi} className="flex flex-col gap-1">
          {group.label ? (
            <p className="mono mb-1 px-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
              {group.label}
            </p>
          ) : null}
          {group.items.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all",
                  active
                    ? "bg-primary-soft text-primary"
                    : "text-muted-foreground hover:bg-surface/70 hover:text-foreground",
                )}
              >
                {active ? (
                  <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary shadow-[0_0_12px_rgba(164,249,29,0.6)]" />
                ) : null}
                <Icon
                  className={cn(
                    "size-[18px] shrink-0 transition-colors",
                    active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function StatusWidget() {
  const status = useChainStatus();
  const guard = useGuardIdentity();
  const online = status.isSuccess;
  return (
    <div className="glass-2 space-y-2.5 rounded-xl p-3.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">X Layer</span>
        <span className="mono inline-flex items-center gap-1.5 text-foreground">
          <span
            className={cn(
              "size-1.5 rounded-full",
              online ? "bg-primary" : status.isError ? "bg-destructive" : "bg-muted-foreground",
            )}
          />
          {online ? `#${status.data?.blockNumber}` : status.isError ? "offline" : "…"}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Talos Guard</span>
        <span className="mono inline-flex items-center gap-1.5 text-primary">
          <span className="size-1.5 rounded-full bg-primary dot-pulse" />
          {guard.isError ? "offline" : "active"}
        </span>
      </div>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  return (
    <div className="flex h-full flex-col gap-6 p-5">
      <Brand />
      <div className="flex-1 overflow-y-auto">
        <NavLinks onNavigate={onNavigate} />
      </div>
      <div className="space-y-3">
        <StatusWidget />
        <p className="mono px-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Built on X Layer · chain {CHAIN_ID}
        </p>
      </div>
    </div>
  );
}

function WalletButton() {
  const { address, connect, connecting, disconnect } = useWallet();

  if (address) {
    return (
      <div className="flex items-center gap-2">
        <a
          href={explorerAddressUrl(address)}
          target="_blank"
          rel="noreferrer noopener"
          className="mono inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-soft px-3 py-1.5 text-xs text-primary transition-colors hover:border-primary/50"
        >
          <span className="size-1.5 rounded-full bg-primary" aria-hidden />
          {truncateMiddle(address, 6, 4)}
        </a>
        <button
          type="button"
          onClick={disconnect}
          className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void connect()}
      disabled={connecting}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-60"
    >
      <Wallet className="size-3.5" />
      {connecting ? "Connecting…" : "Connect wallet"}
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* fixed desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-border bg-elevated/70 backdrop-blur-xl lg:block">
        <Sidebar />
      </aside>

      {/* mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[264px] border-r border-border bg-elevated">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-20 border-b border-border bg-background/70 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              className="rounded-lg border border-border p-2 text-muted-foreground lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-4" />
            </button>
            <Link to="/" className="mono text-sm font-semibold tracking-[0.24em] text-foreground lg:hidden">
              TALOS
            </Link>
            <span className="mono ml-auto hidden items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] text-muted-foreground sm:inline-flex">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden />
              X Layer testnet
            </span>
            <div className="ml-auto sm:ml-0">
              <WalletButton />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>

      {/* mobile menu close button when open */}
      {mobileOpen ? (
        <button
          type="button"
          className="fixed right-4 top-4 z-[60] rounded-lg border border-border bg-surface p-2 text-foreground lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
