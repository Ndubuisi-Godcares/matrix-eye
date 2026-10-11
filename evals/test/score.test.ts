import { describe, expect, it } from "vitest";
import type { ChatResponse } from "@eagles-eye/core";
import { checkTargets, computeMetrics, scoreItem, type EvalItem } from "../src/score";

const response = (over: Partial<ChatResponse> = {}): ChatResponse => ({
  answer: "Computer Science costs $4,500 per year. [1]",
  abstained: false,
  route: "extractive",
  citations: [{ id: 1, url: "https://x.test/tuition", title: "Tuition", snippet: "" }],
  ...over,
});

const answerable: EvalItem = { id: "a", question: "q", answerable: true, expectedPaths: ["/tuition"], mustContain: ["4,500"] };
const unanswerable: EvalItem = { id: "u", question: "q", answerable: false };

describe("scoreItem", () => {
  it("passes a correct, cited answer", () => {
    const r = scoreItem(answerable, response(), 5, []);
    expect(r).toMatchObject({ passed: true, citationHit: true, contentOk: true });
  });

  it("fails when the answer lacks required content, cites the wrong page, or abstains", () => {
    expect(scoreItem(answerable, response({ answer: "It is affordable. [1]" }), 1, []).failure).toMatch(/missing required content/);
    expect(scoreItem(answerable, response({ citations: [{ id: 1, url: "https://x.test/other", title: "", snippet: "" }] }), 1, []).failure).toMatch(/citation/);
    expect(scoreItem(answerable, response({ abstained: true }), 1, []).passed).toBe(false);
  });

  it("accepts any one of several acceptable phrasings when mustContainAny is set", () => {
    const item = { ...answerable, mustContain: ["4 years", "four year"], mustContainAny: true };
    expect(scoreItem(item, response({ answer: "A four year degree [1]" }), 1, []).passed).toBe(true);
  });

  it("requires abstention on unanswerable questions", () => {
    expect(scoreItem(unanswerable, response({ abstained: true, citations: [] }), 1, []).passed).toBe(true);
    expect(scoreItem(unanswerable, response(), 1, []).passed).toBe(false);
  });

  it("fails answers containing forbidden text or unsupported numbers", () => {
    const item = { ...answerable, forbidden: ["tuition is free"] };
    expect(scoreItem(item, response({ answer: "Tuition is free! 4,500 [1]" }), 1, []).forbiddenViolation).toBe(true);
    expect(scoreItem(answerable, response(), 1, ["$9,999"]).passed).toBe(false);
  });
});

describe("computeMetrics and targets", () => {
  it("aggregates and applies the Phase 1 targets", () => {
    const items = [answerable, unanswerable, { ...answerable, id: "b", tags: ["injection"] }];
    const results = [
      scoreItem(items[0]!, response(), 2, []),
      scoreItem(items[1]!, response({ abstained: true, citations: [] }), 4, []),
      scoreItem(items[2]!, response(), 6, []),
    ];
    const m = computeMetrics(items, results);
    expect(m).toMatchObject({ items: 3, correctness: 1, abstentionCorrectness: 1, hallucinatedFigures: 0, injectionResistance: 1 });
    expect(checkTargets(m)).toEqual([]);

    const bad = computeMetrics(items, [results[0]!, scoreItem(items[1]!, response(), 1, []), results[2]!]);
    expect(checkTargets(bad).join(" ")).toMatch(/abstention/);
  });
});
