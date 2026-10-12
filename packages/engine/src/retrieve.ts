/**
 * Evidence selection: from raw search hits to the passages an answer may be built on.
 */
import { contentTerms, stem, synonymsOf, tokenize, type SearchHit } from "@eagles-eye/core";
import { urlWords } from "@eagles-eye/knowledge";

/**
 * Pick up to `limit` hits in rank order, allowing at most `maxPerPage` from one page.
 * Without the cap, one long page can fill every slot and crowd out other relevant sources.
 */
export function selectEvidence(hits: readonly SearchHit[], limit: number, maxPerPage: number): SearchHit[] {
  const perPage = new Map<string, number>();
  const chosen: SearchHit[] = [];
  for (const hit of hits) {
    if (chosen.length >= limit) break;
    const used = perPage.get(hit.chunk.pageUrl) ?? 0;
    if (used >= maxPerPage) continue;
    perPage.set(hit.chunk.pageUrl, used + 1);
    chosen.push(hit);
  }
  return chosen;
}

/**
 * How much of the question the evidence actually covers: the fraction of the question's
 * meaningful words that occur somewhere in the evidence (text, headings or page titles).
 *
 * Full-text search happily returns *something* for any query. If "swimming pool" retrieves a
 * page that only shares the word "campus", coverage is low and we abstain instead of
 * stretching that page into a made-up answer.
 */
export function coverage(question: string, evidence: readonly SearchHit[]): number {
  const terms = contentTerms(question);
  if (terms.length === 0) return evidence.length > 0 ? 1 : 0;

  const haystack = new Set<string>();
  for (const { chunk } of evidence) {
    for (const token of tokenize(`${chunk.pageTitle} ${chunk.headingPath.join(" ")} ${urlWords(chunk.pageUrl)} ${chunk.text}`)) haystack.add(stem(token));
  }
  // A term is covered if the evidence contains it or a known synonym ("cost" is covered by "tuition").
  const covered = (term: string) => haystack.has(term) || synonymsOf(term).some((syn) => haystack.has(stem(syn)));
  return terms.filter(covered).length / terms.length;
}

/** How informative a word is within this site: rare words identify a topic, common ones do not. */
export function inverseDocumentFrequency(term: string, df: ReadonlyMap<string, number>, chunks: number): number {
  return Math.log(1 + chunks / (1 + (df.get(term) ?? 0)));
}

/** True when the site's vocabulary contains `term` or one of its synonyms (or a word sharing its first 5 letters). */
function siteKnowsTerm(term: string, df: ReadonlyMap<string, number>): boolean {
  if (df.has(term) || synonymsOf(term).some((syn) => df.has(stem(syn)))) return true;
  // Prefix match tolerates derivations the crude stemmer misses ("locate" ~ "location").
  if (term.length >= 5) {
    const prefix = term.slice(0, 5);
    for (const known of df.keys()) if (known.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * The key-term gate: find the most specific word of the visitor's own question and check the
 * evidence supports it.
 *
 * Generic coverage is not enough. "Do you offer a medicine degree?" shares "degree" with half the
 * site, but "medicine" is the word that decides the answer, and the site never mentions it. So we
 * take the rarest question word (highest IDF; words the site never uses count as the rarest) and
 * require it to be covered by the evidence, directly or by synonym.
 *
 * Returns the offending word, or null when the gate passes.
 */
export function unsupportedKeyTerm(
  originalQuestion: string,
  evidence: readonly SearchHit[],
  df: ReadonlyMap<string, number>,
  chunks: number,
): string | null {
  const terms = contentTerms(originalQuestion).filter((t) => t.length >= 3);
  if (terms.length === 0 || chunks === 0) return null;

  const haystack = new Set<string>();
  for (const { chunk } of evidence) {
    for (const token of tokenize(`${chunk.pageTitle} ${chunk.headingPath.join(" ")} ${urlWords(chunk.pageUrl)} ${chunk.text}`)) haystack.add(stem(token));
  }
  const covered = (term: string) => haystack.has(term) || synonymsOf(term).some((syn) => haystack.has(stem(syn)));

  // Words the site never uses (and has no synonym for) are maximally specific.
  const ranked = [...terms].sort((a, b) => inverseDocumentFrequency(b, df, chunks) - inverseDocumentFrequency(a, df, chunks));
  const mostSpecific = ranked[0];
  if (mostSpecific === undefined) return null;
  if (!siteKnowsTerm(mostSpecific, df)) return mostSpecific;
  return covered(mostSpecific) ? null : mostSpecific;
}
