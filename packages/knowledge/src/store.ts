/**
 * The storage contract for crawled knowledge.
 *
 * The engine depends only on this interface. v1 ships a SQLite implementation (zero setup,
 * ideal for self-hosting and tests); the hosted service will add a PostgreSQL implementation
 * behind the same interface, so nothing above this layer changes. See docs/adr/ADR-002.
 */
import type { Chunk, CrawledPage, Fact, SearchHit } from "@eagles-eye/core";

export interface StoredPage {
  url: string;
  title: string;
  contentHash: string;
  chunkCount: number;
  fetchedAt: string;
}

export interface KnowledgeStats {
  pages: number;
  chunks: number;
}

export interface KnowledgeStore {
  /** Replace everything stored for `page.url` with the given chunks (atomic). */
  upsertPage(projectId: string, page: CrawledPage, chunks: Chunk[]): void;

  /** Remove pages whose URL is not in `keepUrls` (pages that disappeared from the site). Returns the count removed. */
  pruneMissingPages(projectId: string, keepUrls: ReadonlySet<string>): number;

  /** url -> contentHash for every stored page, used to skip unchanged pages on re-crawl. */
  contentHashes(projectId: string): Map<string, string>;

  listPages(projectId: string): StoredPage[];

  /**
   * Ranked full-text search. Results are best-first with positive scores.
   * `query` is the user's natural-language text; the store handles tokenising and escaping.
   */
  search(projectId: string, query: string, limit: number): SearchHit[];

  /** Replace the structured facts (contact details) for a project. */
  replaceFacts(projectId: string, facts: Fact[]): void;
  getFacts(projectId: string): Fact[];

  /**
   * For each stemmed word, the number of chunks containing it. Lets callers judge how specific a
   * word is (rare words identify a topic) and whether the site mentions a word at all.
   */
  termDocumentFrequencies(projectId: string): { chunks: number; df: ReadonlyMap<string, number> };

  /** All indexed text of a project, concatenated. For verification and diagnostics (e.g. "is this number on the site?"), not for answering. */
  corpusText(projectId: string): string;

  /** Delete all knowledge for a project. */
  deleteProject(projectId: string): void;

  stats(projectId: string): KnowledgeStats;

  close(): void;
}
