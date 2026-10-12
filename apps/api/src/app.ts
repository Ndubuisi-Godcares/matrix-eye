/**
 * The Fastify application: wiring only. Built from injected dependencies so tests can run it
 * entirely in memory (`app.inject`) with a scripted model and a fixture website.
 */
import cors, { type FastifyCorsOptions } from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { OutgoingHttpHeaders } from "node:http";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { EagleError, type ChatResponse, type ErrorCode } from "@eagles-eye/core";
import { assertPublicUrl, type PageRenderer } from "@eagles-eye/crawler";
import { ConversationEngine } from "@eagles-eye/engine";
import type { SqliteKnowledgeStore } from "@eagles-eye/knowledge";
import type { LlmProvider } from "@eagles-eye/llm";
import { createAuthHook } from "./auth";
import type { AppConfig } from "./config";
import { CrawlRunner } from "./crawl-runner";
import { Repositories } from "./repositories";
import { chatSchema, crawlSchema, createProjectSchema, feedbackSchema, idParamSchema, rulesSchema, searchSchema, settingsSchema } from "./schemas";

export interface AppDependencies {
  config: AppConfig;
  store: SqliteKnowledgeStore;
  llm?: LlmProvider | null;
  /** Pause between crawler requests. Tests set 0. */
  crawlDelayMs?: number;
  /** Browser used to read JavaScript-only pages. Off by default; enabling it on a public service needs a sandbox (ADR-004). */
  renderer?: PageRenderer;
  logger?: boolean;
}

/** HTTP status for each error code. Anything unmapped is a server fault. */
const STATUS: Partial<Record<ErrorCode, number>> = {
  invalid_url: 400,
  blocked_url: 400,
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  robots_disallowed: 422,
  unsupported_content: 422,
  fetch_failed: 502,
  llm_failed: 502,
};

/** /v1/public/projects/<uuid>/... : the endpoints a website visitor's browser calls. */
const PUBLIC_PATH = /^\/v1\/public\/projects\/([0-9a-f-]{36})(?:[/?]|$)/i;

export interface BuiltApp {
  app: FastifyInstance;
  crawls: CrawlRunner;
}

export async function buildApp(deps: AppDependencies): Promise<BuiltApp> {
  const { config, store } = deps;
  const repos = new Repositories(store.connection);
  const engine = new ConversationEngine({ store, llm: deps.llm ?? null });
  const crawls = new CrawlRunner(repos, store, { allowPrivateNetworks: config.allowPrivateNetworks, delayMs: deps.crawlDelayMs, renderer: deps.renderer });

  const app = Fastify({
    bodyLimit: 100 * 1024,
    logger: deps.logger ? { level: "info", redact: ["req.headers.authorization"] } : false,
  });

  // CORS is decided per request. Public widget routes allow the origins configured on that project; every
  // other route allows only the operator's list. (The route-level origin check below enforces the same rule
  // for non-preflight requests, so CORS headers are a browser convenience, not the only gate.)
  await app.register(cors, () => (request: FastifyRequest, callback: (error: Error | null, options: FastifyCorsOptions) => void) => {
    const match = PUBLIC_PATH.exec(request.url ?? "");
    if (!match) return callback(null, { origin: config.corsOrigins.length ? config.corsOrigins : false });
    const origins = repos.getProject(match[1] ?? "")?.settings.allowedOrigins ?? [];
    callback(null, { origin: origins.includes("*") ? true : origins, methods: ["GET", "POST", "OPTIONS"], allowedHeaders: ["content-type"], maxAge: 600 });
  });
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
        const project = repos.createProject({ name: body.name, siteUrl: body.siteUrl, rules: body.rules, settings: body.settings });
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

      v1.patch("/projects/:id/settings", async (request) => {
        const project = requireProject(request.params);
        const changes = settingsSchema.parse(request.body);
        // Only fields that were actually sent are changed.
        const defined = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
        return { settings: repos.updateSettings(project.id, defined) };
      });

      v1.get("/projects/:id/feedback", async (request) => {
        const project = requireProject(request.params);
        const { rating } = request.query as { rating?: string };
        return { feedback: repos.listFeedback(project.id, { rating: rating === "up" || rating === "down" ? rating : undefined }) };
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

  // ---- Public routes: called from visitors' browsers by the chat widget --------------------------------
  // No API key can live in a web page, so these are protected differently: the project id is unguessable,
  // the browser's Origin must be on the project's allow-list, and each visitor is rate-limited per project.
  // They expose chat, feedback and display settings only, never crawling, rules or other projects.
  // Limits of this design (documented): the Origin header cannot stop a non-browser client from calling
  // these endpoints, so the rate limit (and per-key quotas in the hosted service) is the real control.
  await app.register(
    async (pub) => {
      /** Load the project and enforce its origin allow-list. */
      const publicProject = (request: { params: unknown; headers: { origin?: string } }) => {
        const project = requireProject(request.params);
        const origin = request.headers.origin?.toLowerCase();
        const allowed = project.settings.allowedOrigins;
        if (origin && !allowed.includes("*") && !allowed.includes(origin)) {
          throw new EagleError("forbidden", "This website is not allowed to use this assistant. Add its origin to the project's allowed origins.");
        }
        return project;
      };

      const limit = {
        rateLimit: {
          max: config.publicRateLimitPerMinute,
          timeWindow: "1 minute",
          keyGenerator: (request: { ip: string; params: unknown }) => `${request.ip}:${(request.params as { id?: string }).id ?? ""}`,
        },
      };

      pub.get("/projects/:id/config", async (request) => {
        const project = publicProject(request);
        return { name: project.name, greeting: project.settings.greeting, suggestedQuestions: project.settings.suggestedQuestions };
      });

      pub.post("/projects/:id/chat", { config: limit }, async (request) => {
        const project = publicProject(request);
        const body = chatSchema.parse(request.body);
        const response = await engine.ask({ projectId: project.id, question: body.message, history: body.history, siteName: project.name, rules: project.rules });
        return stripDebug(response);
      });

      // Server-sent events: `token` events carry provisional text as the model writes it; the single `final`
      // event carries the validated answer and sources and REPLACES whatever was streamed. `error` ends the stream.
      pub.post("/projects/:id/chat/stream", { config: limit }, async (request, reply) => {
        const project = publicProject(request);
        const body = chatSchema.parse(request.body);

        reply.hijack();
        const raw = reply.raw;

        // Stop generating if the visitor leaves. This must listen on the RESPONSE: in current Node the request's
        // own "close" event fires as soon as the request body has been read, which would cancel every answer
        // immediately. The response closes when the connection does; `writableEnded` ignores normal completion.
        const abort = new AbortController();
        raw.on("close", () => {
          if (!raw.writableEnded) abort.abort();
        });
        // Headers set earlier (CORS, rate-limit counters) live on `reply` and must be copied across by hand.
        const headers = { ...reply.getHeaders(), "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" } as OutgoingHttpHeaders;
        raw.writeHead(200, headers);
        const send = (event: string, data: unknown) => void raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

        // A cold model can take a minute to load; comments keep proxies and browsers from closing the stream.
        const heartbeat = setInterval(() => raw.write(": keep-alive\n\n"), 15_000);
        try {
          const response = await engine.ask({
            projectId: project.id,
            question: body.message,
            history: body.history,
            siteName: project.name,
            rules: project.rules,
            signal: abort.signal,
            onToken: (text) => send("token", { text }),
          });
          send("final", stripDebug(response));
        } catch (err) {
          if (!abort.signal.aborted) {
            const known = err instanceof EagleError;
            send("error", { code: known ? err.code : "internal", message: known ? err.message : "Something went wrong. Please try again." });
          }
        } finally {
          clearInterval(heartbeat);
          raw.end();
        }
      });

      pub.post("/projects/:id/feedback", { config: limit }, async (request, reply) => {
        const project = publicProject(request);
        const body = feedbackSchema.parse(request.body);
        repos.addFeedback({ projectId: project.id, rating: body.rating, question: body.question, answer: body.answer, comment: body.comment ?? null });
        return reply.code(204).send();
      });
    },
    { prefix: "/v1/public" },
  );

  return { app, crawls };
}

/** Diagnostics are for operators; public responses carry only the answer and its sources. */
function stripDebug({ debug: _debug, ...rest }: ChatResponse): Omit<ChatResponse, "debug"> {
  return rest;
}
