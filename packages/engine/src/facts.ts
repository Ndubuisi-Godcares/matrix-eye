/**
 * Structured facts: contact details.
 *
 * Emails and phone numbers are the classic things a language model gets subtly wrong (a
 * dropped digit, a plausible-looking invented address). So they are extracted verbatim at
 * crawl time and answered directly from that record, never generated.
 */
import { type Citation, type CrawledPage, type Fact } from "@eagles-eye/core";
import type { ExtractedContacts } from "@eagles-eye/crawler";

/** Questions asking how to reach the organisation. */
const CONTACT_INTENT = /\b(contact|e-?mail|phone|telephone|call|reach|get in touch|helpline|hotline)\b/i;

/** Addresses that are never useful to a visitor. */
const IGNORED_EMAIL = /^(noreply|no-reply|donotreply|do-not-reply|postmaster|webmaster|abuse|privacy|unsubscribe)@|@(example|sentry|wixpress)\./i;

/** Turn the contacts found on one page into facts attributed to that page. */
export function factsFromPage(page: CrawledPage, contacts: ExtractedContacts): Fact[] {
  const base = { pageUrl: page.url, pageTitle: page.title };
  return [
    ...contacts.emails.filter((e) => !IGNORED_EMAIL.test(e)).map((value): Fact => ({ kind: "email", value, ...base })),
    ...contacts.phones.map((value): Fact => ({ kind: "phone", value, ...base })),
  ];
}

/** Collapse duplicates across pages, keeping the first page each value was found on. */
export function dedupeFacts(facts: Fact[]): Fact[] {
  const seen = new Set<string>();
  return facts.filter((f) => {
    const key = `${f.kind}:${f.value.toLowerCase().replace(/[^a-z0-9@.+]/g, "")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isContactQuestion(question: string): boolean {
  return CONTACT_INTENT.test(question);
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Compose a contact answer from stored facts, or null if none are known.
 * Emails on the site's own domain are preferred over third-party addresses.
 */
export function answerFromFacts(facts: readonly Fact[], limits: { maxEmails?: number; maxPhones?: number } = {}): { answer: string; citations: Citation[] } | null {
  const rank = (f: Fact) => (f.kind === "email" && f.value.endsWith(`@${host(f.pageUrl)}`) ? 0 : 1);
  const emails = facts.filter((f) => f.kind === "email").sort((a, b) => rank(a) - rank(b)).slice(0, limits.maxEmails ?? 3);
  const phones = facts.filter((f) => f.kind === "phone").slice(0, limits.maxPhones ?? 2);
  if (emails.length === 0 && phones.length === 0) return null;

  const citations: Citation[] = [];
  const cite = (fact: Fact): number => {
    let existing = citations.find((c) => c.url === fact.pageUrl);
    if (!existing) {
      existing = { id: citations.length + 1, url: fact.pageUrl, title: fact.pageTitle, snippet: "" };
      citations.push(existing);
    }
    return existing.id;
  };

  const parts: string[] = [];
  if (emails.length) parts.push(`You can email ${emails.map((e) => `${e.value} [${cite(e)}]`).join(" or ")}.`);
  if (phones.length) parts.push(`You can call ${phones.map((p) => `${p.value} [${cite(p)}]`).join(" or ")}.`);
  for (const c of citations) c.snippet = [...emails, ...phones].filter((f) => f.pageUrl === c.url).map((f) => f.value).join(", ");
  return { answer: parts.join(" "), citations };
}
