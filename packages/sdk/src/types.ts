/**
 * Public types of the Eagle's Eye API.
 *
 * Deliberately self-contained: the SDK is published on its own, so it does not import the server's internal
 * packages. A type-level test (test/compat.test-d.ts) checks these stay compatible with the server's types.
 */

export interface Citation {
  /** The number the answer text refers to, e.g. "[1]". */
  id: number;
  url: string;
  title: string;
  /** A short excerpt of the supporting passage. */
  snippet: string;
}

/** How an answer was produced. `abstain` means the site did not contain the answer. */
export type AnswerRoute = "rule" | "smalltalk" | "facts" | "overview" | "llm" | "extractive" | "abstain";

export interface ChatResponse {
  answer: string;
  /** True when the assistant declined because the website does not cover the question. */
  abstained: boolean;
  route: AnswerRoute;
  citations: Citation[];
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  /** Earlier turns, oldest first (at most 12). Enables follow-up questions such as "how much is it?". */
  history?: ChatTurn[];
  signal?: AbortSignal;
}

/**
 * One event of a streamed answer.
 * - `token`: provisional text as the model writes it. Not yet validated.
 * - `final`: the validated answer and sources. ALWAYS replace anything streamed with `response.answer`.
 */
export type StreamEvent = { type: "token"; text: string } | { type: "final"; response: ChatResponse };

/** What a website visitor's browser may read about a project. */
export interface PublicConfig {
  name: string;
  greeting: string | null;
  suggestedQuestions: string[];
}

export interface ProjectSettings {
  /** Exact browser origins allowed to embed the widget, e.g. "https://school.edu", or "*" for any site. */
  allowedOrigins: string[];
  greeting: string | null;
  suggestedQuestions: string[];
}

export interface Rule {
  id: string;
  priority: number;
  allOf?: string[];
  anyOf?: string[];
  pattern?: string;
  response: string;
}

export interface Project {
  id: string;
  name: string;
  siteUrl: string;
  rules: Rule[];
  settings: ProjectSettings;
  createdAt: string;
}

export interface ProjectDetails extends Project {
  knowledge: { pages: number; chunks: number };
  latestCrawl: CrawlJob | null;
}

export interface CrawlJob {
  id: string;
  projectId: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  finishedAt: string | null;
  pagesIndexed: number;
  pagesUnchanged: number;
  pagesRemoved: number;
  chunksWritten: number;
  skipped: number;
  failed: number;
  reachedPageLimit: boolean;
  error: string | null;
}

export interface StoredPage {
  url: string;
  title: string;
  contentHash: string;
  chunkCount: number;
  fetchedAt: string;
}

export interface SearchResult {
  score: number;
  url: string;
  title: string;
  section: string;
  text: string;
}

export interface Feedback {
  id: string;
  projectId: string;
  rating: "up" | "down";
  question: string;
  answer: string;
  comment: string | null;
  createdAt: string;
}

export interface CreateProjectInput {
  name: string;
  siteUrl: string;
  rules?: Rule[];
  settings?: Partial<ProjectSettings>;
}
