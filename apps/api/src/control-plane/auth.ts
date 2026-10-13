/**
 * Bearer-token authentication for hosted (multi-tenant) accounts — the per-account key promised in
 * `auth.ts`'s header comment, behind the same `authenticate` hook shape so routes do not change.
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AccountRepository } from "./accounts-repository";

declare module "fastify" {
  interface FastifyRequest {
    /** Set by `createAccountAuthHook` once the Bearer token has been verified. */
    accountId?: string;
  }
}

export function createAccountAuthHook(accounts: AccountRepository) {
  return async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const header = request.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const accountId = token ? await accounts.verifyApiKey(token) : null;
    if (!accountId) {
      // Same response as the single-key mode (auth.ts): missing and wrong look identical.
      await reply.code(401).header("www-authenticate", "Bearer").send({ error: { code: "unauthorized", message: "Missing or invalid API key" } });
      return;
    }
    request.accountId = accountId;
  };
}
