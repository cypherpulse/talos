import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { talosApi } from "./api";
import { useWallet } from "./wallet";
import { isTerminal, type NotePublic, type OperationView } from "./types";

export function useChainStatus() {
  return useQuery({
    queryKey: ["talos", "status"],
    queryFn: () => talosApi.status(),
    refetchInterval: 15_000,
    retry: 1,
  });
}

export function useNotes(): UseQueryResult<NotePublic[]> {
  // Notes are scoped to the connected wallet — disconnected shows nothing (no leakage
  // of other users' notes). The address is part of the key so switching accounts refetches.
  const { address } = useWallet();
  const owner = address?.toLowerCase() ?? null;
  return useQuery({
    queryKey: ["talos", "notes", owner],
    queryFn: async () => (owner ? (await talosApi.notes(owner)).notes : []),
    enabled: Boolean(owner),
    refetchInterval: 10_000,
    retry: 1,
  });
}

export function useAvailableNotes() {
  const query = useNotes();
  return {
    ...query,
    data: (query.data ?? []).filter((n) => n.state === "AVAILABLE"),
  };
}

export function usePrivateBalance() {
  const query = useNotes();
  const available = (query.data ?? []).filter((n) => n.state === "AVAILABLE");
  const total = available.reduce((acc, n) => {
    try {
      return acc + BigInt(n.value);
    } catch {
      return acc;
    }
  }, 0n);
  return { ...query, total, noteCount: available.length, available };
}

/** Poll a single operation until it reaches a terminal status. */
export function useOperation(operationId: string | null | undefined) {
  return useQuery({
    queryKey: ["talos", "operation", operationId],
    queryFn: () => talosApi.operation(operationId as string),
    enabled: Boolean(operationId),
    refetchInterval: (query) => {
      const data = query.state.data as OperationView | undefined;
      if (data && isTerminal(data.status)) return false;
      return 2_000;
    },
    retry: 1,
  });
}

/** Track a list of operation ids created in this session. */
const SESSION_KEY = "talos.operations";

export function useTrackedOperations() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      if (raw) setIds(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
  }, []);

  const track = useCallback((id: string) => {
    setIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [id, ...prev].slice(0, 50);
      try {
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { ids, track };
}

export function useOperationList(ids: string[]) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["talos", "operations", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const op = await talosApi.operation(id);
            queryClient.setQueryData(["talos", "operation", id], op);
            return op;
          } catch {
            return null;
          }
        }),
      );
      return results.filter((op): op is OperationView => op !== null);
    },
    refetchInterval: (query) => {
      const data = query.state.data as OperationView[] | undefined;
      if (data && data.length > 0 && data.every((op) => isTerminal(op.status))) return 15_000;
      return 2_500;
    },
    retry: 1,
  });
}

export function useGuardIdentity() {
  return useQuery({
    queryKey: ["talos", "guard", "identity"],
    queryFn: () => talosApi.guardIdentity(),
    retry: 1,
    staleTime: 60_000,
  });
}

export function useGuardDecisions() {
  return useQuery({
    queryKey: ["talos", "guard", "decisions"],
    queryFn: async () => (await talosApi.guardDecisions()).decisions,
    refetchInterval: 10_000,
    retry: 1,
  });
}
