/**
 * The reply used whenever the engine declines to answer.
 *
 * Earlier versions returned one fixed sentence ("I couldn't find that on this website. You may want to contact
 * the team directly.") for every decline, including a vague invitation to "contact the team" even when no contact
 * method was known. Visitors saw the identical, generic line regardless of the question, and a dead end with no
 * concrete next step when there was nothing to contact. This module fixes both: wording is picked from a small
 * set of professional phrasings (varied by question, not random, so the same question always reads the same way
 * in a test or a support screenshot), and the closest page retrieval found is named, if any, so a decline still
 * points somewhere useful. It never invents content: the only facts referenced are a page's own title (real
 * index metadata) and, via the caller, a contact detail already looked up from the site's own pages.
 */

const OPENERS = [
  "I don't have enough information from this website to answer that accurately.",
  "This website doesn't cover that in enough detail for me to answer confidently.",
  "I couldn't locate a reliable answer to that in the site's content.",
  "That question isn't addressed in this website's published content.",
] as const;

/**
 * Picks deterministically from a list using the question as the seed, so the same question always gets the same
 * wording (stable for tests and support screenshots) while different questions see different phrasing instead of
 * one repeated stock sentence.
 */
function pick<T>(options: readonly T[], seed: string): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (Math.imul(hash, 31) + seed.charCodeAt(i)) >>> 0;
  return options[hash % options.length] as T;
}

/** Builds the decline sentence(s), before any contact details the caller appends separately. */
export function composeAbstainText(question: string, nearestPageTitle?: string): string {
  const opener = pick(OPENERS, question);
  const related = nearestPageTitle ? ` The closest match I found was the "${nearestPageTitle}" page, though it may not fully cover this.` : "";
  return `${opener}${related}`;
}
