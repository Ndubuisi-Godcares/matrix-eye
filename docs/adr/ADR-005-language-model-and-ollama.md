# ADR-005: Language model: Ollama for development, a non-thinking instruct model, licence first

- **Status:** accepted
- **Date:** 2026-10-12

## Context

Extractive mode (no model) cannot summarise and can quote the wrong part of the right page. The product needs a
language model, but it must work for self-hosters on modest hardware, be licensed for commercial use, and the same
code must serve hosted and self-hosted deployments.

## Decision

- **Protocol:** the OpenAI-compatible chat API. One client (`OpenAiCompatibleProvider`) serves Ollama, vLLM, LM Studio and
  hosted providers; switching is configuration (`MATRIX_EYE_LLM_BASE_URL`, `MATRIX_EYE_LLM_MODEL`), not code.
- **Development and self-hosting:** Ollama (free, MIT-licensed, runs locally, no account needed; its optional cloud
  service is not used and not part of the product).
- **Default model for small machines:** `qwen3:4b-instruct` (Apache-2.0, 2.5 GB). Licence is checked per model before
  adoption, because some popular small models are research-only (e.g. Qwen2.5-3B) or carry custom terms.
- **Non-thinking models only.** The default `qwen3:4b` is a *thinking* model. On Ollama 0.40 its reasoning arrives in the
  answer text without `<think>` tags (and `think:false`/`reasoning_effort:none` did not suppress it), so it cannot be
  filtered reliably, costs most of the token budget, and cold-starts for over a minute on a 4 GB GPU.
  The client still strips `<think>...</think>` where providers emit tags, and `matrix llm-check` warns when a model
  answers a one-word request at length.
- The engine's validation (citations, figures, abstention) applies to model output exactly as before, so a weak model
  degrades to the extractive answer rather than to a wrong one.

## Evidence (GTX 1650 4 GB, 16 GB RAM, Ollama, `qwen3:4b-instruct`)

| | Extractive (no model) | `qwen3:4b-instruct` |
|---|---|---|
| Fixture evaluation, 48 questions: correctness | 100% | 97.4% (one strict-phrase miss; answer was correct) |
| Citation hit rate / abstention / injection | 100% / 100% / 100% | 100% / 100% / 100% |
| Unsupported figures | 0 | 0 |
| Median latency | ~1 ms | ~3.2 s |
| Reed "medicine degree" | quoted an alumni page (misleading) | correctly declined |
| Reed "how do I apply" | fragments | coherent, cited summary |

Observed weaknesses of a 4B model: incomplete lists (it sees only four passages) and over-cautious declines
("admission criteria" declined although the page exists). Larger models (7B+) and more evidence passages are the
levers; both are measurable with `npm run eval`.

## Consequences

- Hosted inference (Phase 4) is a separate decision (D5): rented GPU or hosted open-weight API. This ADR only fixes the
  interface and the local default.
- A 4 GB GPU holds the model only partly (about 33% CPU / 67% GPU at 4096 context), so expect 3 to 13 s per answer.
