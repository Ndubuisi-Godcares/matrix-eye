/**
 * Extractive answering: compose a reply directly from sentences found in the evidence.
 *
 * Used when no language model is configured, and as the safe fallback when a model's answer
 * fails validation or the model is unreachable. Because every word comes from the website,
 * it cannot hallucinate — at the cost of sounding like quoted text rather than a conversation.
 */
import { contentTerms, stem, synonymsOf, tokenize, type SearchHit } from "@eagles-eye/core";
import { containsNumber } from "./answer-type";

export interface ExtractiveAnswer {
  /** Answer text with [n] markers numbered in order of first use. */
  answer: string;
  /** Indexes into the evidence array, in citation-number order (marker [1] = usedEvidence[0]). */
  usedEvidence: number[];
}

interface Candidate {
  evidenceIndex: number;
  order: number;
  text: string;
  /** Fraction of the question's key words present in this sentence. */
  overlap: number;
  /** overlap plus a small rank bonus; used only for ordering. */
  score: number;
}

/** Split a block into sentences; table rows (which contain " | ") are kept whole. Decimal points do not split. */
function splitUnits(block: string): string[] {
  return block
    .split("\n")
    .flatMap((line) => (line.includes(" | ") ? [line.trim()] : line.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim())))
    .filter((s) => s.length > 0);
}

/** A sentence is quoted only if its relevance is at least this fraction of the best sentence's. */
const RELATIVE_CUTOFF = 0.75;

/** Weight of a question word when scoring sentences; defaults to equal weights. */
export type TermWeight = (term: string) => number;

export function composeExtractive(
  question: string,
  evidence: readonly SearchHit[],
  maxSentences = 3,
  weight: TermWeight = () => 1,
  /** The question asks for a number/date/amount, so sentences containing a figure are preferred. */
  wantsNumber = false,
): ExtractiveAnswer | null {
  if (evidence.length === 0) return null;
  const terms = contentTerms(question);

  const candidates: Candidate[] = [];
  evidence.forEach((hit, evidenceIndex) => {
    const units = splitUnits(hit.chunk.text);
    // The first pipe-delimited line in a chunk is normally a table header; reuse it as column context.
    const header = units.find((u) => u.includes(" | "));
    // Heading words give a sentence its context ("Sports" > "The university has football teams ...").
    const context = hit.chunk.headingPath.join(" ");
    units.forEach((unit, order) => {
      // Table rows are shown with their column names, and scored with them too, so a row matches
      // a question about "fees" through its "Annual tuition" column even if the row lacks the word.
      const text = unit.includes(" | ") && header && header !== unit ? `${unit} (columns: ${header})` : unit;
      const stems = new Set(tokenize(`${context} ${text}`).map(stem));
      const hasTerm = (t: string) => stems.has(t) || synonymsOf(t).some((syn) => stems.has(stem(syn)));
      // Rare question words count for more than common ones ("january" beats "apply").
      const total = terms.reduce((sum, t) => sum + weight(t), 0);
      const matched = terms.filter(hasTerm).reduce((sum, t) => sum + weight(t), 0);
      const overlap = total > 0 ? matched / total : 0;
      // Only reward a figure in a sentence that also relates to the question, never a stray number on its own.
      const figureBonus = wantsNumber && overlap > 0 && containsNumber(unit) ? 0.25 : 0;
      // A small bonus for higher-ranked passages breaks ties in favour of better sources.
      const score = overlap + figureBonus + 0.1 / (evidenceIndex + 1);
      candidates.push({ evidenceIndex, order, text, overlap, score });
    });
  });

  const related = candidates.filter((c) => c.overlap > 0 || terms.length === 0).sort((a, b) => b.score - a.score);
  // Quote only sentences nearly as relevant as the best one, so "tuition for nursing" returns the
  // nursing row rather than every programme's row that merely shares the word "tuition".
  const bestOverlap = related[0]?.overlap ?? 0;
  let chosen = related.filter((c) => c.overlap >= bestOverlap * RELATIVE_CUTOFF).slice(0, maxSentences);
  // Nothing overlapped the question: fall back to the opening of the best passage.
  if (chosen.length === 0) chosen = candidates.filter((c) => c.evidenceIndex === 0).slice(0, 2);

  // Present in reading order (source, then position), numbering citations by first appearance.
  chosen.sort((a, b) => a.evidenceIndex - b.evidenceIndex || a.order - b.order);
  const usedEvidence: number[] = [];
  const parts = chosen.map((c) => {
    let n = usedEvidence.indexOf(c.evidenceIndex) + 1;
    if (n === 0) {
      usedEvidence.push(c.evidenceIndex);
      n = usedEvidence.length;
    }
    const text = /[.!?)]$/.test(c.text) ? c.text : `${c.text}.`;
    return `${text} [${n}]`;
  });
  return { answer: parts.join(" "), usedEvidence };
}
