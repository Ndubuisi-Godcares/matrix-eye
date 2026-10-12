/**
 * Finding a language model without configuration.
 *
 * Asking someone to set environment variables before they can see conversational answers is a poor first
 * experience. If Ollama is running on this computer, it can tell us which models it has, so the tools that run
 * locally (the CLI and the demo) look for it and pick a sensible one. Explicit settings always win, and this is
 * deliberately NOT used by the API server: a deployment should never silently pick a model.
 *
 * Choosing a model matters. "Thinking" models (DeepSeek-R1, a plain `qwen3:4b`) write their reasoning into the
 * answer, which breaks citation checking and is slow (ADR-005), and embedding models cannot chat at all, so both
 * kinds are skipped.
 */
import { OpenAiCompatibleProvider } from "./openai-compatible";
import type { LlmProvider } from "./provider";
import { llmFromEnv } from "./index";

export interface DetectedModel {
  /** OpenAI-compatible base URL, e.g. http://localhost:11434/v1 */
  baseUrl: string;
  model: string;
}

/** Models that cannot or should not be used for answering, matched against the model name. */
const UNSUITABLE = /embed|rerank|bge-|nomic|minilm|deepseek-r1|qwq|reasoning|thinking|^qwen3:\d+(\.\d+)?b$|^qwen3:latest$/i;

/** In order of preference: small, capable, permissively licensed, non-thinking chat models. */
const PREFERRED: readonly RegExp[] = [/^qwen3:.*instruct/i, /^qwen3.*instruct/i, /^llama3\.[123]/i, /^phi4-mini/i, /^gemma3/i, /^qwen2\.5.*instruct/i, /^mistral/i];

/** Pick the best chat model from a list of names, or null if none is suitable. */
export function chooseModel(names: readonly string[]): string | null {
  const usable = names.filter((n) => !UNSUITABLE.test(n));
  for (const pattern of PREFERRED) {
    const hit = usable.find((n) => pattern.test(n));
    if (hit) return hit;
  }
  return usable[0] ?? null;
}

/** Look for Ollama on this computer. Returns quickly (default 1.2 s) when it is not running. */
export async function detectOllama(options: { origin?: string; timeoutMs?: number; fetch?: typeof fetch } = {}): Promise<DetectedModel | null> {
  const origin = (options.origin ?? "http://localhost:11434").replace(/\/+$/, "");
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  try {
    const response = await doFetch(`${origin}/api/tags`, { signal: AbortSignal.timeout(options.timeoutMs ?? 1200) });
    if (!response.ok) return null;
    const body = (await response.json()) as { models?: Array<{ name?: string }> };
    const model = chooseModel((body.models ?? []).map((m) => m.name ?? "").filter(Boolean));
    return model ? { baseUrl: `${origin}/v1`, model } : null;
  } catch {
    return null; // not installed, not running, or not answering: simply no local model
  }
}

export interface ResolvedModel {
  llm: LlmProvider | null;
  /** Where the choice came from, for a one-line message to the user. */
  source: "env" | "ollama" | "none";
}

/**
 * The model for local tools: explicit settings first, then a locally running Ollama, otherwise none
 * (answers are then quoted from the site). `disabled` forces "none".
 */
export async function resolveLocalModel(options: { env?: Record<string, string | undefined>; disabled?: boolean; detect?: () => Promise<DetectedModel | null> } = {}): Promise<ResolvedModel> {
  if (options.disabled) return { llm: null, source: "none" };
  const fromEnv = llmFromEnv(options.env ?? process.env);
  if (fromEnv) return { llm: fromEnv, source: "env" };
  const found = await (options.detect ?? (() => detectOllama()))();
  if (found) return { llm: new OpenAiCompatibleProvider(found), source: "ollama" };
  return { llm: null, source: "none" };
}
