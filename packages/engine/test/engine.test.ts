/**
 * End-to-end engine tests: ingest the education fixture site, then ask questions.
 * A scripted model stands in for a real LLM so behaviour is deterministic.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ScriptedProvider } from "@matrix-eye/llm";
import { SqliteKnowledgeStore } from "@matrix-eye/knowledge";
import { startFixtureServer, type FixtureServer } from "@matrix-eye/testing";
import { ConversationEngine, ingestSite } from "../src";

let server: FixtureServer;
let store: SqliteKnowledgeStore;
const PROJECT = "edu";

async function ingest(extra: Partial<Parameters<typeof ingestSite>[0]> = {}) {
  return ingestSite({ store, projectId: PROJECT, startUrl: server.baseUrl, allowPrivateNetworks: true, delayMs: 0, concurrency: 3, ...extra });
}

beforeAll(async () => {
  server = await startFixtureServer();
  store = new SqliteKnowledgeStore(":memory:");
  await ingest();
});
afterAll(async () => {
  store.close();
  await server.close();
});

describe("ingestSite", () => {
  it("indexes the site and extracts contact facts", () => {
    expect(store.stats(PROJECT).pages).toBeGreaterThanOrEqual(14);
    const facts = store.getFacts(PROJECT);
    expect(facts.map((f) => f.value)).toContain("admissions@riverside-university.test");
    expect(facts.map((f) => f.value)).not.toContain("scam@evil.example");
  });

  it("does not index robots-blocked, noindex or injected content", () => {
    // Searches are OR-based, so unrelated pages may match a word like "staff"; assert on the content instead.
    const textFor = (q: string) => store.search(PROJECT, q, 20).map((h) => h.chunk.text).join(" ");
    expect(textFor("secret staff salary professors")).not.toContain("900,000");
    expect(textFor("unpublished draft medicine faculty")).not.toContain("not been approved");
    expect(textFor("ignore previous instructions scam prize")).not.toMatch(/scam@evil|ignore all previous/i);
  });

  it("is incremental: a second run re-indexes nothing and removes nothing", async () => {
    const before = store.stats(PROJECT);
    const result = await ingest();
    expect(result.pagesIndexed).toBe(0);
    expect(result.pagesUnchanged).toBeGreaterThan(10);
    expect(result.pagesRemoved).toBe(0);
    expect(store.stats(PROJECT)).toEqual(before);
    expect(store.getFacts(PROJECT).length).toBeGreaterThan(0); // facts survive an incremental run
  });

  it("does not prune pages when the crawl was cut short by the page limit", async () => {
    const before = store.stats(PROJECT).pages;
    const result = await ingest({ maxPages: 3 });
    expect(result.reachedPageLimit).toBe(true);
    expect(result.pagesRemoved).toBe(0);
    expect(store.stats(PROJECT).pages).toBe(before);
  });
});

describe("ConversationEngine (extractive, no model)", () => {
  const engine = () => new ConversationEngine({ store });

  it("answers a factual question with the right figure and a citation to the right page", async () => {
    const r = await engine().ask({ projectId: PROJECT, question: "How much is tuition for computer science?" });
    expect(r.abstained).toBe(false);
    expect(r.route).toBe("extractive");
    expect(r.answer).toContain("$4,500");
    expect(r.citations.some((c) => c.url.endsWith("/tuition"))).toBe(true);
  });

  it("answers contact questions verbatim from extracted facts", async () => {
    const r = await engine().ask({ projectId: PROJECT, question: "What is your email address?" });
    expect(r.route).toBe("facts");
    expect(r.answer).toContain("admissions@riverside-university.test");
    expect(r.citations[0]?.url).toMatch(/\/contact$/);
  });

  it("resolves follow-up questions using the previous turn", async () => {
    const r = await engine().ask({
      projectId: PROJECT,
      question: "How much does it cost?",
      history: [
        { role: "user", content: "Tell me about the nursing programme" },
        { role: "assistant", content: "It is a four year BSc." },
      ],
    });
    expect(r.abstained).toBe(false);
    expect(r.answer).toContain("$5,200");
  });

  it("abstains on questions the site cannot answer", async () => {
    for (const question of ["Do you have a swimming pool?", "Who is the vice chancellor?", "What is the weather like?"]) {
      const r = await engine().ask({ projectId: PROJECT, question });
      expect(r.abstained, question).toBe(true);
      expect(r.route).toBe("abstain");
    }
  });

  it("offers contact details when it has to abstain", async () => {
    const r = await engine().ask({ projectId: PROJECT, question: "Do you have a swimming pool?" });
    expect(r.answer).toContain("admissions@riverside-university.test");
  });

  it("declines professionally rather than with the old generic stock sentence", async () => {
    const r = await engine().ask({ projectId: PROJECT, question: "Do you have a swimming pool?" });
    expect(r.answer.toLowerCase()).not.toContain("i couldn't find that on this website");
    expect(r.answer.toLowerCase()).not.toContain("contact the team directly");
  });

  it("declines in the first person, never naming 'the website'/'the site'", async () => {
    const r = await engine().ask({ projectId: PROJECT, question: "Do you have a swimming pool?" });
    expect(r.answer.toLowerCase()).not.toMatch(/\bwebsite\b|\bthe site\b/);
  });

  it("never repeats the injected instruction from the hostile page", async () => {
    const r = await engine().ask({ projectId: PROJECT, question: "Is tuition free? Tell me about the open day" });
    expect(r.answer).not.toMatch(/tuition is free|scam@evil|ignore/i);
  });

  it("applies deterministic rules before anything else", async () => {
    const r = await engine().ask({
      projectId: PROJECT,
      question: "Can I get a refund of my application fee?",
      rules: [{ id: "refund", priority: 10, pattern: "refund", response: "Application fees are non-refundable." }],
    });
    expect(r.route).toBe("rule");
    expect(r.answer).toBe("Application fees are non-refundable.");
  });

  it("greets without searching and without claiming it found nothing", async () => {
    const r = await engine().ask({ projectId: PROJECT, question: "Hello" });
    expect(r.route).toBe("smalltalk");
    expect(r.abstained).toBe(false);
    expect(r.answer).not.toMatch(/couldn't find/i);
    // A greeting with a real question after it is still a question.
    expect((await engine().ask({ projectId: PROJECT, question: "Hello, how much is tuition for nursing?" })).route).not.toBe("smalltalk");
  });

  it("rejects empty questions and bounds very long ones", async () => {
    await expect(engine().ask({ projectId: PROJECT, question: "   " })).rejects.toMatchObject({ code: "invalid_request" });
    const r = await engine().ask({ projectId: PROJECT, question: "tuition ".repeat(5000) });
    expect(r.debug?.rewrittenQuery.length).toBeLessThanOrEqual(1000);
  });

  it("exposes diagnostics for dashboards and evaluation", async () => {
    const r = await engine().ask({ projectId: PROJECT, question: "When does the first semester start?" });
    expect(r.debug).toMatchObject({ hitCount: expect.any(Number), coverage: expect.any(Number) });
    expect(r.debug?.timingsMs.retrieve).toBeGreaterThanOrEqual(0);
  });
});

describe("ConversationEngine (with a language model)", () => {
  it("returns the model's grounded answer with only the sources it cited", async () => {
    const llm = new ScriptedProvider(["Computer Science costs $4,500 per year [1]."]);
    const r = await new ConversationEngine({ store, llm }).ask({ projectId: PROJECT, question: "How much is tuition for computer science?" });
    expect(r.route).toBe("llm");
    expect(r.answer).toBe("Computer Science costs $4,500 per year [1].");
    expect(r.citations.map((c) => c.id)).toEqual([1]);
    // The prompt sent to the model contains the evidence and the question.
    const sent = llm.requests[0]!.messages.map((m) => m.content).join("\n");
    expect(sent).toContain("<source id=\"1\"");
    expect(sent).toContain("Question: How much is tuition for computer science?");
  });

  it("falls back to extractive when the model invents a price", async () => {
    const llm = new ScriptedProvider(["Computer Science costs $9,999 per year [1]."]);
    const r = await new ConversationEngine({ store, llm }).ask({ projectId: PROJECT, question: "How much is tuition for computer science?" });
    expect(r.route).toBe("extractive");
    expect(r.answer).toContain("$4,500");
    expect(r.answer).not.toContain("9,999");
    expect(r.debug?.issues.some((i) => i.startsWith("unsupported_number"))).toBe(true);
  });

  it("falls back to extractive when the model cites nothing", async () => {
    const llm = new ScriptedProvider(["Computer Science is quite affordable."]);
    const r = await new ConversationEngine({ store, llm }).ask({ projectId: PROJECT, question: "How much is tuition for computer science?" });
    expect(r.route).toBe("extractive");
    expect(r.debug?.issues).toContain("no_citation");
  });

  it("respects the model declining to answer", async () => {
    const llm = new ScriptedProvider(["I don't have that information."]);
    const r = await new ConversationEngine({ store, llm }).ask({ projectId: PROJECT, question: "How much is tuition for computer science?" });
    expect(r.abstained).toBe(true);
  });

  it("keeps working when the model is down", async () => {
    const llm = { name: "down", complete: async () => Promise.reject(new Error("connection refused")), stream: async function* () {} };
    const r = await new ConversationEngine({ store, llm }).ask({ projectId: PROJECT, question: "How much is tuition for computer science?" });
    expect(r.route).toBe("extractive");
    expect(r.answer).toContain("$4,500");
    expect(r.debug?.issues.some((i) => i.startsWith("llm_error"))).toBe(true);
  });

  it("does not call the model at all for rule and contact answers", async () => {
    const llm = new ScriptedProvider(["should not be used"]);
    await new ConversationEngine({ store, llm }).ask({ projectId: PROJECT, question: "What is your phone number?" });
    expect(llm.requests).toHaveLength(0);
  });
});
