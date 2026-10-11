/**
 * Bearer-token authentication.
 *
 * v1 uses one operator-configured API key. The hosted service replaces this with per-project
 * keys (Phase 4) behind the same `authenticate` hook, so routes do not change.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Compare secrets without leaking how many leading characters matched. */
export function keysMatch(provided: string, expected: string): boolean {
  // Hashing first gives both sides equal length, which timingSafeEqual requires.
  return timingSafeEqual(digest(provided), digest(expected));
}

export function createAuthHook(apiKey: string) {
  return async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const header = request.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token || !keysMatch(token, apiKey)) {
      // Same response for "missing" and "wrong" so the endpoint reveals nothing about valid keys.
      await reply.code(401).header("www-authenticate", "Bearer").send({ error: { code: "unauthorized", message: "Missing or invalid API key" } });
    }
  };
}
