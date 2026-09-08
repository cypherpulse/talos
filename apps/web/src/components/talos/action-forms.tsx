import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { talosApi, newIdempotencyKey } from "@/lib/talos/api";
import { useAvailableNotes, useTrackedOperations } from "@/lib/talos/hooks";
import { useWallet } from "@/lib/talos/wallet";
import { assetById, formatAssetAmount, useAssets } from "@/lib/talos/assets";
import { decodeKey } from "@/lib/talos/keys";
import {
  loadClientNotes,
  proveDepositInBrowser,
  proveWithdrawInBrowser,
  rememberClientNote,
} from "@/lib/talos/client-prove";
import {
  encodeApprove,
  encodeDeposit,
  ensureChain,
  getInjected,
  readAllowance,
  readErc20Balance,
  readNativeBalance,
  sendTx,
  waitForTx,
} from "@/lib/talos/evm";
import {
  ASSET_SYMBOL,
  formatUnits,
  isAddress,
  isValidValue,
  parseUnits,
} from "@/lib/talos/format";
import type { Asset, NotePublic } from "@/lib/talos/types";
import { AssetLogo } from "@/components/talos/asset-logo";
import { EmptyState, ErrorState } from "@/components/talos/primitives";
import { OperationTracker } from "@/components/talos/operation-tracker";
import {
  AmountInput,
  Field,
  GlassCard,
  NoteSelect,
  PageHeader,
  SubmitButton,
  TextInput,
  useOperationSubmit,
} from "@/components/talos/ui";
import { cn } from "@/lib/utils";

/** Standard page frame for an operation. */
export function ActionPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      <div className="mx-auto max-w-xl">
        <GlassCard className="p-6">{children}</GlassCard>
      </div>
    </div>
  );
}

function NoNotes() {
  return (
    <EmptyState
      title="No available notes"
      description="Shield an asset first to create a private note you can spend."
    />
  );
}

function Result({ operationId, title, onReset }: { operationId: string; title: string; onReset: () => void }) {
  return (
    <div className="space-y-3">
      <OperationTracker operationId={operationId} title={title} />
      <button
        type="button"
        onClick={onReset}
        className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
      >
        Start another →
      </button>
    </div>
  );
}

function useNotes(): { notes: NotePublic[] | undefined; isError: boolean; error: unknown; refetch: () => void } {
  const q = useAvailableNotes();
  return { notes: q.data, isError: q.isError, error: q.error, refetch: () => void q.refetch() };
}

/* -------------------------------- Shield ------------------------------- */

export function ShieldForm() {
  const { assets } = useAssets();
  const { address } = useWallet();
  const { track } = useTrackedOperations();
  const queryClient = useQueryClient();

  const [assetId, setAssetId] = useState(1);
  const asset = assetById(assets, assetId);
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null);
  const [nonCustodial, setNonCustodial] = useState(false);

  const base = parseUnits(amount, asset.decimals);
  const valid = base !== null && isValidValue(base);
  const pending = step !== null;

  // Show the connected wallet's public balance for the selected asset.
  useEffect(() => {
    let cancelled = false;
    setWalletBalance(null);
    if (!address) return;
    void (async () => {
      try {
        const bal = asset.isNative
          ? await readNativeBalance(address)
          : await readErc20Balance(asset.address, address);
        if (!cancelled) setWalletBalance(bal);
      } catch {
        /* balance is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, asset.assetId, asset.address, asset.isNative]);

  const reset = () => {
    setOperationId(null);
    setAmount("");
    setStep(null);
    setError(null);
  };

  if (operationId)
    return <Result operationId={operationId} title={`Shielding ${asset.symbol}`} onReset={reset} />;

  const run = async () => {
    setError(null);
    if (!valid || base === null) return;
    const provider = getInjected();
    if (!provider || !address) {
      setError("Connect a browser wallet first (top-right) — you sign and fund the deposit.");
      return;
    }
    if (walletBalance !== null && BigInt(base) > walletBalance) {
      setError(`Insufficient ${asset.symbol} balance in your wallet.`);
      return;
    }
    try {
      let commitment: string;
      let proofWords: string[];
      let opId: string;
      let poolAddr: string;

      if (nonCustodial) {
        // B4: derive keys + prove the deposit binding in the browser. The spending key
        // never leaves this device; the server only indexes the resulting commitment.
        setStep("Sign to derive your keys, then proving in your browser…");
        const noteIndex = Date.now();
        const cp = await proveDepositInBrowser(BigInt(assetId), BigInt(base), noteIndex);
        rememberClientNote({ commitment: cp.commitment, noteIndex, assetId: String(assetId), amount: base });

        setStep("Registering your note…");
        const prep = await talosApi.depositPrepare(
          { assetId, amount: base, owner: address, commitment: cp.commitment, ownerPublicKey: cp.ownerPubKey },
          newIdempotencyKey(),
        );
        commitment = prep.commitment;
        proofWords = cp.proof;
        opId = prep.operationId;
        poolAddr = prep.poolAddress;
      } else {
        setStep("Preparing private note…");
        const prep = await talosApi.depositPrepare({ assetId, amount: base, owner: address }, newIdempotencyKey());
        if (!prep.proof) throw new Error("Server returned no deposit proof.");
        commitment = prep.commitment;
        proofWords = prep.proof;
        opId = prep.operationId;
        poolAddr = prep.poolAddress;
      }

      await ensureChain(provider);

      // ERC-20 assets need an allowance for the pool before it can pull the tokens.
      if (!asset.isNative) {
        setStep("Checking allowance…");
        const allowance = await readAllowance(asset.address, address, poolAddr);
        if (allowance < BigInt(base)) {
          setStep("Approve the token in your wallet…");
          const approveTx = await sendTx(provider, {
            from: address,
            to: asset.address,
            data: encodeApprove(poolAddr, (1n << 256n) - 1n),
          });
          setStep("Waiting for approval…");
          await waitForTx(approveTx);
        }
      }

      setStep("Confirm the deposit in your wallet…");
      const depositTx = await sendTx(provider, {
        from: address,
        to: poolAddr,
        data: encodeDeposit(proofWords, BigInt(assetId), BigInt(base), BigInt(commitment)),
        value: asset.isNative ? BigInt(base) : 0n,
      });

      setStep("Finalizing on Talos…");
      await talosApi.depositConfirm(opId, depositTx);
      track(opId);
      void queryClient.invalidateQueries({ queryKey: ["talos", "notes"] });
      setOperationId(opId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Shield failed");
    } finally {
      setStep(null);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="Asset" hint="Choose the token to shield into a private note">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {assets.map((a) => (
            <button
              key={a.assetId}
              type="button"
              onClick={() => setAssetId(a.assetId)}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                a.assetId === assetId
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-surface/50 text-muted-foreground hover:border-primary/40",
              )}
            >
              <AssetLogo asset={a} size={22} />
              <span className="font-medium">{a.symbol}</span>
            </button>
          ))}
        </div>
      </Field>

      <Field
        label="Amount"
        hint={
          address && walletBalance !== null
            ? `Wallet balance: ${formatAssetAmount(walletBalance, asset)} ${asset.symbol}`
            : valid
              ? `= ${base} base units`
              : `Shield ${asset.symbol} into a private note`
        }
      >
        <AmountInput value={amount} onChange={setAmount} />
      </Field>

      {!address ? (
        <p className="mono text-xs text-amber-500">
          Connect your wallet (top-right) — you sign and fund the deposit yourself.
        </p>
      ) : null}

      <label className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-surface/40 p-3">
        <input
          type="checkbox"
          checked={nonCustodial}
          onChange={(e) => setNonCustodial(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-primary"
        />
        <span className="min-w-0">
          <span className="text-xs font-medium text-foreground">Non-custodial (prove in your browser)</span>
          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
            Derive your keys from a wallet signature and generate the deposit proof locally — your
            spending key never leaves this device, so the server can never spend this note.
            Experimental: spending these notes needs the upcoming client-side spend feature.
          </span>
        </span>
      </label>

      <SubmitButton pending={pending} disabled={!valid || !address} onClick={() => void run()}>
        {pending ? (step ?? "Working…") : `Shield ${asset.symbol}`}
      </SubmitButton>
      {error ? <p className="mono text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/* --------------------------------- Split ------------------------------- */

export function SplitForm() {
  const { notes, isError, error, refetch } = useNotes();
  const [noteId, setNoteId] = useState("");
  const [a1, setA1] = useState("");
  const [a2, setA2] = useState("");
  const { operationId, submit, pending, error: opError, reset } = useOperationSubmit();
  const note = useMemo(() => notes?.find((n) => n.id === noteId), [notes, noteId]);

  const b1 = parseUnits(a1);
  const b2 = parseUnits(a2);
  const sumOk = note && b1 !== null && b2 !== null && (BigInt(b1) + BigInt(b2)).toString() === note.value;
  const valid = Boolean(note && b1 && b2 && isValidValue(b1) && isValidValue(b2) && sumOk);

  if (isError) return <ErrorState message={String(error)} onRetry={refetch} />;
  if (!notes) return <p className="text-sm text-muted-foreground">Loading notes…</p>;
  if (notes.length === 0) return <NoNotes />;
  if (operationId) return <Result operationId={operationId} title="Splitting note" onReset={reset} />;

  return (
    <div className="space-y-4">
      <Field label="Input note">
        <NoteSelect notes={notes} value={noteId} onChange={setNoteId} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount 1"><AmountInput value={a1} onChange={setA1} /></Field>
        <Field label="Amount 2"><AmountInput value={a2} onChange={setA2} /></Field>
      </div>
      {note ? (
        <p className={cn("mono text-xs", sumOk ? "text-primary" : "text-muted-foreground")}>
          {formatUnits(note.value)} {ASSET_SYMBOL} = {a1 || "0"} + {a2 || "0"}
          {note && !sumOk ? " · amounts must sum to the note value" : ""}
        </p>
      ) : null}
      <SubmitButton
        pending={pending}
        disabled={!valid}
        onClick={() => valid && submit(() => talosApi.split({ noteId, amount1: b1!, amount2: b2! }, newIdempotencyKey()))}
      >
        Split note
      </SubmitButton>
      {opError ? <p className="mono text-xs text-destructive">{opError}</p> : null}
    </div>
  );
}

/* --------------------------------- Merge ------------------------------- */

export function MergeForm() {
  const { notes, isError, error, refetch } = useNotes();
  const [n1, setN1] = useState("");
  const [n2, setN2] = useState("");
  const { operationId, submit, pending, error: opError, reset } = useOperationSubmit();
  const note1 = notes?.find((n) => n.id === n1);
  const note2 = notes?.find((n) => n.id === n2);
  const valid = Boolean(note1 && note2 && n1 !== n2);
  const sum = note1 && note2 ? (BigInt(note1.value) + BigInt(note2.value)).toString() : null;

  if (isError) return <ErrorState message={String(error)} onRetry={refetch} />;
  if (!notes) return <p className="text-sm text-muted-foreground">Loading notes…</p>;
  if (notes.length < 2) {
    return <EmptyState title="Need two notes to merge" description="Shield or split to create at least two available notes." />;
  }
  if (operationId) return <Result operationId={operationId} title="Merging notes" onReset={reset} />;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Note 1">
          <NoteSelect notes={notes} value={n1} onChange={setN1} disabledIds={[n2]} />
        </Field>
        <Field label="Note 2">
          <NoteSelect notes={notes} value={n2} onChange={setN2} disabledIds={[n1]} />
        </Field>
      </div>
      {sum ? (
        <p className="mono text-xs text-primary">
          {formatUnits(note1!.value)} + {formatUnits(note2!.value)} = {formatUnits(sum)} {ASSET_SYMBOL}
        </p>
      ) : null}
      {n1 && n1 === n2 ? <p className="mono text-xs text-destructive">Choose two different notes.</p> : null}
      <SubmitButton
        pending={pending}
        disabled={!valid}
        onClick={() => valid && submit(() => talosApi.merge({ noteId1: n1, noteId2: n2 }, newIdempotencyKey()))}
      >
        Merge notes
      </SubmitButton>
      {opError ? <p className="mono text-xs text-destructive">{opError}</p> : null}
    </div>
  );
}

/* ------------------------------- Transfer ------------------------------ */

export function TransferForm() {
  const { notes, isError, error, refetch } = useNotes();
  const [noteId, setNoteId] = useState("");
  const [amount, setAmount] = useState("");
  const [pubKey, setPubKey] = useState("");
  const { operationId, submit, pending, error: opError, reset } = useOperationSubmit();
  const note = notes?.find((n) => n.id === noteId);

  const base = parseUnits(amount);
  const withinValue = note && base !== null && BigInt(base) <= BigInt(note.value) && BigInt(base) > 0n;
  const decodedPub = decodeKey(pubKey);
  const validKey = decodedPub !== null;
  const change = note && base !== null ? (BigInt(note.value) - BigInt(base)).toString() : null;
  const valid = Boolean(note && withinValue && validKey);

  if (isError) return <ErrorState message={String(error)} onRetry={refetch} />;
  if (!notes) return <p className="text-sm text-muted-foreground">Loading notes…</p>;
  if (notes.length === 0) return <NoNotes />;
  if (operationId) return <Result operationId={operationId} title="Private transfer" onReset={reset} />;

  return (
    <div className="space-y-4">
      <Field label="Input note">
        <NoteSelect notes={notes} value={noteId} onChange={setNoteId} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount to recipient"><AmountInput value={amount} onChange={setAmount} /></Field>
        <Field label="Change to you" hint="Returned as a new private note">
          <div className="mono flex h-[42px] items-center rounded-xl border border-border bg-background/40 px-3.5 text-sm text-muted-foreground">
            {change !== null ? `${formatUnits(change)} ${ASSET_SYMBOL}` : "—"}
          </div>
        </Field>
      </div>
      <Field
        label="Recipient Talos key"
        hint="Paste the recipient's tpub… key (they get it from their Profile page)"
      >
        <TextInput value={pubKey} onChange={(e) => setPubKey(e.target.value)} placeholder="tpub…" />
      </Field>
      {pubKey && !validKey ? (
        <p className="mono text-xs text-destructive">That doesn't look like a valid tpub… key.</p>
      ) : null}
      <SubmitButton
        pending={pending}
        disabled={!valid}
        onClick={() =>
          valid &&
          submit(() =>
            talosApi.transfer(
              { noteId, amount1: base!, amount2: change!, recipientOwnerPubKey: decodedPub! },
              newIdempotencyKey(),
            ),
          )
        }
      >
        Send privately
      </SubmitButton>
      {opError ? <p className="mono text-xs text-destructive">{opError}</p> : null}
    </div>
  );
}

/* ------------------------------- Withdraw ------------------------------ */

export function WithdrawForm() {
  const { notes, isError, error, refetch } = useNotes();
  const { address } = useWallet();
  const { track } = useTrackedOperations();
  const queryClient = useQueryClient();
  const [noteId, setNoteId] = useState("");
  const [recipient, setRecipient] = useState("");
  const [step, setStep] = useState<string | null>(null);
  const [opError, setOpError] = useState<string | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);

  const note = notes?.find((n) => n.id === noteId);
  const target = recipient || address || "";
  const valid = Boolean(note && isAddress(target));
  const pending = step !== null;
  // A client-owned note (from a non-custodial deposit) must be proved in the browser — the
  // server has no spending key for it. Detected via the local client-note registry.
  const clientRec = useMemo(
    () => (note ? loadClientNotes().find((r) => r.commitment === note.commitment) : undefined),
    [note],
  );

  if (isError) return <ErrorState message={String(error)} onRetry={refetch} />;
  if (!notes) return <p className="text-sm text-muted-foreground">Loading notes…</p>;
  if (notes.length === 0) return <NoNotes />;
  if (operationId)
    return (
      <Result
        operationId={operationId}
        title="Withdrawing to X Layer"
        onReset={() => {
          setOperationId(null);
          setRecipient("");
          setNoteId("");
          setStep(null);
          setOpError(null);
        }}
      />
    );

  const run = async () => {
    if (!note || !isAddress(target)) return;
    setOpError(null);
    try {
      if (clientRec) {
        // Non-custodial: prove the withdraw in the browser, server relays it.
        setStep("Fetching Merkle path…");
        const path = await talosApi.notePath(noteId);
        setStep("Sign to derive keys, then proving in your browser…");
        const cp = await proveWithdrawInBrowser({
          noteIndex: clientRec.noteIndex,
          assetId: BigInt(note.assetId),
          value: BigInt(note.value),
          recipient: target,
          path,
        });
        setStep("Relaying withdrawal…");
        const op = await talosApi.withdrawSubmit(
          { noteId, recipient: target, root: cp.root, nullifier: cp.nullifier, proof: cp.proof },
          newIdempotencyKey(),
        );
        track(op.operationId);
        void queryClient.invalidateQueries({ queryKey: ["talos", "notes"] });
        setOperationId(op.operationId);
      } else {
        setStep("Submitting withdrawal…");
        const ack = await talosApi.withdraw({ noteId, recipient: target }, newIdempotencyKey());
        track(ack.operationId);
        void queryClient.invalidateQueries({ queryKey: ["talos", "notes"] });
        setOperationId(ack.operationId);
      }
    } catch (e) {
      setOpError(e instanceof Error ? e.message : "Withdraw failed");
    } finally {
      setStep(null);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="Input note">
        <NoteSelect notes={notes} value={noteId} onChange={setNoteId} />
      </Field>
      <Field
        label="Recipient address"
        hint={address && !recipient ? `Using connected wallet ${address}` : "0x… on X Layer"}
      >
        <TextInput
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder={address ?? "0x0000000000000000000000000000000000000000"}
        />
      </Field>
      {note ? (
        <p className="mono text-xs text-muted-foreground">
          Withdrawing {formatUnits(note.value)} {ASSET_SYMBOL} to a public address.
          {clientRec ? " · non-custodial (proved in your browser, key never leaves this device)" : ""}
        </p>
      ) : null}
      <SubmitButton pending={pending} disabled={!valid} onClick={() => void run()}>
        {pending ? (step ?? "Working…") : "Withdraw"}
      </SubmitButton>
      {opError ? <p className="mono text-xs text-destructive">{opError}</p> : null}
    </div>
  );
}
