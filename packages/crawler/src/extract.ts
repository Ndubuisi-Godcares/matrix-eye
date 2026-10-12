/**
 * HTML -> structured main content.
 *
 * Goal: keep what a visitor would call "the page" (headings, paragraphs, lists, table rows)
 * and drop what they would call "the site chrome" (menus, footers, cookie banners, scripts).
 * Headings are preserved as a path (e.g. "Admissions > Deadlines") because that context is
 * what makes a short passage understandable and citable on its own.
 */
import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { isTag, isText, type AnyNode, type Element } from "domhandler";
import { collapseWhitespace, type CrawledPage, type PageSection } from "@eagles-eye/core";
import { normalizeUrl, isSameSite } from "./url";

export interface ExtractedContacts {
  emails: string[];
  phones: string[];
}

export interface ExtractResult {
  page: CrawledPage;
  /** Paragraphs removed because they read like instructions aimed at an AI (prompt injection). */
  suspiciousRemoved: number;
  /** Normalised same-document links, for the crawl frontier. */
  links: string[];
  /** True when the page asks not to be indexed (`<meta name="robots" content="noindex">`). */
  noindex: boolean;
  /** Contact details found anywhere on the page, including footers that are stripped from the text. */
  contacts: ExtractedContacts;
}

/** Elements that never contain readable content. */
const DROP_TAGS = new Set(["script", "style", "noscript", "template", "svg", "canvas", "iframe", "object", "embed", "form", "input", "select", "textarea", "button", "nav", "aside", "dialog"]);
/** Landmark roles that are site chrome rather than content. */
const DROP_ROLES = new Set(["navigation", "banner", "contentinfo", "complementary", "search", "dialog", "alertdialog"]);
/** Class/id fragments that almost always mean a cookie banner, ad or share bar. */
const NOISE_HINT = /(?:^|[\s_-])(?:cookie|consent|gdpr|advert|ads?|banner|popup|modal|newsletter|share|social|breadcrumb|skip-link|sidebar)(?:$|[\s_-])/i;

const HEADING = /^h([1-6])$/;
/** Elements whose whole text is one paragraph. */
const LEAF_BLOCKS = new Set(["p", "li", "dt", "dd", "pre", "figcaption", "caption", "summary", "address"]);

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
/** Conservative phone pattern: optional +country code, then 7+ digits with common separators. */
// Two shapes: US-style "(503) 771-1112", and groups of digits joined by spaces, dots or hyphens, with an
// optional +country code. The lookbehind also rejects a leading hyphen so a ZIP+4 ("97202-8199 503-771-1112")
// is not glued onto the phone number.
const PHONE = /(?<![\w/-])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?\d{2,4}[\s.-]\d{2,4}|\d{2,4}(?:[\s.-]\d{2,4}){2,4})(?![\w/])/g;

/**
 * Phrases that address an AI model rather than a human visitor. Real websites essentially never
 * contain them; hostile pages do, hoping a chatbot will obey. Paragraphs matching are removed at
 * extraction time. This is one layer of several (see engine/prompt.ts and engine/validate.ts):
 * it is a heuristic and cannot catch every phrasing.
 */
const INJECTION_PATTERNS: readonly RegExp[] = [
  /\b(ignore|disregard|forget|override)\b[^.]{0,40}\b(previous|prior|above|earlier|all|any)\b[^.]{0,30}\b(instructions?|prompts?|rules|guidelines)\b/i,
  /\b(system|admin(istrator)?|developer)\s+(notice|message|override|prompt|instruction)s?\s*:/i,
  /\byou\s+are\s+now\s+(an?\s+)?(ai|assistant|chatbot|language model|dan)\b/i,
  /\b(reveal|print|show|repeat)\b[^.]{0,20}\b(system prompt|your instructions|these rules)\b/i,
  /<\|?(system|im_start|im_end)\|?>/i,
];

export function looksLikePromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

function isHidden(el: Element): boolean {
  const { style = "", hidden, class: cls = "", id = "", role = "" } = el.attribs;
  if (hidden !== undefined || el.attribs["aria-hidden"] === "true") return true;
  if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(style)) return true;
  if (DROP_ROLES.has(role)) return true;
  return NOISE_HINT.test(`${cls} ${id}`);
}

/** Visible text of an element with whitespace collapsed. Skips dropped descendants. */
function textOf(node: AnyNode): string {
  if (isText(node)) return node.data;
  if (!isTag(node)) return "";
  if (DROP_TAGS.has(node.name) || isHidden(node)) return "";
  if (node.name === "br") return " ";
  return node.children.map(textOf).join(node.name === "td" || node.name === "th" ? " " : "");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function extractPage(html: string, url: string, fetchedAt = new Date().toISOString()): ExtractResult {
  const $ = cheerio.load(html);

  const robotsMeta = $('meta[name="robots" i]').attr("content") ?? "";
  const noindex = /noindex/i.test(robotsMeta);

  // Contacts are read from the whole body (footers hold the best contact details) but through the
  // same filter as the main content, so hostile text is excluded.
  const bodyEl = $("body").get(0);
  const bodyText = bodyEl && isTag(bodyEl) ? buildSections(bodyEl).sections.map((sec) => sec.text).join("\n") : "";
  const contacts = extractContacts($, bodyText);

  const links = unique(
    $("a[href]")
      .toArray()
      .filter((a) => !/nofollow/i.test(a.attribs.rel ?? ""))
      .map((a) => normalizeUrl(a.attribs.href ?? "", url))
      .filter((u): u is string => u !== null),
  );

  // Choose the content root: an explicit <main>/<article> beats the whole body.
  const root =
    $("main, [role=main]").toArray().find((el) => collapseWhitespace(textOf(el)).length > 100) ??
    $("article").first().get(0) ??
    $("body").get(0);

  const { sections, suspiciousRemoved } = root && isTag(root) ? buildSections(root) : { sections: [], suspiciousRemoved: 0 };
  const title =
    collapseWhitespace($('meta[property="og:title"]').attr("content") ?? "") ||
    collapseWhitespace($("title").first().text()) ||
    sections.find((s) => s.headingPath.length > 0)?.headingPath[0] ||
    url;
  const description = collapseWhitespace($('meta[name="description" i]').attr("content") ?? "");

  // A canonical link on another host would let a page claim to be someone else's: ignore it.
  const declaredCanonical = normalizeUrl($('link[rel="canonical"]').attr("href") ?? "", url);
  const canonicalUrl = declaredCanonical && isSameSite(declaredCanonical, url) ? declaredCanonical : (normalizeUrl(url) ?? url);

  const text = sections.map((s) => [...s.headingPath.slice(-1), s.text].filter(Boolean).join("\n")).join("\n\n");

  return {
    suspiciousRemoved,
    page: {
      url,
      canonicalUrl,
      title,
      description,
      sections,
      text,
      contentHash: createHash("sha256").update(text).digest("hex"),
      fetchedAt,
    },
    links,
    noindex,
    contacts,
  };
}

/** Walk the content root, grouping paragraphs under the heading that precedes them. */
function buildSections(root: Element): { sections: PageSection[]; suspiciousRemoved: number } {
  const sections: PageSection[] = [];
  let suspiciousRemoved = 0;
  /** Open headings by level, e.g. [ "Admissions", "Deadlines" ]. */
  const stack: Array<{ level: number; text: string }> = [];
  let paragraphs: string[] = [];
  let buffer = "";

  const path = () => stack.map((h) => h.text);
  /** Add a paragraph unless it reads like an instruction to an AI. */
  const addParagraph = (text: string) => {
    if (!text) return;
    if (looksLikePromptInjection(text)) {
      suspiciousRemoved++;
      return;
    }
    paragraphs.push(text);
  };
  const flushBuffer = () => {
    addParagraph(collapseWhitespace(buffer));
    buffer = "";
  };
  const closeSection = (headingPath: string[]) => {
    flushBuffer();
    const text = paragraphs.join("\n");
    if (text) sections.push({ headingPath, text });
    paragraphs = [];
  };

  function walk(el: Element): void {
    for (const child of el.children) {
      if (isText(child)) {
        buffer += child.data;
        continue;
      }
      if (!isTag(child) || DROP_TAGS.has(child.name) || isHidden(child)) continue;

      const heading = HEADING.exec(child.name);
      if (heading) {
        closeSection(path());
        const level = Number(heading[1]);
        while (stack.length && (stack[stack.length - 1]?.level ?? 0) >= level) stack.pop();
        const headingText = collapseWhitespace(textOf(child));
        if (headingText) stack.push({ level, text: headingText });
      } else if (child.name === "br") {
        buffer += " ";
      } else if (child.name === "tr") {
        // Keep table rows intact ("Programme | Fee | Duration") so a figure stays next to its label.
        flushBuffer();
        const cells = child.children.filter(isTag).filter((c) => c.name === "td" || c.name === "th").map((c) => collapseWhitespace(textOf(c))).filter(Boolean);
        if (cells.length) addParagraph(cells.join(" | "));
      } else if (LEAF_BLOCKS.has(child.name)) {
        flushBuffer();
        addParagraph(collapseWhitespace(textOf(child)));
      } else if (isInline(child.name)) {
        buffer += textOf(child);
      } else {
        // Generic container (div, section, ul, table, ...): descend.
        flushBuffer();
        walk(child);
        flushBuffer();
      }
    }
  }

  walk(root);
  closeSection(path());
  return { sections, suspiciousRemoved };
}

const INLINE_TAGS = new Set(["a", "abbr", "b", "bdi", "bdo", "cite", "code", "data", "dfn", "em", "i", "kbd", "mark", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr", "label"]);
function isInline(tag: string): boolean {
  return INLINE_TAGS.has(tag);
}

/**
 * Pull emails and phone numbers from mailto:/tel: links and from visible text.
 *
 * Only text that survived the prompt-injection filter is considered. Otherwise a hostile page
 * could plant "email scam@evil.example to claim your prize" and have it served back to visitors
 * as the organisation's official contact address.
 */
function extractContacts($: cheerio.CheerioAPI, trustedText: string): ExtractedContacts {
  const emails: string[] = [];
  const phones: string[] = [];

  /** An explicit contact link is ignored when the paragraph around it reads like an injection. */
  const linkIsTrusted = (el: Element) => !looksLikePromptInjection(collapseWhitespace($(el).closest("p, li, td, div").text()));

  $("a[href^='mailto:' i]").each((_, a) => {
    if (!linkIsTrusted(a)) return;
    const raw = decodeURIComponent((a.attribs.href ?? "").slice(7).split("?")[0] ?? "").trim();
    if (raw.includes("@")) emails.push(raw.toLowerCase());
  });
  const telLinks: string[] = [];
  $("a[href^='tel:' i]").each((_, a) => {
    if (!linkIsTrusted(a)) return;
    const raw = decodeURIComponent((a.attribs.href ?? "").slice(4)).trim();
    if (raw) telLinks.push(raw);
  });

  for (const m of trustedText.matchAll(EMAIL)) emails.push(m[0].toLowerCase());
  for (const m of trustedText.matchAll(PHONE)) {
    const digits = m[0].replace(/\D/g, "");
    // 7-15 digits is the valid range for phone numbers; this filters out years, prices and codes.
    if (digits.length >= 7 && digits.length <= 15 && /[\s.()+-]/.test(m[0])) phones.push(m[0].trim());
  }
  // A tel: link holds digits only ("+15550147788"); the page's own formatting ("+1 555 014 7788") is
  // what visitors recognise, so keep the link's number only if the visible text did not show it.
  const digitsOf = (p: string) => p.replace(/\D/g, "");
  // Same number if one is the other plus a country code ("+1 503..." vs "503...").
  const sameNumber = (a: string, b: string) => a.endsWith(b) || b.endsWith(a);
  const visibleDigits = phones.map(digitsOf);
  for (const link of telLinks) if (!visibleDigits.some((d) => sameNumber(d, digitsOf(link)))) phones.push(link);

  return { emails: unique(emails), phones: unique(phones) };
}
