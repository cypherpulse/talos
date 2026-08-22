import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, Eye, EyeOff, KeyRound, RefreshCw, ShieldAlert, Wallet } from "lucide-react";
import { useState } from "react";

import { talosApi, explorerAddressUrl } from "@/lib/talos/api";
import { useWallet } from "@/lib/talos/wallet";
import {
  clearIdentity,
  encodePub,
  encodeSec,
  loadIdentity,
  saveIdentity,
  type TalosIdentity,
} from "@/lib/talos/keys";
import { truncateMiddle } from "@/lib/talos/format";
import { SectionLabel } from "@/components/talos/primitives";
import { GlassCard, PageHeader } from "@/components/talos/ui";

export const Route = createFileRoute("/app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { address } = useWallet();
  const [identity, setIdentity] = useState<TalosIdentity | null>(() => loadIdentity());
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    try {
      const keys = await talosApi.generateKey();
      saveIdentity(keys);
      setIdentity(keys);
      setReveal(false);
    } catch {
      /* retryable */
    } finally {
      setBusy(false);
    }
  };

  const regenerate = () => {
    if (!confirm("Generate a new identity? Your current key will be replaced — notes sent to the old key can only be spent with the old spending key.")) return;
    clearIdentity();
    setIdentity(null);
    void generate();
  };

  const copy = (label: string, value: string) => {
    void navigator.clipboard?.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const pub = identity ? encodePub(identity.ownerPublicKey) : "";
  const sec = identity ? encodeSec(identity.spendingKey) : "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile"
        description="Your Talos identity. Share your public key so others can send you private transfers; keep your spending key secret."
      />

      <div className="mx-auto max-w-2xl space-y-6">
        {/* Connected wallet */}
        <GlassCard>
          <SectionLabel>Connected wallet</SectionLabel>
          {address ? (
            <a
              href={explorerAddressUrl(address)}
              target="_blank"
              rel="noreferrer"
              className="mono mt-3 inline-flex items-center gap-2 text-sm text-foreground hover:text-primary"
            >
              <Wallet className="size-4 text-primary" />
              {truncateMiddle(address, 10, 8)}
            </a>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No wallet connected. Connect one (top-right) to shield and manage private notes.
            </p>
          )}
        </GlassCard>

        {/* Talos identity */}
        <GlassCard glow>
          <div className="flex items-center justify-between">
            <SectionLabel>Talos receive identity</SectionLabel>
            {identity ? (
              <button
                type="button"
                onClick={regenerate}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
              >
                <RefreshCw className="size-3.5" /> Regenerate
              </button>
            ) : null}
          </div>

          {!identity ? (
            <div className="mt-4 flex flex-col items-start gap-4">
              <p className="text-sm text-muted-foreground">
                Generate a Talos keypair to receive private transfers. Your{" "}
                <span className="text-foreground">public key</span> (starts with{" "}
                <code className="mono text-primary">tpub</code>) is safe to share; your{" "}
                <span className="text-foreground">spending key</span> (
                <code className="mono text-primary">tsec</code>) stays secret.
              </p>
              <button
                type="button"
                onClick={() => void generate()}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-strong disabled:opacity-50"
              >
                <KeyRound className="size-4" /> {busy ? "Generating…" : "Generate my Talos key"}
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-5">
              {/* Public key */}
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Public key — share to receive private transfers
                </p>
                <div className="flex items-center gap-2">
                  <code className="mono min-w-0 flex-1 truncate rounded-xl border border-border bg-background/50 px-3 py-2.5 text-xs text-foreground">
                    {pub}
                  </code>
                  <IconBtn onClick={() => copy("pub", pub)} active={copied === "pub"} />
                </div>
              </div>

              {/* Spending key */}
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-amber-500">
                  <ShieldAlert className="size-3.5" /> Spending key — secret, never share
                </p>
                <div className="flex items-center gap-2">
                  <code className="mono min-w-0 flex-1 truncate rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-foreground">
                    {reveal ? sec : sec.replace(/./g, "•").slice(0, 48) + "…"}
                  </code>
                  <button
                    type="button"
                    onClick={() => setReveal((v) => !v)}
                    className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
                    aria-label={reveal ? "Hide" : "Reveal"}
                  >
                    {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                  <IconBtn onClick={() => copy("sec", sec)} active={copied === "sec"} />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Stored only in this browser. Back it up — it's required to spend notes sent to your public key.
                </p>
              </div>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

function IconBtn({ onClick, active }: { onClick: () => void; active: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground hover:text-primary"
      aria-label="Copy"
    >
      {active ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
    </button>
  );
}
