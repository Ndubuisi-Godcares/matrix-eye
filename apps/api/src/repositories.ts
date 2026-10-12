/**
 * Persistence for API-level records: projects, crawl jobs and visitor feedback.
 *
 * These live in the same SQLite file as the knowledge index (one file to back up and move).
 * The hosted multi-tenant service will replace this with PostgreSQL behind the same interfaces.
 * Knowledge itself is handled by the KnowledgeStore, not here.
 */
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Rule } from "@matrix-eye/core";

/** Settings that shape how a project appears on a website. Stored as one JSON document. */
export interface ProjectSettings {
  /**
   * Browser origins allowed to use the chat widget (exact origins such as "https://school.edu", or "*" for any).
   * Empty means no website may embed the widget, so a new project is closed until its owner opens it.
   */
  allowedOrigins: string[];
  /** Opening message shown in the widget; null uses the default greeting. */
  greeting: string | null;
  /** Up to four starter questions shown as buttons. */
  suggestedQuestions: string[];
}

export const DEFAULT_SETTINGS: ProjectSettings = { allowedOrigins: [], greeting: null, suggestedQuestions: [] };

export interface Project {
  id: string;
  name: string;
  siteUrl: string;
  rules: Rule[];
  settings: ProjectSettings;
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

/** A visitor's thumbs up/down on an answer. The most useful input for finding what the assistant gets wrong. */
export interface Feedback {
  id: string;
  projectId: string;
  rating: "up" | "down";
  question: string;
  answer: string;
  comment: string | null;
  createdAt: string;
}

/** Someone who asked for early access through the website. */
export interface WaitlistEntry {
  email: string;
  name: string | null;
  useCase: string | null;
  /** Page the form was submitted from, to learn which pages convert. */
  source: string | null;
  /** When they ticked the consent box. Required to store anything. */
  consentAt: string;
  createdAt: string;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  site_url      TEXT NOT NULL,
  rules_json    TEXT NOT NULL DEFAULT '[]',
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL
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
CREATE TABLE IF NOT EXISTS feedback (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  rating     TEXT NOT NULL,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  comment    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_project ON feedback (project_id, created_at);
CREATE TABLE IF NOT EXISTS waitlist (
  email      TEXT PRIMARY KEY,
  name       TEXT,
  use_case   TEXT,
  source     TEXT,
  consent_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contact_messages (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

interface ProjectRow {
  id: string;
  name: string;
  site_url: string;
  rules_json: string;
  settings_json: string;
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
interface FeedbackRow {
  id: string;
  project_id: string;
  rating: "up" | "down";
  question: string;
  answer: string;
  comment: string | null;
  created_at: string;
}

const toProject = (r: ProjectRow): Project => ({
  id: r.id,
  name: r.name,
  siteUrl: r.site_url,
  rules: JSON.parse(r.rules_json) as Rule[],
  // Merge over defaults so projects saved before a setting existed still have every field.
  settings: { ...DEFAULT_SETTINGS, ...(JSON.parse(r.settings_json) as Partial<ProjectSettings>) },
  createdAt: r.created_at,
});
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
const toFeedback = (r: FeedbackRow): Feedback => ({ id: r.id, projectId: r.project_id, rating: r.rating, question: r.question, answer: r.answer, comment: r.comment, createdAt: r.created_at });

export class Repositories {
  constructor(private readonly db: DatabaseSync) {
    db.exec(SCHEMA);
    this.addColumnIfMissing("projects", "settings_json", "TEXT NOT NULL DEFAULT '{}'");
    // A crawl that was running when the process stopped can never finish: mark it so callers are not stuck.
    db.prepare("UPDATE crawl_jobs SET status = 'failed', error = 'Interrupted by server restart', finished_at = ? WHERE status = 'running'").run(new Date().toISOString());
  }

  /** Upgrade a database created before a column existed, without losing its rows. */
  private addColumnIfMissing(table: string, column: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((c) => c.name === column)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  createProject(input: { name: string; siteUrl: string; rules?: Rule[]; settings?: Partial<ProjectSettings> }): Project {
    const project: Project = {
      id: randomUUID(),
      name: input.name,
      siteUrl: input.siteUrl,
      rules: input.rules ?? [],
      settings: { ...DEFAULT_SETTINGS, ...input.settings },
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare("INSERT INTO projects (id, name, site_url, rules_json, settings_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(project.id, project.name, project.siteUrl, JSON.stringify(project.rules), JSON.stringify(project.settings), project.createdAt);
    return project;
  }

  getProject(id: string): Project | null {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
    return row ? toProject(row) : null;
  }

  setRules(id: string, rules: Rule[]): void {
    this.db.prepare("UPDATE projects SET rules_json = ? WHERE id = ?").run(JSON.stringify(rules), id);
  }

  /** Change only the settings that were provided. Returns the full settings afterwards. */
  updateSettings(id: string, changes: Partial<ProjectSettings>): ProjectSettings {
    const current = this.getProject(id)?.settings ?? DEFAULT_SETTINGS;
    const next: ProjectSettings = { ...current, ...changes };
    this.db.prepare("UPDATE projects SET settings_json = ? WHERE id = ?").run(JSON.stringify(next), id);
    return next;
  }

  deleteProject(id: string): void {
    this.db.prepare("DELETE FROM crawl_jobs WHERE project_id = ?").run(id);
    this.db.prepare("DELETE FROM feedback WHERE project_id = ?").run(id);
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

  /** Add someone to the waitlist. Returns false (and changes nothing) if the address is already there. */
  addWaitlist(input: { email: string; name?: string | null; useCase?: string | null; source?: string | null }): boolean {
    const now = new Date().toISOString();
    const result = this.db
      .prepare("INSERT OR IGNORE INTO waitlist (email, name, use_case, source, consent_at, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(input.email, input.name ?? null, input.useCase ?? null, input.source ?? null, now, now);
    return Number(result.changes) > 0;
  }

  listWaitlist(): WaitlistEntry[] {
    const rows = this.db.prepare("SELECT * FROM waitlist ORDER BY created_at DESC").all() as Array<{ email: string; name: string | null; use_case: string | null; source: string | null; consent_at: string; created_at: string }>;
    return rows.map((r) => ({ email: r.email, name: r.name, useCase: r.use_case, source: r.source, consentAt: r.consent_at, createdAt: r.created_at }));
  }

  /** Erase one person (a privacy request). Returns whether anything was removed. */
  deleteWaitlist(email: string): boolean {
    return Number(this.db.prepare("DELETE FROM waitlist WHERE email = ?").run(email).changes) > 0;
  }

  addContactMessage(input: { name: string; email: string; message: string }): ContactMessage {
    const message: ContactMessage = { id: randomUUID(), ...input, createdAt: new Date().toISOString() };
    this.db.prepare("INSERT INTO contact_messages (id, name, email, message, created_at) VALUES (?, ?, ?, ?, ?)").run(message.id, message.name, message.email, message.message, message.createdAt);
    return message;
  }

  listContactMessages(): ContactMessage[] {
    const rows = this.db.prepare("SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 500").all() as Array<{ id: string; name: string; email: string; message: string; created_at: string }>;
    return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, message: r.message, createdAt: r.created_at }));
  }

  addFeedback(input: Omit<Feedback, "id" | "createdAt">): Feedback {
    const feedback: Feedback = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    this.db
      .prepare("INSERT INTO feedback (id, project_id, rating, question, answer, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(feedback.id, feedback.projectId, feedback.rating, feedback.question, feedback.answer, feedback.comment, feedback.createdAt);
    return feedback;
  }

  /** Newest first. Optionally only thumbs-down, which is what to review when improving answers. */
  listFeedback(projectId: string, options: { rating?: "up" | "down"; limit?: number } = {}): Feedback[] {
    const limit = Math.min(options.limit ?? 100, 500);
    const rows = options.rating
      ? this.db.prepare("SELECT * FROM feedback WHERE project_id = ? AND rating = ? ORDER BY created_at DESC LIMIT ?").all(projectId, options.rating, limit)
      : this.db.prepare("SELECT * FROM feedback WHERE project_id = ? ORDER BY created_at DESC LIMIT ?").all(projectId, limit);
    return (rows as unknown as FeedbackRow[]).map(toFeedback);
  }
}
