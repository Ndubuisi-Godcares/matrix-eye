/**
 * Environment-driven configuration, validated once at startup so a misconfigured deployment
 * fails immediately with a clear message instead of misbehaving later.
 */
import { z } from "zod";

const schema = z.object({
  MATRIX_EYE_API_KEY: z.string().min(16, "MATRIX_EYE_API_KEY must be at least 16 characters"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOST: z.string().default("127.0.0.1"),
  MATRIX_EYE_DB_PATH: z.string().default("./data/matrix-eye.sqlite"),
  /** Comma-separated origins allowed to call the API from a browser (sites hosting the widget). */
  MATRIX_EYE_CORS_ORIGINS: z.string().default(""),
  /** Requests per minute per client IP. */
  MATRIX_EYE_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(120),
  /** Comma-separated origins of the marketing website, allowed to submit the waitlist and contact forms. */
  MATRIX_EYE_SITE_ORIGINS: z.string().default(""),
  /** Waitlist and contact form submissions per minute per visitor IP. */
  MATRIX_EYE_FORM_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(5),
  /** Chat requests per minute per visitor IP and project on the public widget endpoints. */
  MATRIX_EYE_PUBLIC_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(20),
  /** Allow crawling localhost / private addresses. Trusted dev machines only. */
  MATRIX_EYE_ALLOW_PRIVATE_NETWORKS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /**
   * Run JavaScript for pages that arrive empty (React/Vue sites), the same `--render` capability
   * `npm run demo`/the CLI already have. Off by default: it needs Chromium (`npx playwright install
   * chromium`) and is slower per page, so ordinary server-rendered sites never pay the cost.
   */
  MATRIX_EYE_RENDER: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /**
   * Hosted multi-tenant mode (Phase 4, ADR-008). Unset (the default) keeps the API self-host /
   * single-tenant: one operator key, no accounts. Set all three together to turn on accounts,
   * per-account API keys and project ownership; the public widget/forms endpoints are unaffected.
   */
  MATRIX_EYE_DATABASE_URL: z.string().optional(),
  MATRIX_EYE_SUPABASE_URL: z.string().optional(),
  MATRIX_EYE_SUPABASE_ANON_KEY: z.string().optional(),
}).superRefine((v, ctx) => {
  const controlPlaneVars = [v.MATRIX_EYE_DATABASE_URL, v.MATRIX_EYE_SUPABASE_URL, v.MATRIX_EYE_SUPABASE_ANON_KEY];
  if (controlPlaneVars.some(Boolean) && !controlPlaneVars.every(Boolean)) {
    ctx.addIssue({
      code: "custom",
      message: "MATRIX_EYE_DATABASE_URL, MATRIX_EYE_SUPABASE_URL and MATRIX_EYE_SUPABASE_ANON_KEY must all be set together (hosted mode) or all left unset (self-host mode)",
    });
  }
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
  render: boolean;
  /** Null in self-host mode. Set means hosted multi-tenant mode is on (ADR-008). */
  controlPlane: { databaseUrl: string; supabaseUrl: string; supabaseAnonKey: string } | null;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid configuration:\n${problems}`);
  }
  const v = parsed.data;
  return {
    apiKey: v.MATRIX_EYE_API_KEY,
    port: v.PORT,
    host: v.HOST,
    dbPath: v.MATRIX_EYE_DB_PATH,
    corsOrigins: v.MATRIX_EYE_CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
    siteOrigins: v.MATRIX_EYE_SITE_ORIGINS.split(",").map((o) => o.trim().toLowerCase()).filter(Boolean),
    rateLimitPerMinute: v.MATRIX_EYE_RATE_LIMIT_PER_MINUTE,
    publicRateLimitPerMinute: v.MATRIX_EYE_PUBLIC_RATE_LIMIT_PER_MINUTE,
    formRateLimitPerMinute: v.MATRIX_EYE_FORM_RATE_LIMIT_PER_MINUTE,
    allowPrivateNetworks: v.MATRIX_EYE_ALLOW_PRIVATE_NETWORKS,
    render: v.MATRIX_EYE_RENDER,
    controlPlane:
      v.MATRIX_EYE_DATABASE_URL && v.MATRIX_EYE_SUPABASE_URL && v.MATRIX_EYE_SUPABASE_ANON_KEY
        ? { databaseUrl: v.MATRIX_EYE_DATABASE_URL, supabaseUrl: v.MATRIX_EYE_SUPABASE_URL, supabaseAnonKey: v.MATRIX_EYE_SUPABASE_ANON_KEY }
        : null,
  };
}
