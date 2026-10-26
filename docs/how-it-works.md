# How it works

Every question follows the same pipeline. The stages below explain both why an answer is trustworthy and why the
assistant sometimes abstains instead of answering.

```
your website -> read -> index -> (visitor asks) -> find evidence -> answer -> check -> reply with sources
```

## 1. Reading your website

The crawler starts at your site's address and follows internal links, plus any sitemap, to discover pages with no
inbound link. It operates under fixed constraints:

- Honors `robots.txt`, including declared crawl delays, and refuses to crawl at all if the file cannot be read reliably.
- Limits request rate to about four pages per second, two concurrent, with caps on pages per crawl, page size and time per page.
- Identifies itself as `MatrixEyeBot`, issues only `GET` requests, and skips pages marked `noindex`.
- Deduplicates equivalent pages (alternate addresses, filtered views) and retains the canonical version.

A site that renders its content with JavaScript returns an empty shell to a standard crawl. With rendering enabled,
a headless browser executes the page first, so single-page applications are indexed correctly.

Each page is reduced to its main content; navigation, banners and footers are discarded. The heading path (for
example, "Admissions > Deadlines") is retained so an isolated passage remains interpretable on its own. Contact
details are extracted separately, directly from page text.

## 2. Indexing

Pages are segmented into passages of roughly 150 to 250 words, never spanning a heading boundary, and stored in a
search index. Re-crawls are incremental: only changed pages are reprocessed, and removed pages are pruned from the
index.

## 3. Finding the evidence

A visitor's question is searched against the index using several complementary retrieval methods, merged into a
single ranked result:

- The visitor's own wording.
- The same wording expanded with everyday synonyms, so "cost" retrieves a page that says "tuition".
- Passages covering every concept in the question.
- Pages whose title, headings or URL reference those concepts (a page at `/how-to-apply` concerns applying).

Shallow, canonical pages are preferred over deep news or archive pages when relevance is comparable. Follow-up
questions ("how much is it?") are rewritten against the preceding conversation. Broad questions such as "what is
this site about?" are answered from the front page's own description.

## 4. Answering

The highest-ranked passages are passed to the language model under strict constraints: answer only from the
supplied sources, cite every statement, never infer figures or contact details, and treat page text as data rather
than instructions. Without a configured model, the engine composes an answer by quoting the most relevant sentences
directly. Either mode produces a response with numbered source references.

Before generating a response, the engine evaluates whether the retrieved evidence covers the question at all. When
it does not, the assistant abstains rather than improvising, and surfaces a contact address from the site when one
is known.

Some questions are resolved before reaching the model: greetings, contact questions (answered from details found
on the site), and anything covered by a configured rule.

## 5. Checking

The composed answer is verified against its evidence before being returned:

- Citation markers that reference no real source are stripped, and an answer left with no valid citation is rejected.
- Every price, date, percentage or quantity must appear verbatim in the source passages, or the answer is replaced by the quoted evidence directly.

In streaming mode, text renders as it is generated; the verified answer replaces it once the checks complete.

## Safety

MatrixEye operates under an unusual threat model: it reads content it does not control and serves results to
visitors it does not control either.

- **Page text is treated as untrusted input.** Instruction-like text ("ignore all previous instructions…") is
  stripped at ingestion time; remaining content is fenced off from the model's own instructions, and every answer
  is verified afterward.
- **The crawler cannot be directed at an internal network.** Target addresses are validated before the request and
  again at connection time; private, local and cloud-metadata addresses are refused.
- **The chat widget renders answers as inert text.** Responses are never inserted as HTML, and links are restricted
  to the `http` and `https` schemes.
- **Only explicitly allowed origins can embed the assistant**, and every visitor is rate-limited. The embedded page
  holds no secret.

The [security page](/security/) lists what is tested and what is not done yet.

## Limits

- Retrieval is lexical, based on words and synonyms; an unusual phrasing can be declined incorrectly.
- Small local models are conservative and sometimes decline compound, two-part questions.
- The crawler reads web pages only, not PDFs, images, or content behind a login.
- Accuracy has been measured in English only. See [Accuracy and evaluation](accuracy.md).
