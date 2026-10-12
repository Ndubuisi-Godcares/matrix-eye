import { describe, expect, it } from "vitest";
import { ReasoningFilter, stripReasoning } from "../src";

describe("stripReasoning", () => {
  it("removes thinking blocks and keeps the answer", () => {
    expect(stripReasoning("<think>The user wants a price. Source 1 says 4,500.</think>The fee is $4,500 [1].")).toBe("The fee is $4,500 [1].");
  });
  it("handles multi-line thoughts, several blocks and uppercase tags", () => {
    expect(stripReasoning("<think>\nline one\nline two\n</think>\n\nAnswer. <THINK>again</THINK>Done.")).toBe("Answer. Done.");
  });
  it("drops an unterminated thought (reply cut off mid-thought) rather than showing it", () => {
    expect(stripReasoning("Visible. <think>never finished")).toBe("Visible.");
  });
  it("leaves ordinary text, including angle brackets, alone", () => {
    expect(stripReasoning("Fees are < $5,000 and > $3,000.")).toBe("Fees are < $5,000 and > $3,000.");
  });
});

describe("ReasoningFilter (streaming)", () => {
  const run = (fragments: string[]) => {
    const f = new ReasoningFilter();
    return fragments.map((x) => f.push(x)).join("") + f.flush();
  };

  it("passes plain text through unchanged", () => {
    expect(run(["Hello ", "there ", "[1]."])).toBe("Hello there [1].");
  });
  it("hides a thought even when its tags are split across fragments", () => {
    expect(run(["<th", "ink>secret ", "reasoning</th", "ink>The answer", " is 42."])).toBe("The answer is 42.");
  });
  it("hides a thought delivered in one piece, and text before it", () => {
    expect(run(["Intro <think>hidden</think>Outro"])).toBe("Intro Outro");
  });
  it("does not swallow a lone '<' that is not a tag", () => {
    expect(run(["1 < 2 and ", "x<y"])).toBe("1 < 2 and x<y");
  });
  it("never leaks an unterminated thought", () => {
    expect(run(["Before <think>half a tho", "ught"])).toBe("Before ");
  });
});
