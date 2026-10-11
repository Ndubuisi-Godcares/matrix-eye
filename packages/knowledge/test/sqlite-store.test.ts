import { beforeEach, describe, expect, it } from "vitest";
import type { Chunk, CrawledPage } from "@eagles-eye/core";
import { SqliteKnowledgeStore, buildMatchQuery } from "../src";

function makePage(url: string, title: string, hash = "h1"): CrawledPage {
  return { url, canonicalUrl: url, title, description: "", sections: [], text: "", contentHash: hash, fetchedAt: "2026-01-01T00:00:00Z" };
}
function makeChunk(url: string, title: string, headingPath: string[], text: string, position = 0): Chunk {
  return { id: `${url}#${position}`, pageUrl: url, pageTitle: title, headingPath, text, position };
}

let store: SqliteKnowledgeStore;
beforeEach(() => {
  store = new SqliteKnowledgeStore(":memory:");
  store.upsertPage("p1", makePage("https://x.test/tuition", "Tuition"), [
    makeChunk("https://x.test/tuition", "Tuition", ["Fees"], "Computer Science costs $4,500 per year. Nursing costs $5,200 per year."),
  ]);
  store.upsertPage("p1", makePage("https://x.test/campus", "Campus Life"), [
    makeChunk("https://x.test/campus", "Campus Life", ["Library"], "The library is open from 8am to 10pm on weekdays."),
    makeChunk("https://x.test/campus", "Campus Life", ["Sports"], "Football and basketball teams train every week.", 1),
  ]);
});

describe("SqliteKnowledgeStore.search", () => {
  it("ranks the relevant passage first", () => {
    const hits = store.search("p1", "how much does nursing cost", 5);
    expect(hits[0]?.chunk.pageUrl).toBe("https://x.test/tuition");
    expect(hits[0]?.score).toBeGreaterThan(0);
  });

  it("matches inflections through stemming (fees/fee, teams/team)", () => {
    expect(store.search("p1", "fee", 5)[0]?.chunk.pageUrl).toBe("https://x.test/tuition");
    expect(store.search("p1", "team", 5)[0]?.chunk.headingPath).toEqual(["Sports"]);
  });

  it("weights headings and titles above body text", () => {
    store.upsertPage("p1", makePage("https://x.test/other", "Other"), [makeChunk("https://x.test/other", "Other", ["Misc"], "Mentions library once in a long unrelated passage about other things entirely.")]);
    const hits = store.search("p1", "library", 5);
    expect(hits[0]?.chunk.headingPath).toEqual(["Library"]);
  });

  it("isolates projects from each other", () => {
    expect(store.search("someone-else", "tuition", 5)).toEqual([]);
  });

  it("returns nothing for unmatched or empty queries", () => {
    expect(store.search("p1", "swimming pool", 5)).toEqual([]);
    expect(store.search("p1", "   ", 5)).toEqual([]);
  });

  it("is safe against FTS5 operator injection in user input", () => {
    for (const hostile of ['" OR 1=1 --', "tuition AND NOT (", "NEAR(a b)", "col:val *", "'; DROP TABLE chunks; --", '"unterminated']) {
      expect(() => store.search("p1", hostile, 5), hostile).not.toThrow();
    }
    expect(store.stats("p1").chunks).toBe(3); // nothing was dropped
  });
});

describe("buildMatchQuery", () => {
  it("quotes every term and ORs them (strict query uses only the user's words)", () => {
    expect(buildMatchQuery("What are the tuition fees?")).toBe('"tuition" OR "fees"');
  });

  it("widens queries with synonyms on request, keeping the user's own words first", () => {
    const q = buildMatchQuery("What are the tuition fees?", true)!;
    expect(q.startsWith('"tuition" OR "fees"')).toBe(true);
    expect(q).toContain('"cost"');
    expect(q.split(" OR ").every((t) => /^"[^"]+"$/.test(t))).toBe(true);
    expect(buildMatchQuery("where can I stay", true)).not.toContain("tuition");
  });

  it("falls back to raw tokens when the question is all stop words", () => {
    expect(buildMatchQuery("what is it")).not.toBeNull();
  });
  it("returns null for punctuation only", () => {
    expect(buildMatchQuery("?!")).toBeNull();
  });
});

describe("SqliteKnowledgeStore lifecycle", () => {
  it("replaces a page's chunks on upsert, leaving no stale text searchable", () => {
    store.upsertPage("p1", makePage("https://x.test/tuition", "Tuition", "h2"), [makeChunk("https://x.test/tuition", "Tuition", ["Fees"], "Everything is now free of charge.")]);
    expect(store.search("p1", "nursing", 5)).toEqual([]);
    expect(store.search("p1", "free charge", 5)).toHaveLength(1);
    expect(store.stats("p1")).toEqual({ pages: 2, chunks: 3 });
  });

  it("reports content hashes for incremental crawls", () => {
    expect(store.contentHashes("p1").get("https://x.test/tuition")).toBe("h1");
  });

  it("prunes pages that vanished from the site", () => {
    const removed = store.pruneMissingPages("p1", new Set(["https://x.test/tuition"]));
    expect(removed).toBe(1);
    expect(store.listPages("p1").map((p) => p.url)).toEqual(["https://x.test/tuition"]);
    expect(store.search("p1", "library", 5)).toEqual([]);
  });

  it("stores and replaces facts, and deletes a whole project", () => {
    store.replaceFacts("p1", [{ kind: "email", value: "a@x.test", pageUrl: "https://x.test/c", pageTitle: "Contact" }]);
    expect(store.getFacts("p1")).toHaveLength(1);
    store.replaceFacts("p1", []);
    expect(store.getFacts("p1")).toHaveLength(0);
    store.deleteProject("p1");
    expect(store.stats("p1")).toEqual({ pages: 0, chunks: 0 });
    expect(store.search("p1", "tuition", 5)).toEqual([]);
  });

  it("rolls back the whole page write if a chunk insert fails", () => {
    const bad = [makeChunk("https://x.test/new", "New", ["H"], "fine text"), { ...makeChunk("https://x.test/new", "New", ["H"], "x", 1), text: undefined as unknown as string }];
    expect(() => store.upsertPage("p1", makePage("https://x.test/new", "New"), bad)).toThrow();
    expect(store.listPages("p1").some((p) => p.url === "https://x.test/new")).toBe(false);
  });
});
