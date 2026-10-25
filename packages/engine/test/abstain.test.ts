import { describe, expect, it } from "vitest";
import { composeAbstainText } from "../src/abstain";

describe("composeAbstainText", () => {
  it("varies the wording across different questions instead of one repeated stock sentence", () => {
    const questions = ["Do you have a pool?", "Who is the vice chancellor?", "What is the weather like?", "Can I bring my dog?"];
    const texts = new Set(questions.map((q) => composeAbstainText(q)));
    expect(texts.size).toBeGreaterThan(1);
  });

  it("is deterministic: the same question always gets the same wording", () => {
    const question = "Do you have a swimming pool?";
    expect(composeAbstainText(question)).toBe(composeAbstainText(question));
  });

  it("never uses the old generic stock phrase", () => {
    for (const q of ["a", "swimming pool", "vice chancellor", "opening hours", "parking"]) {
      expect(composeAbstainText(q).toLowerCase()).not.toContain("i couldn't find that on this website");
      expect(composeAbstainText(q).toLowerCase()).not.toContain("contact the team directly");
    }
  });

  it("names the closest page when one is given, without claiming it answers the question", () => {
    const text = composeAbstainText("Do you have a pool?", "Campus Facilities");
    expect(text).toContain("Campus Facilities");
    expect(text.toLowerCase()).toMatch(/may not|not fully/);
  });

  it("says nothing about a closest page when none is given", () => {
    const text = composeAbstainText("Do you have a pool?");
    expect(text).not.toContain("closest match");
  });
});
