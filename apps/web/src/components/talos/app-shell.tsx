import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, Bot, LayoutDashboard, Menu, Shield, Wallet, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { useChainStatus } from "@/lib/talos/hooks";
import { CHAIN_ID, explorerAddressUrl } from "@/lib/talos/api";
import { truncateMiddle } from "@/lib/talos/format";
import { useWallet } from "@/lib/talos/wallet";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/actions", label: "Private Actions", icon: Shield, exact: false },
  { to: "/app/agent", label: "AI Agent", icon: Bot, exact: false },
  { to: "/app/activity", label: "Activity", icon: Activity, exact: false },
] as const;

function WalletButton() {
  const { address, connect, connecting, disconnect, error } = useWallet();

  if (address) {
    return (
      <div className="flex items-center gap-2">
        <span className="mono hidden items-center gap-2 rounded-full border border-primary/30 bg-primary-soft px-3 py-1.5 text-xs text-primary sm:inline-flex">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden />
          Connected {truncateMiddle(address, 6, 4)}
        </span>
        <a
          href={explorerAddressUrl(address)}
          target="_blank"
          rel="noreferrer noopener"
          className="hidden text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline md:inline"
        >
          View on X Layer Explorer
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
    <div className="flex items-center gap-2">
      {error ? <span className="hidden max-w-[220px] truncate text-xs text-muted-foreground lg:inline">{error}</span> : null}
      <button
        type="button"
        onClick={() => void connect()}
        disabled={connecting}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-60"
      >
        <Wallet className="size-3.5" />
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav aria-label="Talos sections" className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
              active
                ? "border border-primary/25 bg-primary-soft text-primary"
                : "border border-transparent text-muted-foreground hover:bg-surface hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const status = useChainStatus();
  const online = status.isSuccess;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            className="rounded-lg border border-border p-2 text-muted-foreground md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
          <Link to="/" className="mono text-sm font-semibold tracking-[0.28em] text-foreground">
            TALOS
          </Link>
          <span className="mono hidden items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[11px] text-muted-foreground sm:inline-flex">
            X Layer
            <span
              className={cn(
                "size-1.5 rounded-full",
                online ? "bg-primary" : status.isError ? "bg-destructive" : "bg-muted-foreground",
              )}
              aria-hidden
            />
            {online ? `#${status.data?.blockNumber}` : status.isError ? "offline" : "…"}
          </span>
          <span className="mono ml-auto hidden text-[11px] text-muted-foreground lg:inline">
            chain {CHAIN_ID}
          </span>
          <div className="ml-auto lg:ml-3">
            <WalletButton />
          </div>
        </div>
        {mobileOpen ? (
          <div className="border-t border-border bg-elevated px-4 py-3 md:hidden">
            <NavLinks onNavigate={() => setMobileOpen(false)} />
          </div>
        ) : null}
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8 sm:px-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <div className="sticky top-24">
            <NavLinks />
            <p className="mono mt-6 px-3 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Built on X Layer
            </p>
          </div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
