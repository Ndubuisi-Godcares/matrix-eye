/**
 * The reply used whenever the engine declines to answer.
 *
 * Earlier versions returned one fixed sentence ("I couldn't find that on this website. You may want to contact
 * the team directly.") for every decline. That had two problems: the identical generic line for every question,
 * and a vague invitation to "contact the team" even when no contact method was known. A later revision fixed the
 * repetition but talked ABOUT the website in the third person ("this website doesn't cover...", "this website's
 * published content") — which reads like a bot reporting on an external resource it queried, not like someone who
 * works there and simply doesn't know. This version speaks in the first person throughout, the way a knowledgeable
 * member of staff would, and never names "the website" or "the site" at all. It never invents content: the only
 * facts referenced are a page's own title (real index metadata) and, via the caller, a contact detail already
 * looked up from the site's own pages.
 */

const OPENERS = ["I don't have that information to hand, I'm afraid.", "I'm not able to answer that one with confidence.", "I don't know that off-hand.", "That's not something I can answer accurately right now."] as const;

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
  const related = nearestPageTitle ? ` You might find something useful under "${nearestPageTitle}", though it may not answer this exactly.` : "";
  return `${opener}${related}`;
}
