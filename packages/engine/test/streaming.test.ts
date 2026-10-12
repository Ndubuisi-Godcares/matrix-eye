import { describe, expect, it } from "vitest";
import { ScriptedProvider } from "@matrix-eye/llm";
import { SqliteKnowledgeStore } from "@matrix-eye/knowledge";
import { ConversationEngine } from "../src";

/** A tiny indexed site, built directly in the store (no crawl needed). */
function siteStore() {
  const store = new SqliteKnowledgeStore(":memory:");
  const url = "https://x.test/tuition";
  store.upsertPage("p", { url, canonicalUrl: url, title: "Tuition", description: "", sections: [], text: "", contentHash: "h", fetchedAt: "now" }, [
    { id: "c1", pageUrl: url, pageTitle: "Tuition", headingPath: ["Fees"], text: "Computer Science tuition is $4,500 per year.", position: 0 },
  ]);
  return store;
}

describe("streaming answers", () => {
  it("delivers the model's text incrementally, then returns the validated answer", async () => {
    const store = siteStore();
    const llm = new ScriptedProvider(["Computer Science tuition is $4,500 per year [1]."]);
    const pieces: string[] = [];
    const response = await new ConversationEngine({ store, llm }).ask({ projectId: "p", question: "How much is computer science tuition?", onToken: (t) => pieces.push(t) });

    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.join("").trim()).toBe(response.answer);
    expect(response.route).toBe("llm");
  });

  it("returns a different final answer when validation rejects what was streamed", async () => {
    const store = siteStore();
    const llm = new ScriptedProvider(["Computer Science tuition is $9,999 per year [1]."]); // invented figure
    const pieces: string[] = [];
    const response = await new ConversationEngine({ store, llm }).ask({ projectId: "p", question: "How much is computer science tuition?", onToken: (t) => pieces.push(t) });

    expect(pieces.join("")).toContain("9,999"); // provisional text did reach the caller...
    expect(response.answer).not.toContain("9,999"); // ...but the authoritative answer replaces it
    expect(response.route).toBe("extractive");
  });

  it("does not stream for instant routes", async () => {
    const pieces: string[] = [];
    const response = await new ConversationEngine({ store: siteStore(), llm: new ScriptedProvider(["unused"]) }).ask({ projectId: "p", question: "Hello", onToken: (t) => pieces.push(t) });
    expect(response.route).toBe("smalltalk");
    expect(pieces).toEqual([]);
  });

  it("works without a model (extractive answers are returned whole)", async () => {
    const pieces: string[] = [];
    const response = await new ConversationEngine({ store: siteStore() }).ask({ projectId: "p", question: "How much is computer science tuition?", onToken: (t) => pieces.push(t) });
    expect(response.answer).toContain("$4,500");
    expect(pieces).toEqual([]);
  });
});
