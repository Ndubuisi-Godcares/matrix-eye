// Astro configuration for the Matrix Eye website (a static site: no server is needed to host it).
import sitemap from "@astrojs/sitemap";
import { satteri } from "@astrojs/markdown-satteri";
import { defineConfig } from "astro/config";
import { defineMdastPlugin } from "satteri";

/**
 * The public address of the site. A placeholder until the domain is chosen; set PUBLIC_SITE_URL when building for
 * production so canonical links, the sitemap and social previews point at the real address.
 */
const site = process.env.PUBLIC_SITE_URL ?? "https://matrixeye.ai";

/** Pages that must not appear in search results or the sitemap (drafts awaiting legal review). */
const UNLISTED = ["/privacy", "/terms", "/404"];

/**
 * Lets documentation written for GitHub readers (relative links such as `widget.md` or `sdk.md#errors`) work on
 * the website, where the same pages live at /docs/widget/ and /docs/sdk/#errors.
 */
const rewriteDocLinks = defineMdastPlugin({
  name: "rewrite-doc-links",
  link(node, ctx) {
    const match = /^(?:\.\/)?([a-z][a-z0-9-]*)\.md(#.*)?$/.exec(node.url);
    if (match) ctx.setProperty(node, "url", `/docs/${match[1]}/${match[2] ?? ""}`);
  },
});

/**
 * Each document starts with its own "# Title" so it reads well on GitHub. On the website the layout already shows
 * the title (from the manifest), so the duplicate heading is dropped to keep one h1 per page.
 */
const dropTitleHeading = defineMdastPlugin({
  name: "drop-title-heading",
  heading(node, ctx) {
    if (node.depth === 1) ctx.removeNode(node);
  },
});

export default defineConfig({
  site,
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [sitemap({ filter: (page) => !UNLISTED.some((path) => new URL(page).pathname === `${path}/`) })],
  markdown: {
    processor: satteri({ mdastPlugins: [dropTitleHeading, rewriteDocLinks] }),
    // Two colour themes in one build: the CSS picks the right one for light or dark mode (see global.css).
    shikiConfig: { themes: { light: "github-light-high-contrast", dark: "github-dark-high-contrast" }, defaultColor: false, wrap: false },
  },
  // Never inline scripts into pages: the Content-Security-Policy forbids inline code, and this keeps it strict.
  vite: { build: { assetsInlineLimit: 0 } },
  // Images are optimised at build time; nothing is fetched from other websites at run time.
  image: { service: { entrypoint: "astro/assets/services/sharp" } },
});
