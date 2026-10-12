import { describe, expect, it } from "vitest";
import { wordCount, type CrawledPage } from "@matrix-eye/core";
import { chunkPage } from "../src";

function page(sections: CrawledPage["sections"]): CrawledPage {
  return {
    url: "https://example.com/p",
    canonicalUrl: "https://example.com/p",
    title: "Page",
    description: "",
    sections,
    text: sections.map((s) => s.text).join("\n"),
    contentHash: "h",
    fetchedAt: "2026-01-01T00:00:00Z",
  };
}

/** n distinct words forming a single sentence-free paragraph. */
const words = (n: number, prefix = "w") => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" ");
/** n sentences of ten words each. */
const sentences = (n: number) => Array.from({ length: n }, (_, i) => `${words(10, `s${i}x`)}.`).join(" ");

describe("chunkPage", () => {
  it("keeps a short section as one chunk carrying its heading path", () => {
    const chunks = chunkPage(page([{ headingPath: ["Admissions", "Deadlines"], text: "Apply by 30 June." }]));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.headingPath).toEqual(["Admissions", "Deadlines"]);
    expect(chunks[0]?.position).toBe(0);
  });

  it("never merges text across headings", () => {
    const chunks = chunkPage(
      page([
        { headingPath: ["A"], text: "alpha text here" },
        { headingPath: ["B"], text: "beta text here" },
      ]),
    );
    expect(chunks.map((c) => c.headingPath[0])).toEqual(["A", "B"]);
    expect(chunks[0]?.text).not.toContain("beta");
  });

  it("splits long sections on sentence boundaries and respects the maximum size", () => {
    const chunks = chunkPage(page([{ headingPath: ["Long"], text: sentences(60) }]), { targetWords: 100, maxWords: 150, overlapWords: 0 });
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(wordCount(c.text)).toBeLessThanOrEqual(150);
  });

  it("overlaps neighbouring chunks of one section so boundary facts stay findable", () => {
    const chunks = chunkPage(page([{ headingPath: ["Long"], text: sentences(40) }]), { targetWords: 80, maxWords: 140, overlapWords: 15 });
    const firstTail = chunks[0]!.text.split(/\s+/).slice(-15).join(" ");
    expect(chunks[1]!.text.startsWith(firstTail)).toBe(true);
  });

  it("merges a tiny trailing fragment into the previous chunk", () => {
    const text = `${sentences(17)}\n${words(5, "tail")}`;
    const chunks = chunkPage(page([{ headingPath: ["X"], text }]), { targetWords: 160, maxWords: 260, overlapWords: 0, minWords: 25 });
    expect(chunks.at(-1)!.text).toContain("tail4");
    expect(wordCount(chunks.at(-1)!.text)).toBeGreaterThanOrEqual(25);
  });

  it("produces deterministic ids that change when the text changes", () => {
    const a = chunkPage(page([{ headingPath: ["A"], text: "same text" }]));
    const b = chunkPage(page([{ headingPath: ["A"], text: "same text" }]));
    const c = chunkPage(page([{ headingPath: ["A"], text: "different text" }]));
    expect(a[0]?.id).toBe(b[0]?.id);
    expect(a[0]?.id).not.toBe(c[0]?.id);
  });

  it("returns nothing for an empty page", () => {
    expect(chunkPage(page([]))).toEqual([]);
  });
});
