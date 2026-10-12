import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";
import type { Chunk, CrawledPage } from "@matrix-eye/core";
import { SqliteKnowledgeStore, buildMatchQuery, pagePrior, urlWords } from "../src";

const page = (url: string, title: string): CrawledPage => ({ url, canonicalUrl: url, title, description: "d", sections: [], text: "", contentHash: url, fetchedAt: "2026-01-01T00:00:00Z" });
const chunk = (url: string, title: string, headingPath: string[], text: string, position = 0): Chunk => ({ id: `${url}#${position}`, pageUrl: url, pageTitle: title, headingPath, text, position });

describe("URL signals", () => {
  it("turns a path into words for indexing", () => {
    expect(urlWords("https://x.edu/admission-aid/how-to-apply.html")).toBe("admission aid how to apply");
    expect(urlWords("https://x.edu/")).toBe("");
  });

  it("prefers shallow, evergreen pages and demotes news, archives and filtered views", () => {
    const home = pagePrior("https://x.edu/admissions");
    expect(pagePrior("https://x.edu/a/b/c/d")).toBeLessThan(home);
    expect(pagePrior("https://x.edu/news/update")).toBeLessThan(pagePrior("https://x.edu/other/update"));
    expect(pagePrior("https://x.edu/list?area=arts")).toBeLessThan(pagePrior("https://x.edu/list"));
    expect(home).toBeLessThanOrEqual(1);
    expect(pagePrior("https://x.edu/a/b/c/d/e/f/g/h")).toBeGreaterThan(0);
  });
});

describe("ranking with URL words and the authority prior", () => {
  it("ranks the page whose URL says 'apply' above one that merely mentions applying", () => {
    const store = new SqliteKnowledgeStore(":memory:");
    store.upsertPage("p", page("https://x.edu/how-to-apply", "Admissions"), [chunk("https://x.edu/how-to-apply", "Admissions", ["Steps"], "Complete the form online and submit your documents.")]);
    store.upsertPage("p", page("https://x.edu/blog/diary", "Diary"), [chunk("https://x.edu/blog/diary", "Diary", ["Monday"], "Today we talked about how to apply for things and apply again.")]);
    expect(store.search("p", "how do I apply", 2)[0]?.chunk.pageUrl).toBe("https://x.edu/how-to-apply");
  });

  it("builds an every-idea query that ignores words found everywhere", () => {
    const q = buildMatchQuery("admission criteria at riverside", "concepts", (w) => w === "riverside")!;
    expect(q).toContain('"admission"');
    expect(q).toContain('"requirements"'); // synonym of criteria
    expect(q).not.toContain("riverside");
    expect(q).toContain(" AND ");
    expect(buildMatchQuery("riverside", "concepts")).toBeNull(); // fewer than two ideas
  });

  it("requires every idea in titles/headings/URL for the label query", () => {
    expect(buildMatchQuery("application requirements", "labels")).toMatch(/^\{page_title heading_text url_text\} : \(/);
  });
});

describe("front page lookup", () => {
  it("returns the shortest URL with its description and opening text", () => {
    const store = new SqliteKnowledgeStore(":memory:");
    store.upsertPage("p", page("https://x.edu/about/history", "History"), [chunk("https://x.edu/about/history", "History", [], "Old story.")]);
    store.upsertPage("p", page("https://x.edu/", "Home"), [chunk("https://x.edu/", "Home", [], "We are a college."), chunk("https://x.edu/", "Home", [], "Second paragraph.", 1)]);
    expect(store.rootPage("p")).toMatchObject({ url: "https://x.edu/", title: "Home", description: "d" });
    expect(store.rootPage("p")?.text).toContain("We are a college.");
    expect(store.rootPage("nobody")).toBeNull();
  });
});

describe("schema migration", () => {
  const dir = mkdtempSync(join(tmpdir(), "matrix-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("rebuilds an older database instead of crashing, keeping non-derived tables", () => {
    const path = join(dir, "old.sqlite");
    const old = new DatabaseSync(path);
    // The Phase 1 layout: no url_text / description columns, user_version 0.
    old.exec("CREATE TABLE pages (project_id TEXT, url TEXT, title TEXT, content_hash TEXT, fetched_at TEXT, chunk_count INTEGER, PRIMARY KEY (project_id, url));");
    old.exec("CREATE TABLE chunks (rowid INTEGER PRIMARY KEY, id TEXT, project_id TEXT, page_url TEXT, page_title TEXT, heading_path TEXT, heading_text TEXT, text TEXT, position INTEGER);");
    old.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT);");
    old.exec("INSERT INTO projects VALUES ('keep-me', 'My project'); INSERT INTO pages VALUES ('p','https://x/','t','h','now',0);");
    old.close();

    const store = new SqliteKnowledgeStore(path);
    expect(store.listPages("p")).toEqual([]); // stale derived data discarded, to be re-crawled
    store.upsertPage("p", page("https://x.edu/a", "A"), [chunk("https://x.edu/a", "A", [], "hello world text")]);
    expect(store.search("p", "hello", 3)).toHaveLength(1);
    expect(store.connection.prepare("SELECT name FROM projects WHERE id = 'keep-me'").get()).toMatchObject({ name: "My project" });
    store.close();
  });
});
