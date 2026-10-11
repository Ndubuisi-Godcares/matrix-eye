/**
 * Persistence for API-level records: projects and crawl jobs.
 *
 * These live in the same SQLite file as the knowledge index (one file to back up and move).
 * The hosted multi-tenant service will replace this with PostgreSQL behind the same two
 * interfaces. Knowledge itself is handled by the KnowledgeStore, not here.
 */
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Rule } from "@eagles-eye/core";

export interface Project {
  id: string;
  name: string;
  siteUrl: string;
  rules: Rule[];
  createdAt: string;
}

export type CrawlStatus = "running" | "completed" | "failed";

export interface CrawlJob {
  id: string;
  projectId: string;
  status: CrawlStatus;
  startedAt: string;
  finishedAt: string | null;
  pagesIndexed: number;
  pagesUnchanged: number;
  pagesRemoved: number;
  chunksWritten: number;
  skipped: number;
  failed: number;
  /** True when the crawl stopped at the page limit, so the site may contain more pages. */
  reachedPageLimit: boolean;
  error: string | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  site_url   TEXT NOT NULL,
  rules_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS crawl_jobs (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL,
  status             TEXT NOT NULL,
  started_at         TEXT NOT NULL,
  finished_at        TEXT,
  pages_indexed      INTEGER NOT NULL DEFAULT 0,
  pages_unchanged    INTEGER NOT NULL DEFAULT 0,
  pages_removed      INTEGER NOT NULL DEFAULT 0,
  chunks_written     INTEGER NOT NULL DEFAULT 0,
  skipped            INTEGER NOT NULL DEFAULT 0,
  failed             INTEGER NOT NULL DEFAULT 0,
  reached_page_limit INTEGER NOT NULL DEFAULT 0,
  error              TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_project ON crawl_jobs (project_id, started_at);
`;

interface ProjectRow {
  id: string;
  name: string;
  site_url: string;
  rules_json: string;
  created_at: string;
}
interface JobRow {
  id: string;
  project_id: string;
  status: CrawlStatus;
  started_at: string;
  finished_at: string | null;
  pages_indexed: number;
  pages_unchanged: number;
  pages_removed: number;
  chunks_written: number;
  skipped: number;
  failed: number;
  reached_page_limit: number;
  error: string | null;
}

const toProject = (r: ProjectRow): Project => ({ id: r.id, name: r.name, siteUrl: r.site_url, rules: JSON.parse(r.rules_json) as Rule[], createdAt: r.created_at });
const toJob = (r: JobRow): CrawlJob => ({
  id: r.id,
  projectId: r.project_id,
  status: r.status,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  pagesIndexed: r.pages_indexed,
  pagesUnchanged: r.pages_unchanged,
  pagesRemoved: r.pages_removed,
  chunksWritten: r.chunks_written,
  skipped: r.skipped,
  failed: r.failed,
  reachedPageLimit: r.reached_page_limit === 1,
  error: r.error,
});

export class Repositories {
  constructor(private readonly db: DatabaseSync) {
    db.exec(SCHEMA);
    // A crawl that was running when the process stopped can never finish: mark it so callers are not stuck.
    db.prepare("UPDATE crawl_jobs SET status = 'failed', error = 'Interrupted by server restart', finished_at = ? WHERE status = 'running'").run(new Date().toISOString());
  }

  createProject(input: { name: string; siteUrl: string; rules?: Rule[] }): Project {
    const project: Project = { id: randomUUID(), name: input.name, siteUrl: input.siteUrl, rules: input.rules ?? [], createdAt: new Date().toISOString() };
    this.db
      .prepare("INSERT INTO projects (id, name, site_url, rules_json, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(project.id, project.name, project.siteUrl, JSON.stringify(project.rules), project.createdAt);
    return project;
  }

  getProject(id: string): Project | null {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
    return row ? toProject(row) : null;
  }

  setRules(id: string, rules: Rule[]): void {
    this.db.prepare("UPDATE projects SET rules_json = ? WHERE id = ?").run(JSON.stringify(rules), id);
  }

  deleteProject(id: string): void {
    this.db.prepare("DELETE FROM crawl_jobs WHERE project_id = ?").run(id);
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  }

  createJob(projectId: string): CrawlJob {
    const id = randomUUID();
    const startedAt = new Date().toISOString();
    this.db.prepare("INSERT INTO crawl_jobs (id, project_id, status, started_at) VALUES (?, ?, 'running', ?)").run(id, projectId, startedAt);
    return this.getJob(id) as CrawlJob;
  }

  getJob(id: string): CrawlJob | null {
    const row = this.db.prepare("SELECT * FROM crawl_jobs WHERE id = ?").get(id) as JobRow | undefined;
    return row ? toJob(row) : null;
  }

  runningJobFor(projectId: string): CrawlJob | null {
    const row = this.db.prepare("SELECT * FROM crawl_jobs WHERE project_id = ? AND status = 'running' LIMIT 1").get(projectId) as JobRow | undefined;
    return row ? toJob(row) : null;
  }

  latestJobFor(projectId: string): CrawlJob | null {
    const row = this.db.prepare("SELECT * FROM crawl_jobs WHERE project_id = ? ORDER BY started_at DESC LIMIT 1").get(projectId) as JobRow | undefined;
    return row ? toJob(row) : null;
  }

  finishJob(id: string, result: Partial<Omit<CrawlJob, "id" | "projectId" | "startedAt" | "finishedAt">> & { status: CrawlStatus }): void {
    this.db
      .prepare(
        `UPDATE crawl_jobs SET status = ?, finished_at = ?, pages_indexed = ?, pages_unchanged = ?, pages_removed = ?,
                chunks_written = ?, skipped = ?, failed = ?, reached_page_limit = ?, error = ? WHERE id = ?`,
      )
      .run(
        result.status,
        new Date().toISOString(),
        result.pagesIndexed ?? 0,
        result.pagesUnchanged ?? 0,
        result.pagesRemoved ?? 0,
        result.chunksWritten ?? 0,
        result.skipped ?? 0,
        result.failed ?? 0,
        result.reachedPageLimit ? 1 : 0,
        result.error ?? null,
        id,
      );
  }
}
