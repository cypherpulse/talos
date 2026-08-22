import { randomUUID } from "node:crypto";

import type { AgentMemoryRecord, AgentMemoryRepository, MemoryType } from "../../database/repositories.js";

export interface EmbeddingsConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  dimensions: number;
}

/**
 * Agent memory (Phase 6) on PostgreSQL + pgvector. Three layers: WORKING (short-lived),
 * SEMANTIC (durable preferences/knowledge), EPISODIC (history). NEVER stores secrets.
 * Content is embedded (OpenAI-compatible) into a pgvector column for cosine-similarity
 * recall; if embeddings are unavailable it degrades to importance/recency ranking. All
 * writes are best-effort so memory can never break a trade or a request.
 */
export class MemoryService {
  constructor(
    private readonly repo: AgentMemoryRepository,
    private readonly embeddings?: EmbeddingsConfig,
  ) {}

  /** Embed text into a vector; null when embeddings are not configured or the call fails. */
  async embed(text: string): Promise<number[] | null> {
    if (!this.embeddings) return null;
    try {
      const res = await fetch(`${this.embeddings.baseUrl}/embeddings`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.embeddings.apiKey}` },
        body: JSON.stringify({ model: this.embeddings.model, input: text.slice(0, 8000), dimensions: this.embeddings.dimensions }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
      return data.data?.[0]?.embedding ?? null;
    } catch {
      return null;
    }
  }

  async remember(
    owner: string,
    memoryType: MemoryType,
    content: string,
    opts?: { importance?: number; asset?: string; agentId?: string; metadata?: Record<string, unknown> },
  ): Promise<void> {
    try {
      const embedding = await this.embed(content);
      const record: AgentMemoryRecord = {
        id: `mem_${randomUUID()}`,
        owner: owner.toLowerCase(),
        agentId: opts?.agentId ?? null,
        memoryType,
        content,
        asset: opts?.asset ?? null,
        importance: opts?.importance ?? 1,
        metadata: opts?.metadata ?? null,
        createdAt: new Date().toISOString(),
      };
      await this.repo.create(record, embedding);
    } catch {
      /* memory is best-effort — never propagate */
    }
  }

  recall(owner: string, opts?: { types?: MemoryType[]; limit?: number }): Promise<AgentMemoryRecord[]> {
    return this.repo.recall(owner.toLowerCase(), opts);
  }

  /** Semantic search: embed the query and cosine-match; falls back to recency ranking. */
  async search(owner: string, query: string, opts?: { types?: MemoryType[]; limit?: number }): Promise<AgentMemoryRecord[]> {
    const embedding = await this.embed(query);
    if (!embedding) return this.repo.recall(owner.toLowerCase(), opts);
    try {
      return await this.repo.recallSimilar(owner.toLowerCase(), embedding, opts);
    } catch {
      return this.repo.recall(owner.toLowerCase(), opts);
    }
  }

  count(owner: string): Promise<number> {
    return this.repo.count(owner.toLowerCase());
  }
  forget(id: string): Promise<void> {
    return this.repo.delete(id);
  }
  clear(owner: string): Promise<void> {
    return this.repo.clear(owner.toLowerCase());
  }

  /** Compact preference context (semantic memories) relevant to a query, for prompting. */
  async context(owner: string, query?: string): Promise<string> {
    const mems = query
      ? await this.search(owner, query, { types: ["SEMANTIC"], limit: 6 })
      : await this.recall(owner, { types: ["SEMANTIC"], limit: 6 });
    return mems.map((m) => `- ${m.content}`).join("\n");
  }
}
