/**
 * Small, dependency-free text helpers shared by retrieval, query rewriting and validation.
 *
 * Deliberately simple: English-oriented stop words and a light suffix stemmer. They only
 * need to be consistent with each other. Heavy lifting (ranking, stemming for search) is
 * done by the SQLite FTS5 index; these helpers decide things like "did the evidence cover
 * the question?".
 */

const STOP_WORDS = new Set(
  (
    "a an and are as at be but by can could do does did for from had has have how i if in into is it its " +
    "me my of on or our please should so than that the their them then there these they this those to " +
    "us was we were what when where which who whom why will with would you your about tell know get " +
    "want need like any some also just more most much many very can't cant " +
    "must may might shall long take taking make making give go going come see look play join find work works " +
    "offer offers provide provides include includes use used using let am been being said say per each every other another " +
    "own same such only both either neither yes no not here there thing things way ways one ones lot lots kind sort " +
    "available possible list types type options option details detail information info"
  ).split(/\s+/),
);

/** Pronoun-like words that signal a follow-up question depending on earlier context. */
export const REFERENCE_WORDS = new Set(["it", "its", "they", "them", "their", "that", "those", "this", "these", "there", "he", "she", "one", "ones"]);

/**
 * Words that visitors use interchangeably with the words websites use ("cost" vs "tuition").
 * Keyword search cannot see that connection on its own, so queries are widened with these
 * groups. They only widen recall; BM25 still ranks passages by how well they actually match.
 * Generic institution/business vocabulary for v1; semantic retrieval (planned) supersedes this.
 */
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ["cost", "price", "fee", "fees", "tuition", "charge", "charges", "pay", "payment", "afford", "expensive", "cheap"],
  ["deadline", "due", "closing", "cutoff"],
  ["start", "starts", "begin", "begins", "commence", "commences"],
  ["apply", "applicant", "applicants", "application", "admission", "admissions", "enrol", "enroll", "enrolment", "enrollment", "register", "registration"],
  ["location", "located", "address", "directions", "situated", "visit", "find us", "map"],
  ["criteria", "criterion", "requirement", "requirements", "required", "eligibility", "eligible", "prerequisite", "prerequisites", "qualify", "qualification", "qualifications"],
  ["majors", "major", "subjects", "subject", "fields", "disciplines", "departments"],
  ["services", "service", "support", "resources", "offices", "facilities"],
  ["sport", "sports", "athletics", "athletic", "football", "basketball", "soccer", "gym", "team", "teams"],
  ["scholarship", "scholarships", "bursary", "bursaries", "grant", "funding", "financial"],
  ["accommodation", "hostel", "hostels", "housing", "dorm", "dormitory", "residence", "lodging"],
  ["hours", "opening", "schedule", "timetable"],
  ["course", "courses", "programme", "programmes", "program", "programs", "degree", "degrees", "major"],
];

/** stem -> every word in the same group, built once. */
const SYNONYM_INDEX: ReadonlyMap<string, readonly string[]> = (() => {
  const index = new Map<string, readonly string[]>();
  for (const group of SYNONYM_GROUPS) for (const word of group) index.set(stem(word), group);
  return index;
})();

/** Other words that mean roughly the same as `word` (empty if none known). */
export function synonymsOf(word: string): readonly string[] {
  return SYNONYM_INDEX.get(stem(word)) ?? [];
}

/** `words` plus their synonyms, original words first, de-duplicated. */
export function expandWithSynonyms(words: readonly string[]): string[] {
  const out = new Set(words);
  for (const w of words) for (const syn of synonymsOf(w)) out.add(syn);
  return [...out];
}

/** Lowercase, split on non-alphanumerics, keep digits (fees, years and codes matter). */
export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Cheap suffix stripper. Not linguistically correct, only consistent across both sides of a comparison. */
export function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith("ies")) w = w.slice(0, -3) + "y";
  else if (w.length > 4 && w.endsWith("es")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  // Drop a silent final "e" so "programme" and "programmes" (-> "programm") meet in the middle.
  if (w.length > 3 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

/** Meaningful words of a question: stop words removed, stemmed, de-duplicated, order preserved. */
export function contentTerms(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokenize(text)) {
    if (STOP_WORDS.has(token)) continue;
    const s = stem(token);
    if (s.length < 2 || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * Meaningful words with stop words removed but NOT stemmed. Used to build search queries:
 * the full-text index applies its own (Porter) stemmer, and stemming twice with two
 * different stemmers can make a query word stop matching its own inflection.
 */
export function contentWords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokenize(text)) {
    if (STOP_WORDS.has(token) || token.length < 2 || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

/** Number of whitespace-separated words. */
export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/** Collapse runs of whitespace (including newlines) to single spaces. */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Trim to roughly `max` characters on a word boundary, adding an ellipsis when cut. */
export function truncate(text: string, max: number): string {
  const t = collapseWhitespace(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}
