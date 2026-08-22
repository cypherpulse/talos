import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, BrainCircuit, CheckCircle2, Coins, CornerDownLeft, Loader2, ShieldCheck, User } from "lucide-react";
import { useState } from "react";

import { talosApi, errorMessage, newIdempotencyKey } from "@/lib/talos/api";
import { useGuardIdentity } from "@/lib/talos/hooks";
import { useWallet } from "@/lib/talos/wallet";
import { assetById, formatAssetAmount, useAssets } from "@/lib/talos/assets";
import {
  encodeApprove,
  encodeDeposit,
  ensureChain,
  getInjected,
  readAllowance,
  sendTx,
  waitForTx,
} from "@/lib/talos/evm";
import { parseUnits } from "@/lib/talos/format";
import type { AgentMessageResponse, AgentStep } from "@/lib/talos/types";
import { AssetLogo } from "@/components/talos/asset-logo";
import { HashChip, SectionLabel, StatusPill } from "@/components/talos/primitives";
import { GlassCard, PageHeader, TextInput } from "@/components/talos/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/agent")({
  component: AgentPage,
});

type Turn =
  | { role: "user"; text: string }
  | { role: "agent"; data: AgentMessageResponse }
  | { role: "error"; text: string };

const SUGGESTIONS = [
  "Split my 100 USDC into 60 and 40",
  "Merge my two notes",
  "What is my private balance?",
];

function AgentPage() {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const guard = useGuardIdentity();
  const queryClient = useQueryClient();
  const { address } = useWallet();

  const mutation = useMutation({
    mutationFn: (message: string) =>
      talosApi.agentMessage({ message, ...(address ? { owner: address } : {}) }),
    onSuccess: (data) => {
      setTurns((t) => [...t, { role: "agent", data }]);
      void queryClient.invalidateQueries({ queryKey: ["talos", "notes"] });
    },
    onError: (err) => setTurns((t) => [...t, { role: "error", text: errorMessage(err) }]),
  });

  const send = (text: string) => {
    const message = text.trim();
    if (!message || mutation.isPending) return;
    setTurns((t) => [...t, { role: "user", text: message }]);
    setInput("");
    mutation.mutate(message);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Talos Agent"
        description="Ask in plain language. The agent proposes; Talos Guard authorizes; the Core Server proves and settles on X Layer."
        actions={
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary-soft px-3 py-1.5 text-xs text-primary">
            <span className="size-1.5 rounded-full bg-primary dot-pulse" />
            Guard active{guard.data?.agentName ? ` · ${guard.data.agentName}` : ""}
          </span>
        }
      />

      <GlassCard className="p-0">
        <div className="max-h-[52vh] min-h-[280px] space-y-4 overflow-y-auto p-5">
          {turns.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
              <span className="grid size-12 place-items-center rounded-2xl border border-primary/25 bg-primary-soft text-primary">
                <BrainCircuit className="size-6" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">What should Talos do?</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try one of these — every action is checked by the Guard first.
                </p>
              </div>
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
            turns.map((turn, i) => <TurnView key={i} turn={turn} />)
          )}
          {mutation.isPending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Talos is thinking, proving, and settling…
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
            placeholder="Split my 100 USDC into 60 and 40…"
            className="flex-1"
          />
          <button
            type="submit"
            disabled={!input.trim() || mutation.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-strong disabled:opacity-50"
          >
            Execute <CornerDownLeft className="size-4" />
          </button>
        </form>
      </GlassCard>
    </div>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] items-start gap-2.5 rounded-2xl rounded-tr-sm border border-border bg-surface-2 px-4 py-2.5">
          <p className="text-sm text-foreground">{turn.text}</p>
          <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        </div>
      </div>
    );
  }
  if (turn.role === "error") {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3">
        <p className="text-sm font-medium text-destructive">The agent endpoint is unavailable</p>
        <p className="mono mt-1 text-xs text-muted-foreground">{turn.text}</p>
      </div>
    );
  }

  const { reply, steps } = turn.data;
  const rejected = steps.find((s) => s.result?.decision === "REJECTED");
  const shield = steps.find((s) => s.result?.actionRequired === "SHIELD");
  const approval = steps.find((s) => s.result?.decision === "APPROVAL_REQUIRED");

  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary-soft text-primary">
        <BrainCircuit className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="rounded-2xl rounded-tl-sm border border-border bg-background/50 px-4 py-2.5">
          <p className="text-sm text-foreground">{reply}</p>
        </div>

        {steps.length > 0 ? <Pipeline steps={steps} /> : null}

        {rejected ? (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <Ban className="size-3.5" /> Guard rejected: {rejected.result.reason ?? "outside policy"} · no
            transaction created.
          </div>
        ) : null}

        {shield ? (
          <ShieldAction
            assetId={Number(shield.result.assetId ?? 1)}
            amount={String(shield.result.amount ?? "")}
          />
        ) : null}

        {approval?.result.guardOperationId ? (
          <ApproveAction guardOperationId={String(approval.result.guardOperationId)} />
        ) : null}
      </div>
    </div>
  );
}

/** Non-custodial shield the agent proposed — the user signs + funds it in their wallet. */
function ShieldAction({ assetId, amount }: { assetId: number; amount: string }) {
  const { assets } = useAssets();
  const { address } = useWallet();
  const asset = assetById(assets, assetId);
  const queryClient = useQueryClient();
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const base = parseUnits(amount, asset.decimals);

  const run = async () => {
    setError(null);
    const provider = getInjected();
    if (!provider || !address) {
      setError("Connect your wallet first (top-right).");
      return;
    }
    if (base === null) {
      setError(`Invalid amount: ${amount}`);
      return;
    }
    try {
      setStep("Preparing note…");
      const prep = await talosApi.depositPrepare({ assetId, amount: base, owner: address }, newIdempotencyKey());
      await ensureChain(provider);
      if (!asset.isNative) {
        setStep("Checking allowance…");
        const allowance = await readAllowance(asset.address, address, prep.poolAddress);
        if (allowance < BigInt(base)) {
          setStep("Approve the token in your wallet…");
          await waitForTx(
            await sendTx(provider, {
              from: address,
              to: asset.address,
              data: encodeApprove(prep.poolAddress, (1n << 256n) - 1n),
            }),
          );
        }
      }
      setStep("Confirm the deposit in your wallet…");
      const txHash = await sendTx(provider, {
        from: address,
        to: prep.poolAddress,
        data: encodeDeposit(BigInt(assetId), BigInt(base), BigInt(prep.commitment)),
        value: asset.isNative ? BigInt(base) : 0n,
      });
      setStep("Finalizing on Talos…");
      await talosApi.depositConfirm(prep.operationId, txHash);
      void queryClient.invalidateQueries({ queryKey: ["talos", "notes"] });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Shield failed");
    } finally {
      setStep(null);
    }
  };

  if (done)
    return (
      <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary-soft px-3 py-2 text-xs text-primary">
        <CheckCircle2 className="size-3.5" /> Shielded {amount} {asset.symbol} into a private note.
      </div>
    );

  return (
    <div className="rounded-xl border border-primary/25 bg-primary-soft/50 px-3 py-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <AssetLogo asset={asset} size={18} /> Sign to shield{" "}
        <span className="font-semibold text-foreground">
          {amount} {asset.symbol}
        </span>{" "}
        from your wallet (non-custodial).
      </div>
      <button
        type="button"
        onClick={() => void run()}
        disabled={step !== null}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-strong disabled:opacity-50"
      >
        {step ? <Loader2 className="size-3.5 animate-spin" /> : <Coins className="size-3.5" />}
        {step ?? `Sign & shield ${amount} ${asset.symbol}`}
      </button>
      {error ? <p className="mono mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/** Guard flagged the action as needing human approval — one click to authorize. */
function ApproveAction({ guardOperationId }: { guardOperationId: string }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  const approve = async () => {
    setState("pending");
    try {
      const r = await talosApi.guardApprove(guardOperationId);
      setMsg(`Approved · ${r.decision}`);
      setState("done");
      void queryClient.invalidateQueries({ queryKey: ["talos", "notes"] });
    } catch (e) {
      setMsg(errorMessage(e));
      setState("error");
    }
  };

  if (state === "done")
    return (
      <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary-soft px-3 py-2 text-xs text-primary">
        <CheckCircle2 className="size-3.5" /> {msg}
      </div>
    );

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-3">
      <p className="mb-2 text-xs text-muted-foreground">
        This action exceeds an auto-approve limit and needs your approval.
      </p>
      <button
        type="button"
        onClick={() => void approve()}
        disabled={state === "pending"}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-strong disabled:opacity-50"
      >
        {state === "pending" ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
        Approve & continue
      </button>
      {state === "error" ? <p className="mono mt-2 text-xs text-destructive">{msg}</p> : null}
    </div>
  );
}

function Pipeline({ steps }: { steps: AgentStep[] }) {
  return (
    <div className="relative space-y-1.5 pl-5">
      <div className="absolute bottom-3 left-[7px] top-3 w-px bg-border" />
      {steps.map((s, i) => {
        const decision = s.result?.decision;
        const status = s.result?.status;
        const tone = decision ?? status;
        return (
          <div key={i} className="relative flex items-center gap-3 rounded-xl border border-border bg-surface/50 px-3 py-2">
            <span
              className={cn(
                "absolute -left-5 size-3.5 rounded-full border",
                decision === "REJECTED"
                  ? "border-destructive/50 bg-destructive/20"
                  : "border-primary/40 bg-primary/20",
              )}
            >
              {decision === "APPROVED" || status === "FINALIZED" ? (
                <ShieldCheck className="size-3 text-primary" />
              ) : null}
            </span>
            <span className="mono min-w-0 flex-1 truncate text-xs text-foreground">{s.tool}</span>
            {s.result?.txHash ? <HashChip value={s.result.txHash} kind="tx" head={5} tail={4} /> : null}
            {tone ? <StatusPill status={tone} /> : null}
          </div>
        );
      })}
    </div>
  );
}
