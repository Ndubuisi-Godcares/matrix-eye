/**
 * Runs crawl jobs in the background of the API process.
 *
 * Fine for self-hosting and the alpha. The hosted service moves this to a separate worker with a
 * real queue (Phase 4); the contract (start a job, poll its status) stays the same.
 */
import { EagleError } from "@eagles-eye/core";
import { ingestSite } from "@eagles-eye/engine";
import type { KnowledgeStore } from "@eagles-eye/knowledge";
import type { CrawlJob, Project, Repositories } from "./repositories";

export interface CrawlRequest {
  maxPages?: number;
  /** Re-index every page even if unchanged. */
  full?: boolean;
}

export class CrawlRunner {
  /** Jobs started by this process, kept so tests (and graceful shutdown) can await them. */
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(
    private readonly repos: Repositories,
    private readonly store: KnowledgeStore,
    private readonly options: { allowPrivateNetworks: boolean; delayMs?: number },
  ) {}

  /** Start a crawl and return immediately with the new (running) job. */
  start(project: Project, request: CrawlRequest): CrawlJob {
    if (this.repos.runningJobFor(project.id)) {
      throw new EagleError("invalid_request", "A crawl is already running for this project");
    }
    const job = this.repos.createJob(project.id);
    const run = this.execute(job.id, project, request).finally(() => this.inFlight.delete(job.id));
    this.inFlight.set(job.id, run);
    return job;
  }

  /** Resolve when the given job has finished (no-op if it is not running in this process). */
  async waitFor(jobId: string): Promise<void> {
    await this.inFlight.get(jobId);
  }

  /** Wait for every running crawl, e.g. before closing the database on shutdown. */
  async drain(): Promise<void> {
    await Promise.allSettled([...this.inFlight.values()]);
  }

  private async execute(jobId: string, project: Project, request: CrawlRequest): Promise<void> {
    try {
      const result = await ingestSite({
        store: this.store,
        projectId: project.id,
        startUrl: project.siteUrl,
        maxPages: request.maxPages,
        full: request.full,
        allowPrivateNetworks: this.options.allowPrivateNetworks,
        delayMs: this.options.delayMs,
      });
      this.repos.finishJob(jobId, {
        status: "completed",
        pagesIndexed: result.pagesIndexed,
        pagesUnchanged: result.pagesUnchanged,
        pagesRemoved: result.pagesRemoved,
        chunksWritten: result.chunksWritten,
        skipped: result.skipped.length,
        failed: result.failed.length,
        reachedPageLimit: result.reachedPageLimit,
      });
    } catch (err) {
      // Never let a crawl failure crash the server; record it where the client can read it.
      this.repos.finishJob(jobId, { status: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  }
}
