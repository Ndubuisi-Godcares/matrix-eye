import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SqliteKnowledgeStore } from "@matrix-eye/knowledge";
import { startFixtureServer, type FixtureServer } from "@matrix-eye/testing";
import { ConversationEngine, ingestSite, isOverviewQuestion } from "../src";

describe("isOverviewQuestion", () => {
  it.each([
    ["What is the site all about?", true],
    ["What is this website about?", true],
    ["Tell me about the college", true],
    ["Who are you?", true],
    ["What do you do?", true],
    ["Give me an overview", true],
    ["Tell me about the nursing programme", false],
    ["What is the tuition for nursing?", false],
    ["What is the application deadline?", false],
    ["How do I apply?", false],
  ])("%j -> %s", (question, expected) => {
    expect(isOverviewQuestion(question)).toBe(expected);
  });
});

describe("overview answers", () => {
  let server: FixtureServer;
  let store: SqliteKnowledgeStore;
  beforeAll(async () => {
    server = await startFixtureServer();
    store = new SqliteKnowledgeStore(":memory:");
    await ingestSite({ store, projectId: "p", startUrl: server.baseUrl, allowPrivateNetworks: true, delayMs: 0, concurrency: 3 });
  });
  afterAll(async () => {
    store.close();
    await server.close();
  });

  it("answers from the front page and cites it", async () => {
    const r = await new ConversationEngine({ store }).ask({ projectId: "p", question: "What is this website all about?" });
    expect(r.route).toBe("overview");
    expect(r.answer).toContain("public university");
    expect(new URL(r.citations[0]!.url).pathname).toBe("/");
  });

  it("does not hijack questions that name a topic", async () => {
    const r = await new ConversationEngine({ store }).ask({ projectId: "p", question: "Tell me about the nursing programme" });
    expect(r.route).not.toBe("overview");
  });

  it("falls through to normal search when no pages are indexed yet", async () => {
    const empty = new SqliteKnowledgeStore(":memory:");
    const r = await new ConversationEngine({ store: empty }).ask({ projectId: "none", question: "What is this site about?" });
    expect(r.route).toBe("abstain");
    empty.close();
  });

  it("offers one email and one phone, not every address, when it has to decline", async () => {
    const r = await new ConversationEngine({ store }).ask({ projectId: "p", question: "Do you have a swimming pool?" });
    expect(r.answer.match(/@/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });
});
