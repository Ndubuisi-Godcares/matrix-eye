/**
 * SQLite implementation of KnowledgeStore using the built-in `node:sqlite` module.
 *
 * Retrieval uses SQLite's FTS5 full-text index with the Porter stemmer and BM25 ranking.
 * BM25 is the standard keyword-relevance formula: it rewards rare query words, saturates
 * repeated words, and normalises for passage length. Columns are weighted so a match in a
 * page title or heading counts more than the same word in body text.
 *
 * Why SQLite first: no server to run (great for self-hosting and tests), single file, and
 * fast enough for tens of thousands of chunks. Hosted multi-tenant scale moves to PostgreSQL
 * behind the same interface (ADR-002).
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { contentWords, expandWithSynonyms, stem, tokenize, type Chunk, type CrawledPage, type Fact, type SearchHit } from "@eagles-eye/core";
import type { KnowledgeStats, KnowledgeStore, StoredPage } from "./store";

/** Column weights for bm25(): page title, heading path, body text. */
const BM25_WEIGHTS = [4.0, 3.0, 1.0] as const;
/** Reciprocal-rank-fusion constant (60 is the value from the original RRF paper). */
const RRF_K = 60;
/** The strict (own-words) list counts this many times more than the synonym-expanded list. */
const STRICT_WEIGHT = 2;
/** Cap on query terms to keep MATCH expressions small and fast. */
const MAX_QUERY_TERMS = 30;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS pages (
  project_id   TEXT NOT NULL,
  url          TEXT NOT NULL,
  title        TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  fetched_at   TEXT NOT NULL,
  chunk_count  INTEGER NOT NULL,
  PRIMARY KEY (project_id, url)
);

CREATE TABLE IF NOT EXISTS chunks (
  rowid        INTEGER PRIMARY KEY,
  id           TEXT NOT NULL,
  project_id   TEXT NOT NULL,
  page_url     TEXT NOT NULL,
  page_title   TEXT NOT NULL,
  heading_path TEXT NOT NULL,  -- JSON array of headings
  heading_text TEXT NOT NULL,  -- same headings joined for full-text indexing
  text         TEXT NOT NULL,
  position     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_page ON chunks (project_id, page_url);

-- External-content FTS index over the chunks table; triggers below keep it in sync.
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  page_title, heading_text, text,
  content='chunks', content_rowid='rowid',
  tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts (rowid, page_title, heading_text, text)
  VALUES (new.rowid, new.page_title, new.heading_text, new.text);
END;
CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts (chunks_fts, rowid, page_title, heading_text, text)
  VALUES ('delete', old.rowid, old.page_title, old.heading_text, old.text);
END;

CREATE TABLE IF NOT EXISTS facts (
  project_id TEXT NOT NULL,
  kind       TEXT NOT NULL,
  value      TEXT NOT NULL,
  page_url   TEXT NOT NULL,
  page_title TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_facts_project ON facts (project_id);
`;

interface ChunkRow {
  id: string;
  page_url: string;
  page_title: string;
  heading_path: string;
  text: string;
  position: number;
  score: number;
}

/**
 * Turn natural language into a safe FTS5 MATCH expression.
 * Every term is quoted, which neutralises FTS5 operators (AND, NOT, NEAR, "*", ":") that
 * could otherwise appear in user input and either break the query or change its meaning.
 * Terms are OR-ed: BM25 ranks passages matching more (and rarer) terms higher.
 * Hand-written synonym groups (core/text.ts) bridge everyday wording and website wording.
 */
export function buildMatchQuery(question: string, expand = false): string | null {
  const terms = contentWords(question);
  // A question made only of stop words ("what is it?") falls back to its raw tokens.
  // With `expand`, synonyms widen recall ("cost" also finds "tuition"); original words stay first.
  const tokens = terms.length > 0 ? (expand ? expandWithSynonyms(terms) : terms) : tokenize(question);
  const quoted = tokens.slice(0, MAX_QUERY_TERMS).map((t) => `"${t.replace(/"/g, '""')}"`);
  return quoted.length > 0 ? quoted.join(" OR ") : null;
}

export class SqliteKnowledgeStore implements KnowledgeStore {
  private readonly db: DatabaseSync;

  /** @param path SQLite file path, or ":memory:" for an ephemeral store (tests). */
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;");
    this.db.exec(SCHEMA);
  }

  /** Expose the connection so sibling modules (API repositories) can share one database file. */
  get connection(): DatabaseSync {
    return this.db;
  }

  /** Run `fn` inside a transaction; roll back if it throws. */
  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  upsertPage(projectId: string, page: CrawledPage, chunks: Chunk[]): void {
    this.transaction(() => {
      this.deletePage(projectId, page.url);
      this.db
        .prepare("INSERT INTO pages (project_id, url, title, content_hash, fetched_at, chunk_count) VALUES (?, ?, ?, ?, ?, ?)")
        .run(projectId, page.url, page.title, page.contentHash, page.fetchedAt, chunks.length);
      const insert = this.db.prepare(
        "INSERT INTO chunks (id, project_id, page_url, page_title, heading_path, heading_text, text, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      );
      for (const c of chunks) {
        insert.run(c.id, projectId, c.pageUrl, c.pageTitle, JSON.stringify(c.headingPath), c.headingPath.join(" "), c.text, c.position);
      }
    });
  }

  private deletePage(projectId: string, url: string): void {
    this.db.prepare("DELETE FROM chunks WHERE project_id = ? AND page_url = ?").run(projectId, url);
    this.db.prepare("DELETE FROM pages WHERE project_id = ? AND url = ?").run(projectId, url);
  }

  pruneMissingPages(projectId: string, keepUrls: ReadonlySet<string>): number {
    const stored = this.db.prepare("SELECT url FROM pages WHERE project_id = ?").all(projectId) as Array<{ url: string }>;
    const stale = stored.filter((p) => !keepUrls.has(p.url));
    this.transaction(() => {
      for (const p of stale) this.deletePage(projectId, p.url);
    });
    return stale.length;
  }

  contentHashes(projectId: string): Map<string, string> {
    const rows = this.db.prepare("SELECT url, content_hash FROM pages WHERE project_id = ?").all(projectId) as Array<{ url: string; content_hash: string }>;
    return new Map(rows.map((r) => [r.url, r.content_hash]));
  }

  listPages(projectId: string): StoredPage[] {
    const rows = this.db
      .prepare("SELECT url, title, content_hash, chunk_count, fetched_at FROM pages WHERE project_id = ? ORDER BY url")
      .all(projectId) as Array<{ url: string; title: string; content_hash: string; chunk_count: number; fetched_at: string }>;
    return rows.map((r) => ({ url: r.url, title: r.title, contentHash: r.content_hash, chunkCount: r.chunk_count, fetchedAt: r.fetched_at }));
  }

  /**
   * Hybrid ranking over two keyword queries, merged with reciprocal-rank fusion (RRF):
   *  - strict:   only the visitor's own words
   *  - expanded: those words plus synonyms ("cost" -> "tuition", "fee", ...)
   * A passage's fused score is the sum of 1/(K + rank) over the lists it appears in, with the
   * strict list weighted higher. Expansion therefore rescues questions phrased differently from
   * the website, without letting loosely related passages outrank exact matches.
   */
  search(projectId: string, query: string, limit: number): SearchHit[] {
    const pool = limit * 3;
    const strictQuery = buildMatchQuery(query, false);
    const wideQuery = buildMatchQuery(query, true);
    if (!strictQuery || !wideQuery) return [];

    const strict = this.runMatch(projectId, strictQuery, pool);
    const wide = wideQuery === strictQuery ? [] : this.runMatch(projectId, wideQuery, pool);

    const fused = new Map<string, SearchHit>();
    const add = (hits: SearchHit[], weight: number) =>
      hits.forEach((hit, rank) => {
        const existing = fused.get(hit.chunk.id);
        const gain = weight / (RRF_K + rank + 1);
        fused.set(hit.chunk.id, { chunk: hit.chunk, score: (existing?.score ?? 0) + gain });
      });
    add(strict, STRICT_WEIGHT);
    add(wide, 1);

    return [...fused.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** Run one FTS5 MATCH query, best BM25 first. */
  private runMatch(projectId: string, match: string, limit: number): SearchHit[] {
    const rows = this.db
      .prepare(
        `SELECT c.id, c.page_url, c.page_title, c.heading_path, c.text, c.position,
                -bm25(chunks_fts, ${BM25_WEIGHTS.join(", ")}) AS score
           FROM chunks_fts
           JOIN chunks c ON c.rowid = chunks_fts.rowid
          WHERE chunks_fts MATCH ? AND c.project_id = ?
          ORDER BY score DESC
          LIMIT ?`,
      )
      .all(match, projectId, limit) as unknown as ChunkRow[];
    return rows.map((r) => ({
      score: r.score,
      chunk: {
        id: r.id,
        pageUrl: r.page_url,
        pageTitle: r.page_title,
        headingPath: JSON.parse(r.heading_path) as string[],
        text: r.text,
        position: r.position,
      },
    }));
  }

  replaceFacts(projectId: string, facts: Fact[]): void {
    this.transaction(() => {
      this.db.prepare("DELETE FROM facts WHERE project_id = ?").run(projectId);
      const insert = this.db.prepare("INSERT INTO facts (project_id, kind, value, page_url, page_title) VALUES (?, ?, ?, ?, ?)");
      for (const f of facts) insert.run(projectId, f.kind, f.value, f.pageUrl, f.pageTitle);
    });
  }

  getFacts(projectId: string): Fact[] {
    const rows = this.db.prepare("SELECT kind, value, page_url, page_title FROM facts WHERE project_id = ?").all(projectId) as Array<{
      kind: Fact["kind"];
      value: string;
      page_url: string;
      page_title: string;
    }>;
    return rows.map((r) => ({ kind: r.kind, value: r.value, pageUrl: r.page_url, pageTitle: r.page_title }));
  }

  /** Cached per project; recomputed when the number of chunks changes (i.e. after an ingest). */
  private dfCache = new Map<string, { chunks: number; df: Map<string, number> }>();

  termDocumentFrequencies(projectId: string): { chunks: number; df: ReadonlyMap<string, number> } {
    const rows = this.db.prepare("SELECT page_title, heading_text, text FROM chunks WHERE project_id = ?").all(projectId) as Array<{
      page_title: string;
      heading_text: string;
      text: string;
    }>;
    const cached = this.dfCache.get(projectId);
    if (cached && cached.chunks === rows.length) return cached;

    const df = new Map<string, number>();
    for (const row of rows) {
      const seen = new Set(tokenize(`${row.page_title} ${row.heading_text} ${row.text}`).map(stem));
      for (const term of seen) df.set(term, (df.get(term) ?? 0) + 1);
    }
    const result = { chunks: rows.length, df };
    this.dfCache.set(projectId, result);
    return result;
  }

  corpusText(projectId: string): string {
    const rows = this.db.prepare("SELECT text FROM chunks WHERE project_id = ?").all(projectId) as Array<{ text: string }>;
    return rows.map((r) => r.text).join("\n");
  }

  deleteProject(projectId: string): void {
    this.transaction(() => {
      this.db.prepare("DELETE FROM chunks WHERE project_id = ?").run(projectId);
      this.db.prepare("DELETE FROM pages WHERE project_id = ?").run(projectId);
      this.db.prepare("DELETE FROM facts WHERE project_id = ?").run(projectId);
    });
  }

  stats(projectId: string): KnowledgeStats {
    const pages = this.db.prepare("SELECT COUNT(*) AS n FROM pages WHERE project_id = ?").get(projectId) as { n: number };
    const chunks = this.db.prepare("SELECT COUNT(*) AS n FROM chunks WHERE project_id = ?").get(projectId) as { n: number };
    return { pages: pages.n, chunks: chunks.n };
  }

  close(): void {
    this.db.close();
  }
}
