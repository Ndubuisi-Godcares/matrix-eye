/** RSS feed of the guides, so people can follow new articles in a feed reader. */
import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { SITE } from "../data/site";

export async function GET(context: { site: URL }) {
  const guides = (await getCollection("guides")).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
  return rss({
    title: `${SITE.name} guides`,
    description: "Practical articles from building Matrix Eye.",
    site: context.site,
    items: guides.map((guide) => ({ title: guide.data.title, description: guide.data.description, pubDate: guide.data.date, link: `/guides/${guide.id}/` })),
  });
}
