/**
 * The conversation engine: turns a visitor's question into a grounded, cited answer — or an
 * honest "I don't know".
 *
 * Decision order (cheapest and most deterministic first):
 *
 *   1. configured rule        -> fixed answer, no retrieval, no model
 *   2. contact question       -> answered verbatim from extracted facts
 *   3. retrieve evidence      -> rewrite follow-ups, BM25 search, diversify by page
 *   4. coverage gate          -> evidence doesn't cover the question? abstain
 *   5. generate               -> language model if configured, else extractive
 *   6. validate               -> bad citations/numbers? repair, or fall back to extractive
 *
 * The invariant: any factual answer returned is backed by at least one cited passage.
 */
import { ANSWER_DEFAULTS, EagleError, truncate, type ChatDebug, type ChatResponse, type ChatTurn, type Citation, type Rule, type SearchHit } from "@eagles-eye/core";
import type { KnowledgeStore } from "@eagles-eye/knowledge";
import type { LlmProvider } from "@eagles-eye/llm";
import { containsNumber, expectsNumber } from "./answer-type";
import { answerFromFacts, isContactQuestion } from "./facts";
import { composeExtractive } from "./extractive";
import { isOverviewQuestion } from "./overview";
import { detectSmallTalk, shortSiteName, smallTalkReply } from "./smalltalk";
import { buildMessages } from "./prompt";
import { coverage, inverseDocumentFrequency, selectEvidence, unsupportedKeyTerm } from "./retrieve";
import { rewriteHeuristic, rewriteQuery } from "./rewrite";
import { matchRule } from "./rules";
import { validateAnswer } from "./validate";

/** Retrieval and answering settings; the defaults in core are fixed literals, so widen them to plain numbers. */
export type AnswerTuning = { -readonly [K in keyof typeof ANSWER_DEFAULTS]: number };

export interface EngineOptions {
  store: KnowledgeStore;
  /** Language model. When null/omitted the engine answers extractively (no model needed). */
  llm?: LlmProvider | null;
  /** Override any retrieval/answering threshold (see ANSWER_DEFAULTS). */
  tuning?: Partial<AnswerTuning>;
}

export interface AskInput {
  projectId: string;
  question: string;
  /** Prior turns, oldest first. Enables follow-up questions. */
  history?: readonly ChatTurn[];
  /** Name used in the prompt, e.g. "Riverside University". */
  siteName?: string;
  rules?: readonly Rule[];
  signal?: AbortSignal;
}

const MAX_QUESTION_CHARS = 1000;

export class ConversationEngine {
  private readonly store: KnowledgeStore;
  private readonly llm: LlmProvider | null;
  private readonly tuning: AnswerTuning;

  constructor(options: EngineOptions) {
    this.store = options.store;
    this.llm = options.llm ?? null;
    // A model can read and combine more passages than a sentence-quoting fallback can use well. Listing
    // questions ("what courses do you offer?") need several sources, so give it more by default.
    const modelDefaults = options.llm ? { evidenceChunks: 6, maxChunksPerPage: 3 } : {};
    this.tuning = { ...ANSWER_DEFAULTS, ...modelDefaults, ...options.tuning };
  }

  async ask(input: AskInput): Promise<ChatResponse> {
    const started = performance.now();
    const timings: Record<string, number> = {};
    const mark = (label: string, since: number) => {
      timings[label] = Math.round(performance.now() - since);
    };

    const question = input.question.trim().slice(0, MAX_QUESTION_CHARS);
    if (!question) throw new EagleError("invalid_request", "Question must not be empty");
    const history = (input.history ?? []).slice(-this.tuning.historyTurns);
    const siteName = input.siteName ?? "this website";

    // 1. Deterministic rules win over everything.
    const rule = matchRule(input.rules ?? [], question);
    if (rule) {
      return { answer: rule.response, abstained: false, route: "rule", citations: [], debug: this.debug(question, [], 0, [`rule:${rule.id}`], timings) };
    }

    // 1b. Greetings, thanks and goodbyes need no search and no model.
    const smallTalk = detectSmallTalk(question);
    if (smallTalk) {
      const name = input.siteName && input.siteName !== "this website" ? input.siteName : shortSiteName(this.store.rootPage(input.projectId)?.title);
      return { answer: smallTalkReply(smallTalk, name), abstained: false, route: "smalltalk", citations: [], debug: this.debug(question, [], 1, [], timings) };
    }

    // 2. Contact details come from extracted facts, never from generation.
    const facts = this.store.getFacts(input.projectId);
    if (isContactQuestion(question)) {
      const fromFacts = answerFromFacts(facts);
      if (fromFacts) {
        return { ...fromFacts, abstained: false, route: "facts", debug: this.debug(question, [], 1, [], timings) };
      }
    }

    // 2b. Broad "what is this site about?" questions are answered from the front page itself.
    if (isOverviewQuestion(question)) {
      const root = this.store.rootPage(input.projectId);
      if (root) {
        const summary = root.description.length >= 40 ? root.description : truncate(root.text, 300);
        const answer = summary ? `${root.title ? root.title + ": " : ""}${summary} [1]` : "";
        if (answer) {
          return { answer, abstained: false, route: "overview", citations: [{ id: 1, url: root.url, title: root.title, snippet: truncate(summary, 220) }], debug: this.debug(question, [], 1, [], timings) };
        }
      }
    }

    // 3. Retrieve. Follow-ups are first rewritten into a standalone query.
    let t = performance.now();
    const query = await rewriteQuery(question, history, this.llm, input.signal);
    mark("rewrite", t);

    t = performance.now();
    const hits = preferNumbersWhenAsked(question, this.store.search(input.projectId, query, this.tuning.topK));
    const evidence = selectEvidence(hits, this.tuning.evidenceChunks, this.tuning.maxChunksPerPage);
    mark("retrieve", t);

    // 4. Gates: no relevant evidence means no answer, rather than a plausible guess.
    //    (a) overall coverage of the question; (b) the question's most specific word must be supported.
    const cov = coverage(query, evidence);
    const topScore = evidence[0]?.score ?? 0;
    const { chunks, df } = this.store.termDocumentFrequencies(input.projectId);
    const missingKeyTerm = unsupportedKeyTerm(question, evidence, df, chunks);
    if (evidence.length === 0 || cov < this.tuning.minCoverage || missingKeyTerm) {
      const response = this.abstain(facts);
      const why = missingKeyTerm ? [`unsupported_key_term:${missingKeyTerm}`] : [];
      return { ...response, debug: { ...this.debug(query, evidence, cov, why, timings), hitCount: hits.length, topScore } };
    }

    // 5 + 6. Generate and validate.
    t = performance.now();
    const issues: string[] = [];
    let response: Omit<ChatResponse, "debug"> | null = null;

    if (this.llm) {
      response = await this.generateWithModel(this.llm, { question, siteName, evidence, history, signal: input.signal }, issues);
    }
    response ??= this.generateExtractive(query, evidence, (term) => inverseDocumentFrequency(term, df, chunks), expectsNumber(question));
    mark("generate", t);

    timings.total = Math.round(performance.now() - started);
    return { ...response, debug: { ...this.debug(query, evidence, cov, issues, timings), hitCount: hits.length, topScore } };
  }

  /** Ask the model, validate its answer, and fall back to extractive on any failure. Returns null to request fallback. */
  private async generateWithModel(
    llm: LlmProvider,
    ctx: { question: string; siteName: string; evidence: SearchHit[]; history: readonly ChatTurn[]; signal?: AbortSignal },
    issues: string[],
  ): Promise<Omit<ChatResponse, "debug"> | null> {
    let raw: string;
    try {
      const result = await llm.complete({
        messages: buildMessages(ctx),
        maxTokens: this.tuning.maxAnswerTokens,
        temperature: 0.1,
        signal: ctx.signal,
      });
      raw = result.text;
    } catch (err) {
      // An unreachable model degrades the answer style, not availability.
      issues.push(`llm_error:${err instanceof Error ? err.message.slice(0, 120) : "unknown"}`);
      return null;
    }

    const evidenceText = ctx.evidence.map((h) => h.chunk.text).join("\n");
    const verdict = validateAnswer(raw, ctx.evidence.length, evidenceText);
    issues.push(...verdict.issues);

    if (verdict.declined) {
      return { answer: ABSTAIN_TEXT, abstained: true, route: "abstain", citations: [] };
    }
    // Missing citations or invented figures: the model's wording cannot be trusted, its evidence can.
    const unsafe = verdict.issues.some((i) => i === "empty" || i === "no_citation" || i.startsWith("unsupported_number"));
    if (unsafe) return null;

    return {
      answer: verdict.answer,
      abstained: false,
      route: "llm",
      citations: verdict.citedIds.map((id) => toCitation(id, ctx.evidence[id - 1] as SearchHit)),
    };
  }

  private generateExtractive(query: string, evidence: SearchHit[], weight: (term: string) => number, wantsNumber: boolean): Omit<ChatResponse, "debug"> {
    const composed = composeExtractive(query, evidence, 3, weight, wantsNumber);
    if (!composed) return this.abstain([]);
    return {
      answer: composed.answer,
      abstained: false,
      route: "extractive",
      citations: composed.usedEvidence.map((evidenceIndex, i) => toCitation(i + 1, evidence[evidenceIndex] as SearchHit)),
    };
  }

  /** Honest "not found" reply, offering contact details when we know them. */
  private abstain(facts: ReturnType<KnowledgeStore["getFacts"]>): Omit<ChatResponse, "debug"> {
    // When declining, offer one email and one phone, not every department address on the site.
    const contact = answerFromFacts(facts, { maxEmails: 1, maxPhones: 1 });
    return contact
      ? { answer: `${ABSTAIN_TEXT} ${contact.answer}`, abstained: true, route: "abstain", citations: contact.citations }
      : { answer: ABSTAIN_TEXT, abstained: true, route: "abstain", citations: [] };
  }

  private debug(query: string, evidence: readonly SearchHit[], cov: number, issues: string[], timings: Record<string, number>): ChatDebug {
    return { rewrittenQuery: query, hitCount: evidence.length, topScore: evidence[0]?.score ?? 0, coverage: cov, issues, timingsMs: timings };
  }
}

/**
 * For "how many / when / how much" questions, nudge passages containing a figure above near-ties.
 * The bonus is small and relative (15% of the best score), so it reorders close calls but can
 * never promote an irrelevant passage over a clearly better one.
 */
function preferNumbersWhenAsked(question: string, hits: SearchHit[]): SearchHit[] {
  if (!expectsNumber(question) || hits.length === 0) return hits;
  const bonus = (hits[0]?.score ?? 0) * 0.15;
  return hits
    .map((hit) => (containsNumber(hit.chunk.text) ? { ...hit, score: hit.score + bonus } : hit))
    .sort((a, b) => b.score - a.score);
}

const ABSTAIN_TEXT = "I couldn't find that on this website. You may want to contact the team directly.";

function toCitation(id: number, hit: SearchHit): Citation {
  return { id, url: hit.chunk.pageUrl, title: hit.chunk.pageTitle, snippet: truncate(hit.chunk.text, 220) };
}

// Re-exported for callers that only need the heuristic (e.g. tests).
export { rewriteHeuristic };
