# ADR-003: Grounded answers, abstention and answer validation

- **Status:** accepted
- **Date:** 2026-10-12

## Context

The product promise is "trustworthy answers from your own website". A fluent wrong answer (an invented
price, deadline or email address) is worse than no answer. We must work with a language model *and*
without one, and must remain safe against hostile page content.

## Decision

The engine (`packages/engine/src/engine.ts`) decides in order, cheapest and most deterministic first:

1. **Configured rule** fires -> fixed answer, no retrieval, no model.
2. **Contact question** -> answered verbatim from extracted structured facts (emails, phones), never
   generated.
3. **Retrieve** evidence (follow-ups are first rewritten into standalone queries).
4. **Gates -> abstain.** Two checks: overall coverage of the question by the evidence, and the
   **key-term gate**: the question's rarest word (by inverse document frequency; words the site never
   uses count as rarest) must be supported by the evidence, directly or by synonym. This is what stops
   "Do you offer a medicine degree?" being answered from pages that merely mention "degree".
5. **Generate** with the model if configured, otherwise **extractive** (quote the best sentences).
6. **Validate** the model's output (`validate.ts`): invented citation numbers are removed; an answer
   with no citation is rejected; every significant figure must appear in the evidence. On failure the
   engine falls back to the extractive answer, which is grounded by construction.

Invariant: any factual answer returned is backed by at least one cited passage from the site.

## Prompt-injection defence (layers)

1. Instruction-like paragraphs ("ignore all previous instructions", "system notice:") are **dropped at
   extraction time**, and contact details are only read from text that survived this filter.
2. Page text is **fenced** in `<source>` tags with angle brackets stripped, and declared untrusted.
3. The model's output is **validated** against the evidence (above).
4. The evaluation set includes hostile and private pages and gates CI at 100% resistance.

This reduces risk; it does not eliminate it. The filter is heuristic and will miss novel phrasings.

## Consequences

- Without a model the assistant sounds like quoted text but cannot hallucinate. With a model it is more
  conversational and is still bounded by validation.
- Some questions will be wrongly declined (e.g. an unusual word the site never uses). We prefer that to
  wrong answers; the evaluation set tracks both error types.
- The key-term gate is a keyword heuristic and the main reason semantic retrieval stays on the roadmap.
