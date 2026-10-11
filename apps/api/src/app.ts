/**
 * The Fastify application: wiring only. Built from injected dependencies so tests can run it
 * entirely in memory (`app.inject`) with a scripted model and a fixture website.
 */
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { EagleError, type ChatResponse, type ErrorCode } from "@eagles-eye/core";
import { assertPublicUrl } from "@eagles-eye/crawler";
import { ConversationEngine } from "@eagles-eye/engine";
import type { SqliteKnowledgeStore } from "@eagles-eye/knowledge";
import type { LlmProvider } from "@eagles-eye/llm";
import { createAuthHook } from "./auth";
import type { AppConfig } from "./config";
import { CrawlRunner } from "./crawl-runner";
import { Repositories } from "./repositories";
import { chatSchema, crawlSchema, createProjectSchema, idParamSchema, rulesSchema, searchSchema } from "./schemas";

export interface AppDependencies {
  config: AppConfig;
  store: SqliteKnowledgeStore;
  llm?: LlmProvider | null;
  /** Pause between crawler requests. Tests set 0. */
  crawlDelayMs?: number;
  logger?: boolean;
}

/** HTTP status for each error code. Anything unmapped is a server fault. */
const STATUS: Partial<Record<ErrorCode, number>> = {
  invalid_url: 400,
  blocked_url: 400,
  invalid_request: 400,
  unauthorized: 401,
  not_found: 404,
  robots_disallowed: 422,
  unsupported_content: 422,
  fetch_failed: 502,
  llm_failed: 502,
};

export interface BuiltApp {
  app: FastifyInstance;
  crawls: CrawlRunner;
}

export async function buildApp(deps: AppDependencies): Promise<BuiltApp> {
  const { config, store } = deps;
  const repos = new Repositories(store.connection);
  const engine = new ConversationEngine({ store, llm: deps.llm ?? null });
  const crawls = new CrawlRunner(repos, store, { allowPrivateNetworks: config.allowPrivateNetworks, delayMs: deps.crawlDelayMs });

  const app = Fastify({
    bodyLimit: 100 * 1024,
    logger: deps.logger ? { level: "info", redact: ["req.headers.authorization"] } : false,
  });

  await app.register(cors, { origin: config.corsOrigins.length ? config.corsOrigins : false });
  await app.register(rateLimit, { max: config.rateLimitPerMinute, timeWindow: "1 minute" });

  // One error format everywhere: { error: { code, message, details? } }.
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "Request validation failed", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } });
    }
    if (err instanceof EagleError) {
      return reply.code(STATUS[err.code] ?? 500).send({ error: { code: err.code, message: err.message } });
    }
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode && statusCode < 500) {
      return reply.code(statusCode).send({ error: { code: statusCode === 429 ? "rate_limited" : "invalid_request", message: (err as Error).message } });
    }
    // Unexpected: log the detail, tell the client nothing about internals.
    request.log.error({ err }, "unhandled error");
    return reply.code(500).send({ error: { code: "internal", message: "Internal server error" } });
  });

  app.setNotFoundHandler((_, reply) => reply.code(404).send({ error: { code: "not_found", message: "Route not found" } }));

  /** Load a project or fail with 404 (which also hides whether other projects exist). */
  const requireProject = (rawId: unknown) => {
    const { id } = idParamSchema.parse(rawId);
    const project = repos.getProject(id);
    if (!project) throw new EagleError("not_found", "Project not found");
    return project;
  };

  // Health check is public and exempt from rate limiting (load balancers poll it).
  app.get("/health", { config: { rateLimit: false } }, async () => ({ status: "ok", llm: deps.llm?.name ?? "extractive" }));

  // Everything under /v1 requires the API key.
  await app.register(
    async (v1) => {
      v1.addHook("onRequest", createAuthHook(config.apiKey));

      v1.post("/projects", async (request, reply) => {
        const body = createProjectSchema.parse(request.body);
        // Reject unsafe site URLs at creation, not only when crawling.
        assertPublicUrl(body.siteUrl, config.allowPrivateNetworks);
        const project = repos.createProject(body);
        return reply.code(201).send(project);
      });

      v1.get("/projects/:id", async (request) => {
        const project = requireProject(request.params);
        return { ...project, knowledge: store.stats(project.id), latestCrawl: repos.latestJobFor(project.id) };
      });

      v1.delete("/projects/:id", async (request, reply) => {
        const project = requireProject(request.params);
        if (repos.runningJobFor(project.id)) throw new EagleError("invalid_request", "Cannot delete a project while a crawl is running");
        store.deleteProject(project.id);
        repos.deleteProject(project.id);
        return reply.code(204).send();
      });

      v1.put("/projects/:id/rules", async (request) => {
        const project = requireProject(request.params);
        const rules = rulesSchema.parse(request.body);
        repos.setRules(project.id, rules);
        return { rules };
      });

      v1.post("/projects/:id/crawl", async (request, reply) => {
        const project = requireProject(request.params);
        const body = crawlSchema.parse(request.body ?? {});
        return reply.code(202).send(crawls.start(project, body));
      });

      v1.get("/crawls/:id", async (request) => {
        const { id } = idParamSchema.parse(request.params);
        const job = repos.getJob(id);
        if (!job) throw new EagleError("not_found", "Crawl not found");
        return job;
      });

      v1.get("/projects/:id/pages", async (request) => {
        const project = requireProject(request.params);
        return { pages: store.listPages(project.id) };
      });

      // Retrieval only, no answer generation: for debugging what the engine can see.
      v1.post("/projects/:id/search", async (request) => {
        const project = requireProject(request.params);
        const body = searchSchema.parse(request.body);
        const hits = store.search(project.id, body.query, body.limit);
        return {
          results: hits.map((h) => ({ score: h.score, url: h.chunk.pageUrl, title: h.chunk.pageTitle, section: h.chunk.headingPath.join(" > "), text: h.chunk.text })),
        };
      });

      v1.post("/projects/:id/chat", async (request) => {
        const project = requireProject(request.params);
        const body = chatSchema.parse(request.body);
        const wantsDebug = (request.query as { debug?: string }).debug === "true";
        const response = await engine.ask({ projectId: project.id, question: body.message, history: body.history, siteName: project.name, rules: project.rules });
        return wantsDebug ? response : stripDebug(response);
      });
    },
    { prefix: "/v1" },
  );

  return { app, crawls };
}

/** Diagnostics are for operators; public responses carry only the answer and its sources. */
function stripDebug({ debug: _debug, ...rest }: ChatResponse): Omit<ChatResponse, "debug"> {
  return rest;
}
