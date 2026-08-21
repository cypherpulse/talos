import { useMemo, useState, type ReactNode } from "react";

import { talosApi, newIdempotencyKey } from "@/lib/talos/api";
import { useAvailableNotes } from "@/lib/talos/hooks";
import { useWallet } from "@/lib/talos/wallet";
import {
  ASSET_SYMBOL,
  formatUnits,
  isAddress,
  isValidValue,
  parseUnits,
} from "@/lib/talos/format";
import type { NotePublic } from "@/lib/talos/types";
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
  const [amount, setAmount] = useState("");
  const { operationId, submit, pending, error, reset } = useOperationSubmit();
  const base = parseUnits(amount);
  const valid = base !== null && isValidValue(base);

  if (operationId) return <Result operationId={operationId} title="Shielding assets" onReset={() => { reset(); setAmount(""); }} />;

  return (
    <div className="space-y-4">
      <Field label="Amount" hint={valid ? `= ${base} base units` : "Move the test asset into a private note"}>
        <AmountInput value={amount} onChange={setAmount} />
      </Field>
      <SubmitButton
        pending={pending}
        disabled={!valid}
        onClick={() => valid && submit(() => talosApi.deposit({ amount: base }, newIdempotencyKey()))}
      >
        Shield assets
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
        <Field label="Note 1"><NoteSelect notes={notes} value={n1} onChange={setN1} /></Field>
        <Field label="Note 2"><NoteSelect notes={notes} value={n2} onChange={setN2} /></Field>
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
  const validKey = /^\d{6,}$/.test(pubKey.trim());
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
      <Field label="Recipient Talos owner key" hint="A Talos owner public key (decimal field element)">
        <TextInput value={pubKey} onChange={(e) => setPubKey(e.target.value)} placeholder="e.g. 1832…4471" />
      </Field>
      <SubmitButton
        pending={pending}
        disabled={!valid}
        onClick={() =>
          valid &&
          submit(() =>
            talosApi.transfer(
              { noteId, amount1: base!, amount2: change!, recipientOwnerPubKey: pubKey.trim() },
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
  const [noteId, setNoteId] = useState("");
  const [recipient, setRecipient] = useState("");
  const { operationId, submit, pending, error: opError, reset } = useOperationSubmit();
  const note = notes?.find((n) => n.id === noteId);
  const target = recipient || address || "";
  const valid = Boolean(note && isAddress(target));

  if (isError) return <ErrorState message={String(error)} onRetry={refetch} />;
  if (!notes) return <p className="text-sm text-muted-foreground">Loading notes…</p>;
  if (notes.length === 0) return <NoNotes />;
  if (operationId) return <Result operationId={operationId} title="Withdrawing to X Layer" onReset={reset} />;

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
        </p>
      ) : null}
      <SubmitButton
        pending={pending}
        disabled={!valid}
        onClick={() => valid && submit(() => talosApi.withdraw({ noteId, recipient: target }, newIdempotencyKey()))}
      >
        Withdraw
      </SubmitButton>
      {opError ? <p className="mono text-xs text-destructive">{opError}</p> : null}
    </div>
  );
}
