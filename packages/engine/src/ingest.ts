/**
 * Ingestion: crawl a site and write its knowledge into the store.
 *
 *   crawl -> chunk -> upsert (page + chunks, atomically) -> prune vanished pages -> refresh facts
 *
 * Re-crawls are incremental: pages whose content hash is unchanged are not re-chunked or
 * re-indexed. Pages that disappeared from the site are pruned, but only after a *complete*
 * crawl. A crawl that stopped at the page limit or was aborted has not seen the whole site,
 * so pruning then would wrongly delete pages that merely weren't reached.
 */
import { crawlSite, type CrawlOptions, type CrawlSummary } from "@eagles-eye/crawler";
import type { Fact } from "@eagles-eye/core";
import { chunkPage, type KnowledgeStore } from "@eagles-eye/knowledge";
import { dedupeFacts, factsFromPage } from "./facts";

export interface IngestOptions extends Omit<CrawlOptions, "onPage" | "knownHashes"> {
  store: KnowledgeStore;
  projectId: string;
  /** Re-index every page even if its content is unchanged. */
  full?: boolean;
}

export interface IngestResult extends CrawlSummary {
  chunksWritten: number;
  pagesRemoved: number;
}

export async function ingestSite(options: IngestOptions): Promise<IngestResult> {
  const { store, projectId, full, ...crawlOptions } = options;
  const freshFacts: Fact[] = [];
  const reindexedUrls = new Set<string>();
  let chunksWritten = 0;

  const summary = await crawlSite({
    ...crawlOptions,
    knownHashes: full ? undefined : store.contentHashes(projectId),
    onPage: (page, contacts) => {
      const chunks = chunkPage(page);
      store.upsertPage(projectId, page, chunks);
      chunksWritten += chunks.length;
      reindexedUrls.add(page.url);
      freshFacts.push(...factsFromPage(page, contacts));
    },
  });

  const complete = !summary.aborted && !summary.reachedPageLimit;
  const pagesRemoved = complete ? store.pruneMissingPages(projectId, new Set(summary.seenUrls)) : 0;

  // Facts for re-indexed pages are replaced; facts from untouched pages are kept.
  const stillPresent = new Set(store.listPages(projectId).map((p) => p.url));
  const kept = store.getFacts(projectId).filter((f) => stillPresent.has(f.pageUrl) && !reindexedUrls.has(f.pageUrl));
  store.replaceFacts(projectId, dedupeFacts([...freshFacts, ...kept]));

  return { ...summary, chunksWritten, pagesRemoved };
}
