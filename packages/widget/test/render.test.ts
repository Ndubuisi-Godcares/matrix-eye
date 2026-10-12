// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Citation } from "@matrix-eye/sdk";
import { contrast, normalizeHex, readableTextOn } from "../src/colors";
import { hostOf, renderAnswer, renderSources, safeUrl } from "../src/render";

const cite = (id: number, url = `https://school.edu/page${id}`, title = `Page ${id}`): Citation => ({ id, url, title, snippet: "" });

/** Render into a container so we can inspect the resulting markup. */
function html(text: string, citations: Citation[] = []): HTMLElement {
  const box = document.createElement("div");
  box.appendChild(renderAnswer(text, citations));
  return box;
}

describe("safeUrl", () => {
  it("allows http and https only", () => {
    expect(safeUrl("https://school.edu/a")).toBe("https://school.edu/a");
    expect(safeUrl("http://school.edu")).toBe("http://school.edu/");
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:x", "file:///etc/passwd", "//evil.com", "not a url", ""]) {
      expect(safeUrl(bad), bad).toBeNull();
    }
  });
  it("extracts a readable host", () => {
    expect(hostOf("https://www.school.edu/x")).toBe("school.edu");
    expect(hostOf("nonsense")).toBe("");
  });
});

describe("hostile answers stay inert text (no cross-site scripting)", () => {
  const attacks = [
    "<img src=x onerror=alert(1)>",
    "<script>alert(1)</script>",
    "<svg onload=alert(1)>",
    '<a href="javascript:alert(1)">click</a>',
    '"><iframe src="https://evil.example"></iframe>',
    "<style>*{display:none}</style>",
    "&lt;b&gt;already escaped&lt;/b&gt;",
  ];

  it.each(attacks)("shows %j as visible text and creates no elements from it", (attack) => {
    const box = html(`Here is the answer: ${attack} and more`);
    expect(box.querySelector("script, img, svg, iframe, style, a")).toBeNull();
    expect(box.textContent).toContain(attack);
  });

  it("does not execute handlers or inject elements even inside lists and bold", () => {
    const box = html("- <img src=x onerror=alert(1)>\n- **<script>alert(1)</script>**");
    expect(box.querySelector("img, script")).toBeNull();
    expect(box.querySelectorAll("li")).toHaveLength(2);
    expect(box.querySelector("strong")?.textContent).toBe("<script>alert(1)</script>");
  });

  it("never turns a citation with an unsafe URL into a link", () => {
    const box = html("See [1].", [cite(1, "javascript:alert(1)")]);
    expect(box.querySelector("a")).toBeNull();
    expect(box.querySelector("sup")?.textContent).toBe("1");
    expect(renderSources([cite(1, "javascript:alert(1)")], "Sources")).toBeNull();
  });

  it("escapes hostile titles in source lists", () => {
    const sources = renderSources([cite(1, "https://school.edu/a", "<img src=x onerror=alert(1)>")], "Sources")!;
    expect(sources.querySelector("img")).toBeNull();
    expect(sources.querySelector("a")?.textContent).toBe("<img src=x onerror=alert(1)>");
  });
});

describe("formatting", () => {
  it("makes paragraphs from blank lines and line breaks from single newlines", () => {
    const box = html("First line\nsecond line\n\nNew paragraph");
    expect(box.querySelectorAll("p")).toHaveLength(2);
    expect(box.querySelector("p br")).not.toBeNull();
  });

  it("renders bullet and numbered lists", () => {
    const box = html("Options:\n- one\n- two\n\n1. first\n2. second");
    expect(box.querySelector("ul")?.children).toHaveLength(2);
    expect(box.querySelector("ol")?.children).toHaveLength(2);
    expect(box.querySelector("p")?.textContent).toBe("Options:");
  });

  it("renders **bold** but leaves unmatched asterisks alone", () => {
    expect(html("This is **important** now").querySelector("strong")?.textContent).toBe("important");
    expect(html("2 * 3 = 6 and **unclosed").querySelector("strong")).toBeNull();
  });

  it("returns nothing for empty text", () => {
    expect(html("").childElementCount).toBe(0);
  });
});

describe("citations", () => {
  it("turns [n] markers into accessible links that open safely in a new tab", () => {
    const a = html("Fees are $4,500 [1].", [cite(1, "https://school.edu/tuition", "Tuition")]).querySelector("sup a") as HTMLAnchorElement;
    expect(a.href).toBe("https://school.edu/tuition");
    expect(a.target).toBe("_blank");
    expect(a.rel).toBe("noopener noreferrer");
    expect(a.getAttribute("aria-label")).toBe("Source 1: Tuition (opens in a new tab)");
  });

  it("keeps a marker attached to the word before it so it cannot wrap alone", () => {
    const p = html("Costs $4,500 per year [1].", [cite(1)]).querySelector("p")!;
    const textBefore = p.firstChild!.textContent!;
    expect(textBefore.endsWith("year\u2060")).toBe(true); // no space, a word joiner instead
    expect(p.textContent).toContain("year\u20601."); // marker follows immediately
  });

  it("handles grouped markers like [1, 2]", () => {
    expect(html("Both agree [1, 2].", [cite(1), cite(2)]).querySelectorAll("sup a")).toHaveLength(2);
  });

  it("shows a marker that points at no source exactly as written", () => {
    const box = html("Unknown [7] source", [cite(1)]);
    expect(box.querySelector("sup")).toBeNull();
    expect(box.textContent).toContain("[7]");
  });

  it("lists each distinct page once, keeping the number the answer refers to", () => {
    const sources = renderSources([cite(1, "https://school.edu/a"), cite(2, "https://school.edu/a"), cite(3, "https://school.edu/b")], "Sources")!;
    expect(sources.querySelectorAll("li")).toHaveLength(2);
    expect(sources.querySelector("p")?.textContent).toBe("Sources");
    expect((sources.querySelectorAll("li")[1] as HTMLLIElement).value).toBe(3);
    expect(renderSources([], "Sources")).toBeNull();
  });
});

describe("brand colours", () => {
  it("accepts only well-formed hex colours (the value is placed into CSS)", () => {
    expect(normalizeHex("#0F2238")).toBe("#0f2238");
    expect(normalizeHex("#abc")).toBe("#aabbcc");
    for (const bad of ["red", "#12", "#12345", "#gggggg", "url(javascript:x)", "#fff; background:url(x)", "", null, undefined]) expect(normalizeHex(bad as string), String(bad)).toBeNull();
  });

  it("chooses readable text for any background", () => {
    expect(readableTextOn("#0f2238")).toBe("#ffffff");
    expect(readableTextOn("#ffffff")).toBe("#0f2238");
    for (const bg of ["#c19a5b", "#ffcc00", "#222222", "#e63946", "#2a9d8f"]) {
      expect(contrast(bg, readableTextOn(bg)), bg).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("brand navy on white and on the gold accent meet WCAG AA", () => {
    expect(contrast("#0f2238", "#ffffff")).toBeGreaterThan(14);
    expect(contrast("#0f2238", "#c19a5b")).toBeGreaterThan(4.5);
  });
});
