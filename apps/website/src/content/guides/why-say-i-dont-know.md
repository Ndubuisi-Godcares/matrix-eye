---
title: "Why your website assistant should say \"I don't know\""
description: "Real examples from testing show why a confident wrong answer costs more than an honest refusal, and the four checks that make an assistant admit what it can't answer."
date: 2026-10-12
tags: ["accuracy", "design"]
---

A question about a degree a college does not offer should produce no answer. During testing on a real college
website, it produced one.

We asked an assistant running in quote-only mode: "Do you have a medicine degree?" The college offers no such
programme. One page, about graduate careers, mentions that some alumni went on to earn medical degrees. Retrieval
matched the word "medicine", surfaced that page, and the assistant quoted it directly. The citation was technically
accurate. The impression it left — that the college teaches medicine — was not.

This is the failure case that matters most: not a visible error someone reports, but a plausible-looking answer,
backed by a source link that implies verification, that is quietly wrong.

## Why this happens

Retrieval always returns something. Any question matches *some* page on a large site, because common words such as
"degree" and "campus" recur everywhere. A system built only to find the most relevant text has no mechanism to
distinguish "here is the answer" from "here is the least irrelevant page available".

Language models compound this differently: they generate fluent text regardless of whether the underlying claim is
known. A confident, well-formed sentence reads as credible independent of whether it's correct.

## Four checks that fixed it

**1. Check the word that decides the answer.** In "medicine degree", the common word is "degree"; the word that
decides the answer is "medicine". So the assistant finds the rarest word in the question and requires the evidence to
actually support it. If the site never mentions it, the assistant declines. That stops a whole family of wrong
answers, such as a question about a swimming pool on a site with no pool, where the matching words were all common ones.

This check is insufficient alone, and the medicine example demonstrates why: the word *does* appear on the site,
on that alumni page, so a quote-only assistant still answered with it. What resolved that case was comprehension —
a language model given the same passage correctly inferred that "some alumni earned medical degrees" does not mean
"we offer one", and declined. Word-presence checks catch absence; only comprehension catches a near miss. This is
why quote-only mode and model mode are measured separately, and why the former is described as safe but unsophisticated.

**2. Verify every figure.** Models fabricate numbers. Every price, date and percentage in an answer must appear
verbatim in the passages it was generated from. If a model writes "$5,000" and the source says "$4,500", the
answer is discarded and replaced with the quoted source text. The check is cheap, purely mechanical, and
eliminates an entire class of error.

**3. Source contact details from the page, never from the model.** Email addresses and phone numbers are extracted
directly from indexed pages. A model never generates them, so it cannot fabricate a plausible-looking address.

**4. Require a valid source.** An answer with no valid citation is rejected outright, and citation markers that
reference no real source are stripped.

## It still has to be useful

Over-refusing is its own failure mode. An assistant that declines every difficult question has no practical value.
Both directions are measured: how often it answers correctly when the site has the answer, and how often it
declines when it does not. The test set requires both to score highly at once, which surfaced a real cost: a small
local model declines some compound, two-part questions a person would answer without hesitation. That trade-off is
reported openly on the [accuracy page](/docs/accuracy/), not hidden.

## What an honest refusal looks like

> I'm not able to answer that one with confidence. You can email admissions@example.edu.

It is brief, it does not apologize at length, and it points somewhere useful, with a contact address drawn from the
site itself. It speaks in the first person, the way a staff member would, rather than describing "the website" as
something separate from itself — a decline is still the assistant responding, not a search tool reporting on a
resource it queried. The wording is selected from a small set of phrasings, chosen deterministically by the
question rather than at random, so the same question reads identically on a support screenshot, while a visitor
asking several unanswerable questions in one session doesn't see the identical sentence repeated. When retrieval
found a page that came close, the reply names it, flagged honestly as not quite covering the question, rather than
staying silent about it. A visitor who receives this has lost ten seconds. A visitor who receives a confident wrong
answer may have lost a semester.

Every answer in the chat widget also carries a thumbs up/down control. The negative ones are the highest-value test
cases available — real questions paired with the real answer that missed.
