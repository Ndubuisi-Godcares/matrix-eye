/**
 * Site-wide facts in one place, so a name, address or link is changed once.
 *
 * Values marked PLACEHOLDER are decisions still open (domain, legal entity, contact address). They are deliberately
 * obvious in the source so they are not forgotten before launch; `docs/website.md` lists them.
 */
export const SITE = {
  name: "Eagle's Eye",
  /** Short line used in titles and link previews. */
  tagline: "Turn any website into an assistant that cites its sources",
  /** Under about 160 characters so search results show it whole. */
  description: "Eagle's Eye reads your website and answers visitors in a chat window, citing the page behind every answer. Self-host it, or use the hosted service when it launches.",
  /** PLACEHOLDER: replace when the domain is chosen (set PUBLIC_SITE_URL at build time). */
  url: import.meta.env.PUBLIC_SITE_URL ?? "https://eagleseye.ai",
  /** PLACEHOLDER: the legal entity that operates the service. Shown on the legal pages. */
  legalEntity: import.meta.env.PUBLIC_LEGAL_ENTITY ?? "[Legal entity name to be added]",
  /** PLACEHOLDER: public contact address. When unset the site offers the contact form only. */
  contactEmail: import.meta.env.PUBLIC_CONTACT_EMAIL as string | undefined,
  /** Name of the crawler, matching the user-agent it sends (see /bot/). */
  botName: "EaglesEyeBot",
  year: 2026,
} as const;

export interface NavItem {
  label: string;
  href: string;
}

export const NAV: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Product", href: "/product/" },
  { label: "Docs", href: "/docs/" },
  { label: "Pricing", href: "/pricing/" },
  { label: "Guides", href: "/guides/" },
  { label: "Security", href: "/security/" },
];

export const FOOTER_GROUPS: Array<{ title: string; links: NavItem[] }> = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/product/" },
      { label: "Pricing", href: "/pricing/" },
      { label: "Join the waitlist", href: "/waitlist/" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Documentation", href: "/docs/" },
      { label: "Quickstart", href: "/docs/quickstart/" },
      { label: "API reference", href: "/docs/api/" },
      { label: "Guides", href: "/guides/" },
    ],
  },
  {
    title: "Trust",
    links: [
      { label: "Security", href: "/security/" },
      { label: "Crawler (EaglesEyeBot)", href: "/bot/" },
      { label: "Privacy policy (draft)", href: "/privacy/" },
      { label: "Terms (draft)", href: "/terms/" },
    ],
  },
  {
    title: "Company",
    links: [{ label: "Contact", href: "/contact/" }],
  },
];

/** Absolute URL for a path on this site (for canonical links, Open Graph and structured data). */
export const absoluteUrl = (path: string): string => new URL(path, SITE.url).toString();
