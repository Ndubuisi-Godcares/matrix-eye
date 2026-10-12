/**
 * Environment-driven configuration, validated once at startup so a misconfigured deployment
 * fails immediately with a clear message instead of misbehaving later.
 */
import { z } from "zod";

const schema = z.object({
  EAGLE_API_KEY: z.string().min(16, "EAGLE_API_KEY must be at least 16 characters"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOST: z.string().default("127.0.0.1"),
  EAGLE_DB_PATH: z.string().default("./data/eagle.sqlite"),
  /** Comma-separated origins allowed to call the API from a browser (sites hosting the widget). */
  EAGLE_CORS_ORIGINS: z.string().default(""),
  /** Requests per minute per client IP. */
  EAGLE_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(120),
  /** Comma-separated origins of the marketing website, allowed to submit the waitlist and contact forms. */
  EAGLE_SITE_ORIGINS: z.string().default(""),
  /** Waitlist and contact form submissions per minute per visitor IP. */
  EAGLE_FORM_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(5),
  /** Chat requests per minute per visitor IP and project on the public widget endpoints. */
  EAGLE_PUBLIC_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(20),
  /** Allow crawling localhost / private addresses. Trusted dev machines only. */
  EAGLE_ALLOW_PRIVATE_NETWORKS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export interface AppConfig {
  apiKey: string;
  port: number;
  host: string;
  dbPath: string;
  corsOrigins: string[];
  siteOrigins: string[];
  rateLimitPerMinute: number;
  publicRateLimitPerMinute: number;
  formRateLimitPerMinute: number;
  allowPrivateNetworks: boolean;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid configuration:\n${problems}`);
  }
  const v = parsed.data;
  return {
    apiKey: v.EAGLE_API_KEY,
    port: v.PORT,
    host: v.HOST,
    dbPath: v.EAGLE_DB_PATH,
    corsOrigins: v.EAGLE_CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
    siteOrigins: v.EAGLE_SITE_ORIGINS.split(",").map((o) => o.trim().toLowerCase()).filter(Boolean),
    rateLimitPerMinute: v.EAGLE_RATE_LIMIT_PER_MINUTE,
    publicRateLimitPerMinute: v.EAGLE_PUBLIC_RATE_LIMIT_PER_MINUTE,
    formRateLimitPerMinute: v.EAGLE_FORM_RATE_LIMIT_PER_MINUTE,
    allowPrivateNetworks: v.EAGLE_ALLOW_PRIVATE_NETWORKS,
  };
}
