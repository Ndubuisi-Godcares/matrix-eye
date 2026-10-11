/**
 * Deterministic rules.
 *
 * Some answers must be exactly right and exactly consistent: opening hours, a refund policy,
 * "we don't offer X". A site owner configures those as rules, and a matching rule short-circuits
 * everything else (no retrieval, no model), so the model can never contradict them.
 */
import { tokenize, type Rule } from "@eagles-eye/core";

/** Return the highest-priority rule matching `question`, or null. */
export function matchRule(rules: readonly Rule[], question: string): Rule | null {
  if (rules.length === 0) return null;
  const words = new Set(tokenize(question));
  const ordered = [...rules].sort((a, b) => b.priority - a.priority);

  for (const rule of ordered) {
    if (rule.pattern) {
      try {
        if (new RegExp(rule.pattern, "i").test(question)) return rule;
      } catch {
        // A malformed pattern in configuration must not break every chat: skip that rule.
      }
      continue;
    }
    const allOf = rule.allOf ?? [];
    const anyOf = rule.anyOf ?? [];
    if (allOf.length === 0 && anyOf.length === 0) continue; // an empty rule would match everything
    const hasAll = allOf.every((w) => words.has(w.toLowerCase()));
    const hasAny = anyOf.length === 0 || anyOf.some((w) => words.has(w.toLowerCase()));
    if (hasAll && hasAny) return rule;
  }
  return null;
}
