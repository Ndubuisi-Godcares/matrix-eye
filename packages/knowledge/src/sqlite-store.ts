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
import { pagePrior, urlWords } from "./ranking";
import type { KnowledgeStats, KnowledgeStore, StoredPage } from "./store";

/** Column weights for bm25(): page title, heading path, URL words, body text. */
const BM25_WEIGHTS = [4.0, 3.0, 3.0, 1.0] as const;
/**
 * Bump when the table layout changes. Everything stored here is derived from crawling, so an older
 * layout is simply discarded and rebuilt by the next crawl (nothing the user typed is lost).
 */
const SCHEMA_VERSION = 2;
/** Reciprocal-rank-fusion constant (60 is the value from the original RRF paper). */
const RRF_K = 60;
/** Fusion weights: every-concept matches count most, then the visitor's own words, then synonym-expanded matches. */
/** Words present in more than this share of a site's passages are ignored when requiring every idea to match. */
const UBIQUITOUS_RATIO = 0.5;
const LABEL_WEIGHT = 4;
const CONCEPT_WEIGHT = 3;
const STRICT_WEIGHT = 2;
/** Most concepts ANDed together; beyond this the requirement becomes too strict to match anything. */
const MAX_CONCEPTS = 5;
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
  description  TEXT NOT NULL DEFAULT '',
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
  url_text     TEXT NOT NULL,  -- words of the page's URL path ("how to apply"), indexed with high weight
  text         TEXT NOT NULL,
  position     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_page ON chunks (project_id, page_url);

-- External-content FTS index over the chunks table; triggers below keep it in sync.
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  page_title, heading_text, url_text, text,
  content='chunks', content_rowid='rowid',
  tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts (rowid, page_title, heading_text, url_text, text)
  VALUES (new.rowid, new.page_title, new.heading_text, new.url_text, new.text);
END;
CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts (chunks_fts, rowid, page_title, heading_text, url_text, text)
  VALUES ('delete', old.rowid, old.page_title, old.heading_text, old.url_text, old.text);
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

const quote = (term: string) => `"${term.replace(/"/g, '""')}"`;

/**
 * Turn natural language into a safe FTS5 MATCH expression.
 * Every term is quoted, which neutralises FTS5 operators (AND, NOT, NEAR, "*", ":") that
 * could otherwise appear in user input and either break the query or change its meaning.
 *
 * Three shapes, used together by `search` (see there):
 *  - "strict"    the visitor's own words, OR-ed: BM25 ranks passages matching more (and rarer) words higher
 *  - "wide"      those words plus hand-written synonyms (core/text.ts), OR-ed
 *  - "concepts"  one group per question word (the word or any synonym), AND-ed: a passage must cover
 *                every idea in the question. Returns null for questions with fewer than two ideas.
 *  - "labels"    like "concepts", but every idea must appear in the title, headings or URL words
 */
export function buildMatchQuery(
  question: string,
  mode: "strict" | "wide" | "concepts" | "labels" | boolean = "strict",
  /** Words to leave out of the concept/label shapes (words that appear almost everywhere identify nothing). */
  skip: (word: string) => boolean = () => false,
): string | null {
  // Booleans are accepted for backward compatibility: `true` meant "expand with synonyms".
  const shape = mode === true ? "wide" : mode === false ? "strict" : mode;
  const terms = contentWords(question);

  if (shape === "concepts" || shape === "labels") {
    const meaningful = terms.filter((t) => !skip(t));
    if (meaningful.length < 2) return null;
    const groups = meaningful.slice(0, MAX_CONCEPTS).map((t) => `(${expandWithSynonyms([t]).map(quote).join(" OR ")})`);
    const all = groups.join(" AND ");
    // "labels": the same idea, but only in a page's title, headings and URL words. A section headed
    // "Application Requirements" is a far stronger sign of relevance than the words merely co-occurring in text.
    return shape === "labels" ? `{page_title heading_text url_text} : (${all})` : all;
  }

  // A question made only of stop words ("what is it?") falls back to its raw tokens.
  const tokens = terms.length > 0 ? (shape === "wide" ? expandWithSynonyms(terms) : terms) : tokenize(question);
  const quoted = tokens.slice(0, MAX_QUERY_TERMS).map(quote);
  return quoted.length > 0 ? quoted.join(" OR ") : null;
}

export class SqliteKnowledgeStore implements KnowledgeStore {
  private readonly db: DatabaseSync;

  /** @param path SQLite file path, or ":memory:" for an ephemeral store (tests). */
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;");
    this.migrate();
    this.db.exec(SCHEMA);
  }

  /** Discard derived tables from an older layout; the next crawl rebuilds them. */
  private migrate(): void {
    const { user_version: version } = this.db.prepare("PRAGMA user_version").get() as { user_version: number };
    if (version >= SCHEMA_VERSION) return;
    this.db.exec("DROP TRIGGER IF EXISTS chunks_ai; DROP TRIGGER IF EXISTS chunks_ad; DROP TABLE IF EXISTS chunks_fts; DROP TABLE IF EXISTS chunks; DROP TABLE IF EXISTS pages; DROP TABLE IF EXISTS facts;");
    this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
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
        .prepare("INSERT INTO pages (project_id, url, title, content_hash, fetched_at, chunk_count, description) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(projectId, page.url, page.title, page.contentHash, page.fetchedAt, chunks.length, page.description);
      const insert = this.db.prepare(
        "INSERT INTO chunks (id, project_id, page_url, page_title, heading_path, heading_text, url_text, text, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      for (const c of chunks) {
        insert.run(c.id, projectId, c.pageUrl, c.pageTitle, JSON.stringify(c.headingPath), c.headingPath.join(" "), urlWords(c.pageUrl), c.text, c.position);
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

  rootPage(projectId: string): { url: string; title: string; description: string; text: string } | null {
    const page = this.db.prepare("SELECT url, title, description FROM pages WHERE project_id = ? ORDER BY length(url) ASC LIMIT 1").get(projectId) as
      | { url: string; title: string; description: string }
      | undefined;
    if (!page) return null;
    const opening = this.db.prepare("SELECT text FROM chunks WHERE project_id = ? AND page_url = ? ORDER BY position LIMIT 2").all(projectId, page.url) as Array<{ text: string }>;
    return { ...page, text: opening.map((c) => c.text).join("\n") };
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
   * Hybrid ranking over four keyword queries, merged with reciprocal-rank fusion (RRF):
   *  - labels:   every idea appears in the page title, headings or URL ("Application Requirements")
   *  - concepts: passages covering EVERY idea in the question (each idea = a word or its synonyms)
   *  - strict:   only the visitor's own words
   *  - expanded: those words plus synonyms ("cost" -> "tuition", "fee", ...)
   * A passage's fused score is the sum of weight/(K + rank) over the lists it appears in. Expansion
   * rescues questions phrased differently from the website; the concept list stops one very common
   * word ("admission" on an admissions site) from drowning out the passage that matches the rest.
   */
  search(projectId: string, query: string, limit: number): SearchHit[] {
    const pool = limit * 3;
    const strictQuery = buildMatchQuery(query, "strict");
    const wideQuery = buildMatchQuery(query, "wide");
    // A word found in most passages (typically the site's own name, repeated in every title) cannot
    // narrow anything down, so it is left out of the "every idea must match" queries.
    const { chunks, df } = this.termDocumentFrequencies(projectId);
    const ubiquitous = (word: string) => chunks > 0 && (df.get(stem(word)) ?? 0) / chunks > UBIQUITOUS_RATIO;
    const conceptQuery = buildMatchQuery(query, "concepts", ubiquitous);
    const labelQuery = buildMatchQuery(query, "labels", ubiquitous);
    if (!strictQuery || !wideQuery) return [];

    const strict = this.runMatch(projectId, strictQuery, pool);
    const wide = wideQuery === strictQuery ? [] : this.runMatch(projectId, wideQuery, pool);
    const concepts = conceptQuery ? this.runMatch(projectId, conceptQuery, pool) : [];
    const labels = labelQuery ? this.runMatch(projectId, labelQuery, pool) : [];

    const fused = new Map<string, SearchHit>();
    const add = (hits: SearchHit[], weight: number) =>
      hits.forEach((hit, rank) => {
        const existing = fused.get(hit.chunk.id);
        const gain = weight / (RRF_K + rank + 1);
        fused.set(hit.chunk.id, { chunk: hit.chunk, score: (existing?.score ?? 0) + gain });
      });
    add(labels, LABEL_WEIGHT);
    add(concepts, CONCEPT_WEIGHT);
    add(strict, STRICT_WEIGHT);
    add(wide, 1);

    // Authority prior: official, shallow pages beat incidental deep ones when relevance is close.
    const ranked = [...fused.values()].map((hit) => ({ chunk: hit.chunk, score: hit.score * pagePrior(hit.chunk.pageUrl) }));
    return ranked.sort((a, b) => b.score - a.score).slice(0, limit);
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
    // Cheap staleness check: the chunk count changes whenever an ingest adds or removes content.
    const { n } = this.db.prepare("SELECT COUNT(*) AS n FROM chunks WHERE project_id = ?").get(projectId) as { n: number };
    const cached = this.dfCache.get(projectId);
    if (cached && cached.chunks === n) return cached;

    const rows = this.db.prepare("SELECT page_title, heading_text, url_text, text FROM chunks WHERE project_id = ?").all(projectId) as Array<{
      page_title: string;
      heading_text: string;
      url_text: string;
      text: string;
    }>;
    const df = new Map<string, number>();
    for (const row of rows) {
      const seen = new Set(tokenize(`${row.page_title} ${row.heading_text} ${row.url_text} ${row.text}`).map(stem));
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
