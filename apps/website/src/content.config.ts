/**
 * Content collections.
 *
 * - `docs`   : Markdown that lives in the repository's /docs folder, so one file serves GitHub readers and this site.
 *              Only the files listed in data/docs.ts are published; decision records and planning documents stay internal.
 * - `guides` : articles written for this site, in src/content/guides.
 */
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { DOC_PAGES } from "./data/docs";

const docs = defineCollection({
  loader: glob({ pattern: DOC_PAGES.map((page) => `${page.slug}.md`), base: "../../docs" }),
});

const guides = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/guides" }),
  schema: z.object({
    title: z.string().max(70),
    description: z.string().max(170),
    date: z.coerce.date(),
    author: z.string().default("The Eagle's Eye team"),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { docs, guides };
