/**
 * The documentation manifest: which files in /docs are published, in what order, under which heading.
 * Titles and descriptions live here (not in the Markdown) so the files read cleanly on GitHub too.
 */
export interface DocPage {
  /** File name in /docs without ".md"; also the URL: /docs/<slug>/ */
  slug: string;
  title: string;
  description: string;
  group: "Getting started" | "Guides" | "Reference" | "Operations";
}

export const DOC_PAGES: DocPage[] = [
  { slug: "quickstart", title: "Quickstart", description: "Index a website and put the chat widget on a page, in about ten minutes.", group: "Getting started" },
  { slug: "how-it-works", title: "How it works", description: "How MatrixEye reads a site, finds evidence, answers, and decides when to say it does not know.", group: "Getting started" },
  { slug: "widget", title: "Chat widget", description: "Add the chat window to a website: settings, accessibility, security.", group: "Guides" },
  { slug: "sdk", title: "TypeScript SDK", description: "Create projects, crawl, chat and stream answers from Node or the browser.", group: "Guides" },
  { slug: "accuracy", title: "Accuracy and evaluation", description: "How answer quality is measured, what the numbers mean, and where the limits are.", group: "Guides" },
  { slug: "api", title: "API reference", description: "Every endpoint: projects, crawling, chat, streaming events, settings and feedback.", group: "Reference" },
  { slug: "self-hosting", title: "Self-hosting and models", description: "Run MatrixEye on your own machine or server with a local language model.", group: "Operations" },
  { slug: "troubleshooting", title: "Troubleshooting", description: "Fixes for the most common problems: empty crawls, blocked widgets, slow answers.", group: "Operations" },
  { slug: "changelog", title: "Changelog", description: "What changed in MatrixEye, release by release: new features, improvements and fixes, newest first.", group: "Operations" },
];

export const DOC_GROUPS = ["Getting started", "Guides", "Reference", "Operations"] as const;
