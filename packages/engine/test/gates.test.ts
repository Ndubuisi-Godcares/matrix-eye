import { describe, expect, it } from "vitest";
import type { SearchHit } from "@matrix-eye/core";
import { stem } from "@matrix-eye/core";
import { containsNumber, expectsNumber, inverseDocumentFrequency, unsupportedKeyTerm } from "../src";

const hit = (text: string, headingPath: string[] = []): SearchHit => ({
  score: 1,
  chunk: { id: text, pageUrl: "https://x.test/p", pageTitle: "Page", headingPath, text, position: 0 },
});

/** Build a document-frequency map from sample chunk texts, the way the store does. */
function dfOf(texts: string[]): { df: Map<string, number>; chunks: number } {
  const df = new Map<string, number>();
  for (const t of texts) {
    for (const term of new Set(t.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.map(stem) ?? [])) df.set(term, (df.get(term) ?? 0) + 1);
  }
  return { df, chunks: texts.length };
}

describe("key-term gate", () => {
  const corpus = [
    "The university offers a degree in nursing with clinical placements.",
    "The university campus has a library and a gym.",
    "Our degree programmes include computer science and business.",
    "Tuition is paid in two instalments each year.",
  ];
  const { df, chunks } = dfOf(corpus);

  it("rejects a question whose most specific word the site never mentions", () => {
    // "degree" is common on this site, but "medicine" is the word that decides the answer.
    expect(unsupportedKeyTerm("Do you offer a medicine degree?", [hit(corpus[2]!)], df, chunks)).toBe(stem("medicine"));
    expect(unsupportedKeyTerm("Do you have a swimming pool?", [hit(corpus[1]!)], df, chunks)).not.toBeNull();
  });

  it("passes when the specific word is present in the evidence", () => {
    expect(unsupportedKeyTerm("Tell me about nursing placements", [hit(corpus[0]!)], df, chunks)).toBeNull();
  });

  it("accepts a synonym of a site word (cost -> tuition)", () => {
    expect(unsupportedKeyTerm("How much does it cost?", [hit(corpus[3]!)], df, chunks)).toBeNull();
  });

  it("fails when the word exists on the site but the retrieved evidence does not support it", () => {
    expect(unsupportedKeyTerm("What are the nursing placements like?", [hit(corpus[1]!)], df, chunks)).not.toBeNull();
  });

  it("is lenient for questions with no content words and for empty sites", () => {
    expect(unsupportedKeyTerm("and those?", [], df, chunks)).toBeNull();
    expect(unsupportedKeyTerm("anything specific", [], new Map(), 0)).toBeNull();
  });

  it("weights rare words above common ones", () => {
    expect(inverseDocumentFrequency("zzz", df, chunks)).toBeGreaterThan(inverseDocumentFrequency(stem("university"), df, chunks));
  });
});

describe("answer-type heuristics", () => {
  it.each([
    ["How many students are there?", true],
    ["How much does it cost?", true],
    ["When does the semester start?", true],
    ["What is the application deadline?", true],
    ["What time does the library open?", true],
    ["Can I pay tuition in instalments?", false],
    ["Tell me about the nursing programme", false],
    ["Do you have a gym?", false],
  ])("expectsNumber(%j) = %s", (question, expected) => {
    expect(expectsNumber(question)).toBe(expected);
  });

  it("detects figures in text", () => {
    expect(containsNumber("about 12,000 students")).toBe(true);
    expect(containsNumber("many students")).toBe(false);
  });
});
