/**
 * Typed, isomorphic REST client for the Talos Core Server. Uses global `fetch` (Node 18+ /
 * browsers); a custom `fetch` can be injected for tests or non-standard runtimes. Returns
 * public data only — the server never returns note secrets.
 */
import type {
  Asset,
  ChainStatus,
  DepositPrepareResponse,
  MerklePathResponse,
  NotePublic,
  OperationView,
} from "./types";

export class TalosApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "TalosApiError";
  }
}

export interface TalosApiOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

/** Body for a client-proved multi-output spend relay (split / transfer / merge). */
export interface SpendSubmitBody {
  inputNoteIds: string[];
  root: string;
  nullifiers: string[];
  outCommitments: string[];
  outputs: { commitment: string; assetId: string; value: string; ownerPubKey: string; mine: boolean }[];
  owner?: string;
  proof: string[];
}

export class TalosApi {
  private readonly base: string;
  private readonly f: typeof fetch;

  constructor(opts: TalosApiOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, "");
    const f = opts.fetch ?? globalThis.fetch;
    if (!f) throw new Error("no `fetch` available; pass one via TalosApiOptions.fetch");
    this.f = f.bind(globalThis);
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.f(this.base + path, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      let message = res.statusText;
      let code: string | undefined;
      try {
        const j = (await res.json()) as { error?: { message?: string; code?: string }; message?: string; code?: string };
        message = j.error?.message ?? j.message ?? message;
        code = j.error?.code ?? j.code;
      } catch {
        /* non-JSON error body */
      }
      throw new TalosApiError(res.status, message, code);
    }
    return (await res.json()) as T;
  }

  private post<T>(path: string, body: unknown, idempotencyKey?: string): Promise<T> {
    return this.req<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
      ...(idempotencyKey ? { headers: { "idempotency-key": idempotencyKey } } : {}),
    });
  }

  // --- reads ---
  status(): Promise<ChainStatus> {
    return this.req<ChainStatus>("/api/v1/status");
  }
  assets(): Promise<{ assets: Asset[] }> {
    return this.req<{ assets: Asset[] }>("/api/v1/assets");
  }
  notes(owner?: string): Promise<{ notes: NotePublic[] }> {
    return this.req<{ notes: NotePublic[] }>(`/api/v1/notes${owner ? `?owner=${owner}` : ""}`);
  }
  note(id: string): Promise<NotePublic> {
    return this.req<NotePublic>(`/api/v1/notes/${id}`);
  }
  notePath(id: string): Promise<MerklePathResponse> {
    return this.req<MerklePathResponse>(`/api/v1/notes/${id}/path`);
  }
  operation(id: string): Promise<OperationView> {
    return this.req<OperationView>(`/api/v1/operations/${id}`);
  }

  // --- deposit ---
  depositPrepare(
    body: { assetId: number; amount: string; owner?: string; commitment?: string; ownerPublicKey?: string },
    idempotencyKey?: string,
  ): Promise<DepositPrepareResponse> {
    return this.post<DepositPrepareResponse>("/api/v1/deposits/prepare", body, idempotencyKey);
  }
  depositConfirm(operationId: string, txHash: string): Promise<OperationView> {
    return this.post<OperationView>(`/api/v1/deposits/${operationId}/confirm`, { txHash });
  }

  // --- client-proved spend relays ---
  withdrawSubmit(
    body: { noteId: string; recipient: string; root: string; nullifier: string; proof: string[] },
    idempotencyKey?: string,
  ): Promise<OperationView> {
    return this.post<OperationView>("/api/v1/withdrawals/submit", body, idempotencyKey);
  }
  spendSubmit(op: "splits" | "transfers" | "merges", body: SpendSubmitBody, idempotencyKey?: string): Promise<OperationView> {
    return this.post<OperationView>(`/api/v1/${op}/submit`, body, idempotencyKey);
  }
}
