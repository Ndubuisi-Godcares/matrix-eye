/**
 * Public types of the MatrixEye API.
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

/** A visual template for the chat widget: spacing, radius and type treatment. See packages/widget/src/styles.ts. */
export type WidgetTemplate = "minimal" | "saas" | "developer";

/** An icon id for the widget's floating launcher button. See packages/widget/src/widget.ts's ICONS. */
export type LauncherIcon = "chat" | "sparkle" | "headset" | "help" | "book" | "dot";

/**
 * Saved appearance for a project's widget, set from the dashboard's Template Studio (apps/dashboard) and served to
 * every visitor via the public config endpoint. A site's own explicit widget init options always override these
 * (see WidgetOptions in packages/widget) - this is the shared default, not a forced setting.
 */
export interface WidgetAppearance {
  template: WidgetTemplate | null;
  launcherIcon: LauncherIcon | null;
  /** Brand colour, "#rrggbb". */
  color: string | null;
  accent: string | null;
}

export const DEFAULT_APPEARANCE: WidgetAppearance = { template: null, launcherIcon: null, color: null, accent: null };

/** What a website visitor's browser may read about a project. */
export interface PublicConfig {
  name: string;
  greeting: string | null;
  suggestedQuestions: string[];
  appearance: WidgetAppearance;
}

export interface ProjectSettings {
  /** Exact browser origins allowed to embed the widget, e.g. "https://school.edu", or "*" for any site. */
  allowedOrigins: string[];
  greeting: string | null;
  suggestedQuestions: string[];
  appearance: WidgetAppearance;
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
