# Accuracy and evaluation

An assistant that is usually right and sometimes confidently wrong is worse than useless, so MatrixEye measures
itself, in public, including where it falls short.

## What is measured

A test set of labelled questions is asked against a crawled website, and each answer is scored:

| Measure | Question it answers | Target |
|---|---|---|
| Correctness | For questions the site can answer, did it give the right content with a citation to the right page? | 85% or more |
| Citation hit rate | When it answered, did it cite a page that actually supports the answer? | 95% or more |
| Correct refusal | For questions the site cannot answer, did it say so instead of guessing? | 90% or more |
| Unsupported figures | Did any answer contain a number that appears nowhere on the site? | none |
| Injection resistance | Did hostile text planted on a page ever appear in an answer? | 100% |

The set mixes direct facts, paraphrases, follow-up questions that need earlier context, unanswerable questions,
and attacks. These targets are a gate in our automated checks: a change that misses any of them cannot be merged.

## Current results

Measured on 48 questions about a fictional university website built for testing:

| Measure | Quoting the site (no model) | With a small local model (Qwen3 4B Instruct) |
|---|---|---|
| Correctness | 100% | 97.4% |
| Citation hit rate | 100% | 100% |
| Correct refusal | 100% | 100% |
| Unsupported figures | 0 | 0 |
| Injection resistance | 100% | 100% |
| Median response time | under 1 ms | about 3.2 seconds on a laptop with a 4 GB graphics card |

## How to read those numbers

**They are a regression baseline, not a promise.** The test set is small, comes from one invented website, and the
engine was tuned while building it. A high score there shows that nothing has broken; it does not show how it will
perform on your website. Honest expectations:

- On real sites we found problems the test set could not show (examples below). Each was fixed and turned into a permanent test.
- A small model is cautious: it sometimes declines two-part questions, and lists can be incomplete.
- Quoting mode cannot summarise. It finds the right page and quotes the most relevant sentences, occasionally the wrong ones.
- Accuracy has been measured in English only.

**Problems found on real websites, and what changed:**

| What went wrong | Fix |
|---|---|
| "What is this site about?" quoted a random sentence | Answered from the front page's own description |
| "Admission criteria" missed a page that said "requirements" | Everyday synonyms, and page addresses and headings now count as evidence |
| One very common word drowned out the passage that mattered | Words found on most pages no longer decide the ranking |
| A phone number was glued to a postal code | Phone detection fixed |
| A JavaScript-only site read as empty | Browser rendering mode |
| Identical pages stored several times | De-duplication by content |

## Measure it on your own website

Write a file of questions and the pages that should answer them, then score it. Copy the example set that ships with the project,
replace the questions, and run:

```bash
npm run eval -- --url https://your-website.example --dataset my-questions.json
```

Each question says whether the site can answer it, which page should be cited, and text the answer must (or must never) contain.
Add questions your visitors really ask, plus a few the site cannot answer, because refusing correctly is part of the score.

## Learn from your visitors

Every answer in the chat window has thumbs up and down. Read the unhelpful ones with
`GET /v1/projects/PROJECT_ID/feedback?rating=down`: they are real questions with the answer given, which makes the best
test cases. Add them to your question file, fix the page or add a rule, and re-run the evaluation.
