/**
 * Answer validation: the last line of defence against fluent-but-wrong output.
 *
 * Whatever the model says is checked against the evidence it was given:
 *  - citations must point at sources that exist (invented ones are removed);
 *  - an answer with no valid citation is not "grounded" and is rejected;
 *  - every figure in the answer (prices, dates, percentages, quantities) must appear in the
 *    evidence. This is the guard behind the "zero hallucinated prices" target: a model may
 *    paraphrase freely, but it may not introduce a number the website never stated.
 *
 * The engine reacts to issues by repairing (dropping bad citation markers) or by falling back
 * to an extractive answer built directly from the evidence.
 */
import { NO_ANSWER_PHRASE } from "./prompt";

export interface ValidationResult {
  /** Answer text with invalid citation markers removed. */
  answer: string;
  /** Distinct, valid source numbers cited, ascending. */
  citedIds: number[];
  /** Machine-readable problems found, e.g. "no_citation", "unsupported_number:7,500". */
  issues: string[];
  /** The model said it could not answer from the sources. */
  declined: boolean;
}

/** Citation markers: [1], [2], [1, 3], [1;2]. */
const CITATION = /\[(\d+(?:\s*[,;]\s*\d+)*)\]/g;
/** Numbers with optional currency prefix, thousands separators, decimals and percent sign. */
const NUMBER = /[$£€₦¥]?\s?\d[\d,]*(?:\.\d+)?\s?%?/g;

/** Canonical numeric form so "₦4,500.00" and "4500" compare equal. */
function normaliseNumber(raw: string): string {
  return raw.replace(/[$£€₦¥\s,%]/g, "").replace(/\.0+$/, "");
}

/** A number worth verifying: currency, percentage, 3+ digit figure or decimal. Single digits ("3 steps") are too common to police. */
function isSignificant(raw: string): boolean {
  const digits = normaliseNumber(raw);
  return /[$£€₦¥%]/.test(raw) || digits.length >= 3 || digits.includes(".");
}

export function validateAnswer(raw: string, sourceCount: number, evidenceText: string): ValidationResult {
  const issues: string[] = [];
  let answer = raw.trim();
  if (answer === "") return { answer, citedIds: [], issues: ["empty"], declined: false };

  const declined = answer.toLowerCase().replace(/[’‘]/g, "'").includes(NO_ANSWER_PHRASE.toLowerCase());

  // Repair citations: keep valid numbers, drop invented ones.
  const cited = new Set<number>();
  let removedInvalid = false;
  answer = answer.replace(CITATION, (_, list: string) => {
    const ids = list.split(/[,;]/).map((n) => Number(n.trim()));
    const valid = ids.filter((n) => n >= 1 && n <= sourceCount);
    if (valid.length !== ids.length) removedInvalid = true;
    valid.forEach((n) => cited.add(n));
    return valid.length ? `[${valid.join(", ")}]` : "";
  });
  answer = answer.replace(/\s{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
  if (removedInvalid) issues.push("invalid_citation");

  if (!declined) {
    if (cited.size === 0) issues.push("no_citation");

    // Every significant figure in the answer must be present in the evidence.
    const evidenceNumbers = new Set((evidenceText.match(NUMBER) ?? []).map(normaliseNumber));
    const answerBody = answer.replace(CITATION, " ");
    for (const match of answerBody.match(NUMBER) ?? []) {
      if (isSignificant(match) && !evidenceNumbers.has(normaliseNumber(match))) {
        issues.push(`unsupported_number:${match.trim()}`);
      }
    }
  }

  return { answer, citedIds: [...cited].sort((a, b) => a - b), issues, declined };
}
