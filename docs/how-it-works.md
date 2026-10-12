# How it works

A question goes through the same path every time. Understanding it explains both what Matrix Eye does well and why
it sometimes says "I couldn't find that".

```
your website -> read -> index -> (visitor asks) -> find evidence -> answer -> check -> reply with sources
```

## 1. Reading your website

The crawler starts at your address and follows links on the same website. It also reads your sitemap, which finds
pages no link leads to. To be a good guest it:

- obeys `robots.txt`, including crawl delays, and does not crawl at all if it cannot read that file reliably;
- reads at most about four pages a second, two at a time, and caps pages per crawl, page size and time per page;
- identifies itself as `MatrixEyeBot`, only sends `GET` requests, and skips pages marked `noindex`;
- ignores copies of the same page (other addresses, filtered views) and keeps the official one.

Sites that draw their content with JavaScript arrive as an empty shell. With rendering switched on, a built-in
browser runs the page first, so single-page apps can be read as well.

From each page it keeps the main content and drops menus, banners and footers, keeping the heading path
(for example "Admissions > Deadlines") so a short passage still makes sense on its own. Contact details are noted
separately, straight from your page text.

## 2. Indexing

Pages are cut into passages of roughly 150 to 250 words that never cross a heading, and stored in a search index.
Re-reading is incremental: only changed pages are processed, and pages that disappeared are removed.

## 3. Finding the evidence

When a visitor asks something, the index is searched with several complementary methods whose results are merged:

- the visitor's own words;
- the same words plus everyday synonyms, so "cost" can find a page that says "tuition";
- passages that cover every idea in the question;
- pages whose title, headings or web address mention those ideas (a page at `/how-to-apply` is about applying).

Shallow, official pages are preferred over deep news or archive pages when relevance is close. Follow-up questions
("how much is it?") are rewritten using the conversation so far. Broad questions such as "what is this site about?" are
answered from the front page's own description.

## 4. Answering

The best passages go to the language model with strict instructions: use only these sources, cite each statement,
never guess figures or contact details, and treat the page text as data, not instructions. Without a language model,
the engine quotes the most relevant sentences instead. Either way, the answer carries numbered sources.

Before generating anything, the engine checks whether it should answer at all. If the evidence does not cover the
question's key words, it declines instead of improvising, and offers a contact address from your site.

Some questions never reach the model: greetings, contact questions (answered from details found on your pages), and
anything covered by a fixed rule you set.

## 5. Checking

The finished answer is verified against the evidence:

- source numbers that don't exist are removed, and an answer with no valid source is rejected;
- every price, date, percentage or quantity must appear in the passages used, or the answer is replaced by the quoted evidence.

When streaming, the text appears as it is written; the verified version replaces it at the end.

## Safety

Matrix Eye faces unusual risks because it reads other people's pages and shows results to other people's visitors:

- **Page text is untrusted.** Instruction-like paragraphs ("ignore all previous instructions…") are removed at reading time,
  the rest is fenced off from the model's instructions, and the answer is checked afterwards.
- **The crawler cannot be aimed at your internal network.** Addresses are validated before and again at connection time;
  private, local and cloud-metadata addresses are refused.
- **The chat window is inert text.** Answers are never inserted as HTML, and links are limited to `http` and `https`.
- **Only your websites can use your assistant**, and each visitor is rate-limited. The page holds no secret.

The [security page](/security/) lists what is tested and what is not done yet.

## Limits

- Search is based on words and synonyms. An unusual phrasing can be wrongly declined.
- Small local models are cautious; they sometimes decline two-part questions.
- It reads web pages, not PDFs, images or pages behind a login.
- Accuracy has been measured in English only. See [Accuracy and evaluation](accuracy.md).
