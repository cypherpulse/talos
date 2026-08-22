import type { NotePublic, OperationType } from "../domain/types.js";

/** A request function: `app.request` in-process (tests) or `fetch` against a base URL. */
export type RequestFn = (path: string, init?: RequestInit) => Promise<Response>;

const OP_PATH: Record<OperationType, string> = {
  DEPOSIT: "/api/v1/deposits",
  TRANSFER: "/api/v1/transfers",
  SPLIT: "/api/v1/splits",
  MERGE: "/api/v1/merges",
  WITHDRAW: "/api/v1/withdrawals",
};

export interface OperationView {
  status: string;
  txHash: string | null;
  result: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
}

/**
 * Thin typed client for the Phase 4 Core Server HTTP API. The Guard (and, through it,
 * the agent) reaches the Core Server ONLY via this client — never via raw RPC. Uses
 * `app.request` in-process for deterministic tests, or `fetch` in production.
 */
export class CoreClient {
  // `owner` scopes note listings to a single connected wallet (per-user agent view).
  constructor(private readonly req: RequestFn, private readonly owner?: string) {}

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.req(path, init);
    return (await res.json()) as T;
  }

  listNotes(): Promise<{ notes: NotePublic[] }> {
    return this.json(`/api/v1/notes${this.owner ? `?owner=${encodeURIComponent(this.owner)}` : ""}`);
  }
  getNote(id: string): Promise<NotePublic> {
    return this.json(`/api/v1/notes/${id}`);
  }
  getMerkleRoot(): Promise<{ root: string }> {
    return this.json("/api/v1/merkle/root");
  }
  getStatus(): Promise<{ chainId: number; blockNumber: number; root: string; nextLeafIndex: number; merkleDepth: number }> {
    return this.json("/api/v1/status");
  }
  getOperation(id: string): Promise<OperationView> {
    return this.json(`/api/v1/operations/${id}`);
  }

  submit(op: OperationType, body: Record<string, unknown>): Promise<{ operationId: string; status: string }> {
    return this.json(OP_PATH[op], {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
}
