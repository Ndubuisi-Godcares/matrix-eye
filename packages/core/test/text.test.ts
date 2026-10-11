import { describe, expect, it } from "vitest";
import { contentTerms, contentWords, stem, truncate, wordCount } from "../src";

describe("text helpers", () => {
  it("removes stop words and keeps meaningful terms", () => {
    // contentTerms returns stems, so compare against stemmed expectations.
    expect(contentTerms("What are the tuition fees for Computer Science?")).toEqual(["tuition", "fees", "computer", "science"].map(stem));
  });

  it("keeps numbers, which matter for fees and years", () => {
    expect(contentWords("deadline for 2026 intake")).toEqual(["deadline", "2026", "intake"]);
  });

  it("stems consistently on both sides of a comparison", () => {
    expect(stem("programmes")).toBe(stem("programme"));
    expect(stem("fees")).toBe(stem("fee"));
    expect(stem("class")).toBe("class"); // double-s words are not plurals
  });

  it("does not stem the search-query words (the index stems them itself)", () => {
    expect(contentWords("nursing programmes")).toEqual(["nursing", "programmes"]);
  });

  it("counts words and truncates on a word boundary", () => {
    expect(wordCount("  one two   three ")).toBe(3);
    expect(wordCount("")).toBe(0);
    const t = truncate("alpha beta gamma delta epsilon zeta", 20);
    expect(t.endsWith("…")).toBe(true);
    expect(t.length).toBeLessThanOrEqual(21);
  });
});
