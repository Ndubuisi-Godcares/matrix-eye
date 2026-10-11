/**
 * Request validation. Every body is parsed here before any business logic runs, so handlers
 * only ever see well-formed, size-bounded input.
 */
import { z } from "zod";

const ruleSchema = z
  .object({
    id: z.string().min(1).max(64),
    priority: z.number().int().min(0).max(1000),
    allOf: z.array(z.string().min(1).max(64)).max(10).optional(),
    anyOf: z.array(z.string().min(1).max(64)).max(10).optional(),
    // Patterns run against visitor input, so they are length-limited and must compile.
    pattern: z
      .string()
      .min(1)
      .max(200)
      .refine((p) => {
        try {
          new RegExp(p, "i");
          return true;
        } catch {
          return false;
        }
      }, "pattern is not a valid regular expression")
      .optional(),
    response: z.string().min(1).max(2000),
  })
  .refine((r) => r.pattern || (r.allOf && r.allOf.length > 0) || (r.anyOf && r.anyOf.length > 0), "a rule needs allOf, anyOf or pattern");

export const rulesSchema = z.array(ruleSchema).max(100);

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  siteUrl: z.string().trim().url().max(2000),
  rules: rulesSchema.optional(),
});

export const crawlSchema = z.object({
  maxPages: z.number().int().min(1).max(1000).optional(),
  full: z.boolean().optional(),
});

export const searchSchema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(20).default(5),
});

export const chatSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .max(12)
    .default([]),
});

export const idParamSchema = z.object({ id: z.string().uuid() });
