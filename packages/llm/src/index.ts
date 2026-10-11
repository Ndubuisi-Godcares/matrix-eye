export type { LlmProvider, LlmMessage, LlmRequest, LlmResult } from "./provider";
export { OpenAiCompatibleProvider, type OpenAiCompatibleOptions } from "./openai-compatible";
export { ScriptedProvider, type ScriptedReply } from "./scripted";

import type { LlmProvider } from "./provider";
import { OpenAiCompatibleProvider } from "./openai-compatible";

/**
 * Build a provider from environment variables, or `null` when none is configured
 * (the engine then runs in extractive mode, which needs no model).
 */
export function llmFromEnv(env: Record<string, string | undefined> = process.env): LlmProvider | null {
  const baseUrl = env.EAGLE_LLM_BASE_URL?.trim();
  const model = env.EAGLE_LLM_MODEL?.trim();
  if (!baseUrl || !model) return null;
  return new OpenAiCompatibleProvider({ baseUrl, model, apiKey: env.EAGLE_LLM_API_KEY?.trim() || undefined });
}
