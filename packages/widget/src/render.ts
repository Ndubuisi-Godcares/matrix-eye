/**
 * Turns an assistant's answer into DOM nodes.
 *
 * SECURITY. Answer text originates from a language model reading arbitrary web pages, so it must be treated
 * as hostile. Nothing here ever uses innerHTML or similar: every character of the answer is inserted with
 * `textContent`/`createTextNode`, which the browser treats as inert text, never markup. Links are only created
 * for http(s) URLs. A page that tricks the model into emitting "<img onerror=...>" or "javascript:..." therefore
 * produces visible text, not a script. The tests in test/render.test.ts pin this down.
 *
 * Supported formatting is deliberately tiny: paragraphs, "- " lists, "1. " lists, **bold**, and [n] citation
 * markers (which become superscript links to the cited page).
 */
import type { Citation } from "@matrix-eye/sdk";

/** Returns the URL only if it is a plain http(s) address; anything else (javascript:, data:, ...) is refused. */
export function safeUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export function hostOf(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,2}[.)]\s+(.*)$/;
/** **bold**, or a citation marker like [1] or [1, 3]. */
const INLINE = /\*\*([^*\n]+)\*\*|\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g;

function element<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className?: string): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag);
  if (className) el.className = className;
  return el;
}

/** Append inline content (text, bold, citation links) for one line. */
function appendInline(parent: Node, text: string, citations: Map<number, Citation>, doc: Document): void {
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    const isCitation = match[1] === undefined;
    let before = text.slice(last, index);
    // Keep a citation marker glued to the word before it: drop the space and add a WORD JOINER (U+2060), which
    // forbids a line break there. Otherwise the marker can wrap alone onto the next line.
    if (isCitation && before.trim() !== "") before = before.replace(/\s+$/, "") + "\u2060";
    if (before) parent.appendChild(doc.createTextNode(before));

    if (match[1] !== undefined) {
      const strong = element(doc, "strong");
      strong.textContent = match[1];
      parent.appendChild(strong);
    } else {
      const ids = (match[2] ?? "").split(",").map((n) => Number(n.trim()));
      const known = ids.filter((id) => citations.has(id));
      if (known.length === 0) {
        // A marker that points at nothing is shown as written rather than silently dropped.
        parent.appendChild(doc.createTextNode(match[0]));
      } else {
        known.forEach((id, i) => {
          const citation = citations.get(id) as Citation;
          const href = safeUrl(citation.url);
          const sup = element(doc, "sup", "ee-cite");
          if (href) {
            const a = element(doc, "a");
            a.href = href;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = String(id);
            a.setAttribute("aria-label", `Source ${id}: ${citation.title || hostOf(citation.url)} (opens in a new tab)`);
            sup.appendChild(a);
          } else {
            sup.textContent = String(id);
          }
          parent.appendChild(sup);
          if (i < known.length - 1) parent.appendChild(doc.createTextNode(" "));
        });
      }
    }
    last = index + match[0].length;
  }
  if (last < text.length) parent.appendChild(doc.createTextNode(text.slice(last)));
}

/** Render an answer's text as safe paragraphs and lists. */
export function renderAnswer(text: string, citations: Citation[], doc: Document = document): DocumentFragment {
  const byId = new Map(citations.map((c) => [c.id, c]));
  const fragment = doc.createDocumentFragment();

  let paragraph: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const p = element(doc, "p");
    paragraph.forEach((line, i) => {
      if (i > 0) p.appendChild(element(doc, "br"));
      appendInline(p, line, byId, doc);
    });
    fragment.appendChild(p);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const el = element(doc, list.tag);
    for (const item of list.items) {
      const li = element(doc, "li");
      appendInline(li, item, byId, doc);
      el.appendChild(li);
    }
    fragment.appendChild(el);
    list = null;
  };

  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? "ul" : "ol";
      if (list && list.tag !== tag) flushList();
      list ??= { tag, items: [] };
      list.items.push((bullet ?? numbered)?.[1] ?? "");
    } else if (line.trim() === "") {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return fragment;
}

/** The "Sources" list under an answer: each distinct page once, as a link that opens in a new tab. */
export function renderSources(citations: Citation[], heading: string, doc: Document = document): HTMLElement | null {
  const seen = new Set<string>();
  const unique = citations.filter((c) => {
    const href = safeUrl(c.url);
    if (!href || seen.has(href)) return false;
    seen.add(href);
    return true;
  });
  if (unique.length === 0) return null;

  const wrap = element(doc, "div", "ee-sources");
  const title = element(doc, "p", "ee-sources-title");
  title.textContent = heading;
  wrap.appendChild(title);

  const ol = element(doc, "ol");
  for (const c of unique) {
    const li = element(doc, "li");
    const a = element(doc, "a");
    a.href = safeUrl(c.url) as string;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = c.title || hostOf(c.url) || c.url;
    a.setAttribute("aria-label", `${a.textContent} (opens in a new tab)`);
    const host = element(doc, "span", "ee-host");
    host.textContent = hostOf(c.url);
    li.append(a, host);
    li.value = c.id; // keeps the number the answer's [n] markers refer to
    ol.appendChild(li);
  }
  wrap.appendChild(ol);
  return wrap;
}
