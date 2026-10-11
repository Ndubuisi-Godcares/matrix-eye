/**
 * Tunable defaults, gathered in one place so behaviour can be reviewed and adjusted
 * (and evaluated — see /evals) without hunting through the code.
 *
 * Every value here is a starting point validated against the evaluation set, not a law.
 */

/** Limits that keep a crawl polite and bounded. */
export const CRAWL_DEFAULTS = {
  /** Stop after this many pages regardless of site size. */
  maxPages: 200,
  /** Link depth from the start URL. Sitemap URLs count as depth 1. */
  maxDepth: 4,
  /** Parallel requests per crawl. Kept low on purpose: we are a guest on someone else's server. */
  concurrency: 2,
  /** Minimum gap between requests to the same host. A robots.txt Crawl-delay raises this. */
  delayMs: 250,
  /** Per-request timeout. */
  timeoutMs: 15_000,
  /** Largest response body we will read. Prevents memory exhaustion from huge or hostile files. */
  maxBytes: 2 * 1024 * 1024,
  /** Redirect hops followed before giving up. */
  maxRedirects: 5,
  /** Pages with less extracted text than this are treated as "probably needs JavaScript". */
  minTextChars: 200,
  userAgent: "EaglesEyeBot/0.1 (+https://eagleseye.ai/bot)",
} as const;

/** Chunking targets, in words. */
export const CHUNK_DEFAULTS = {
  targetWords: 170,
  maxWords: 260,
  /** Words repeated at the start of the next chunk so ideas split across a boundary stay findable. */
  overlapWords: 30,
  /** Shorter fragments are merged into a neighbour rather than indexed alone. */
  minWords: 25,
} as const;

/** Retrieval and answer-gating thresholds. */
export const ANSWER_DEFAULTS = {
  /** Chunks retrieved per question. */
  topK: 6,
  /** Chunks passed to the model/extractor as evidence. */
  evidenceChunks: 4,
  /** At most this many evidence chunks may come from the same page (keeps sources diverse). */
  maxChunksPerPage: 2,
  /**
   * Minimum fraction of the question's content words that must appear in the evidence
   * before we attempt an answer. Below this we abstain rather than guess.
   */
  minCoverage: 0.5,
  /** Conversation turns kept for follow-up resolution. */
  historyTurns: 6,
  maxAnswerTokens: 400,
} as const;
