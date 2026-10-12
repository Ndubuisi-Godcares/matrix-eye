import { describe, expect, it } from "vitest";
import { detectSmallTalk, shortSiteName, smallTalkReply } from "../src";

describe("detectSmallTalk", () => {
  it.each([
    ["Hello", "greeting"],
    ["hi there!", "greeting"],
    ["Hey", "greeting"],
    ["Good morning", "greeting"],
    ["hello assistant", "greeting"],
    ["Thanks", "thanks"],
    ["thank you so much", "thanks"],
    ["Bye", "goodbye"],
    ["no thanks", "goodbye"],
    ["That's all", "goodbye"],
    ["How are you?", "how-are-you"],
  ])("%j -> %s", (message, expected) => {
    expect(detectSmallTalk(message)).toBe(expected);
  });

  it.each([
    "Hello, what are the fees?",
    "Hi, how do I apply?",
    "thanks, and what about the deadline",
    "How are you different from other universities and colleges?",
    "What is the tuition?",
    "",
    "hello world this is a long greeting message",
  ])("does not swallow a real question: %j", (message) => {
    expect(detectSmallTalk(message)).toBeNull();
  });
});

describe("site names and replies", () => {
  it("shortens a page title to the site name", () => {
    expect(shortSiteName("AIIT | Azraa Institute of Information Technology")).toBe("AIIT");
    expect(shortSiteName("Reed College")).toBe("Reed College");
    expect(shortSiteName(undefined)).toBe("this website");
    expect(shortSiteName("")).toBe("this website");
  });
  it("greets with the site name", () => {
    expect(smallTalkReply("greeting", "AIIT")).toContain("AIIT");
  });
});
