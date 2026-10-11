/**
 * Follow-up resolution.
 *
 * Visitors ask "What about the fees?" or "Does it include accommodation?" — questions that
 * only make sense given the previous turn. Search runs on a single string, so we first turn
 * the question into a standalone query. Two strategies:
 *
 *  1. heuristic (always available, no model): if the question is short or leans on a pronoun,
 *     borrow the key words of the previous user question.
 *  2. language-model rewrite (optional): asks the model for a standalone query, and falls back
 *     to the heuristic on any failure so a flaky model never breaks search.
 */
import { REFERENCE_WORDS, contentWords, tokenize, type ChatTurn } from "@eagles-eye/core";
import type { LlmProvider } from "@eagles-eye/llm";

/** A question with this few content words almost certainly relies on earlier context. */
const SHORT_QUESTION_TERMS = 2;

export function rewriteHeuristic(question: string, history: readonly ChatTurn[]): string {
  const previous = [...history].reverse().find((t) => t.role === "user");
  if (!previous) return question;

  const ownWords = contentWords(question);
  const leansOnContext = tokenize(question).some((w) => REFERENCE_WORDS.has(w)) || ownWords.length <= SHORT_QUESTION_TERMS;
  if (!leansOnContext) return question;

  const have = new Set(ownWords);
  const borrowed = contentWords(previous.content).filter((w) => !have.has(w));
  return borrowed.length ? `${question} ${borrowed.join(" ")}` : question;
}

const REWRITE_SYSTEM =
  "Rewrite the visitor's last message as one standalone search query for a website's search engine. " +
  "Resolve pronouns and omitted subjects using the conversation. Output only the query, no explanation.";

export async function rewriteQuery(
  question: string,
  history: readonly ChatTurn[],
  llm: LlmProvider | null,
  signal?: AbortSignal,
): Promise<string> {
  if (history.length === 0) return question;
  const fallback = rewriteHeuristic(question, history);
  if (!llm) return fallback;

  try {
    const transcript = history.map((t) => `${t.role === "user" ? "Visitor" : "Assistant"}: ${t.content}`).join("\n");
    const result = await llm.complete({
      messages: [
        { role: "system", content: REWRITE_SYSTEM },
        { role: "user", content: `${transcript}\nVisitor: ${question}\n\nStandalone query:` },
      ],
      maxTokens: 60,
      temperature: 0,
      signal,
    });
    const rewritten = result.text.split("\n")[0]?.replace(/^["']|["']$/g, "").trim() ?? "";
    // Reject empty or runaway output; the heuristic is a safe default.
    return rewritten.length >= 3 && rewritten.length <= 300 ? rewritten : fallback;
  } catch {
    return fallback;
  }
}
