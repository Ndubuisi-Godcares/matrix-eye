/**
 * "What is this site about?" questions.
 *
 * Keyword search answers specific questions well and vague ones badly: "what is the site all about"
 * matches random sentences that happen to contain "site". The site's own front page, and the summary
 * it publishes about itself (the meta description), is the authoritative answer, so those questions
 * are routed straight to it.
 */
import { contentWords } from "@matrix-eye/core";

/** Phrasings that ask for a general description rather than a specific fact. */
const OVERVIEW_PHRASE = /\b(what\s+(is|are)\s+(this|the|your)|what'?s\s+(this|the|your)|tell\s+me\s+about|about\s+(this|the|your)|who\s+are\s+you|what\s+do\s+you\s+do|what\s+does\s+(this|the)|overview|introduce|describe|all\s+about)\b/i;

/** Words that name "the site itself" and so add no topic to the question. */
const SELF_REFERENCE = new Set(["site", "website", "web", "page", "pages", "college", "university", "school", "institution", "institute", "company", "organisation", "organization", "place", "platform", "project", "business", "app", "here", "about", "all", "everything", "something", "anything", "main", "purpose", "mission", "goal", "name", "give", "show", "overview", "summary", "introduce", "introduction", "describe", "description", "explain"]);

/**
 * True for broad questions with no topic of their own ("What is this site about?", "Tell me about
 * the college") and false when a topic is named ("Tell me about the nursing programme").
 */
export function isOverviewQuestion(question: string): boolean {
  if (!OVERVIEW_PHRASE.test(question)) return false;
  return contentWords(question).every((w) => SELF_REFERENCE.has(w));
}
