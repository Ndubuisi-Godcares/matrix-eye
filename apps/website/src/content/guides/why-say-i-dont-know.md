---
title: "Why your website assistant should say \"I don't know\""
description: "Real examples from testing show why a confident wrong answer costs more than an honest refusal, and the four checks that make an assistant admit what it can't answer."
date: 2026-10-12
tags: ["accuracy", "design"]
---

A question about a degree a college does not offer should not get an answer. In our testing on a real college website, it did.

We asked an assistant that quotes a site's pages: "Do you have a medicine degree?" The college has no such programme.
But one page, about graduate careers, mentions that some alumni went on to earn medical degrees. A search engine sees
the word "medicine", finds that page, and the assistant happily quoted it. Technically it was a cited quote. In
practice a prospective student could walk away believing the college teaches medicine.

That is the failure that worries us most. Not a visible mistake that someone reports, but a plausible answer, with a
source link that makes it look checked, that is quietly wrong.

## Why this happens

Search always returns something. Any question matches *some* page on a large site, because common words such as
"degree" and "campus" appear everywhere. A system built only to find the most relevant text has no way to tell the
difference between "here is the answer" and "here is the least irrelevant page".

Language models make this worse in a different way: they write fluently whether or not they know. A smooth,
confident sentence is easy to believe.

## Four checks that fixed it

**1. Check the word that decides the answer.** In "medicine degree", the common word is "degree"; the word that
decides the answer is "medicine". So the assistant finds the rarest word in the question and requires the evidence to
actually support it. If the site never mentions it, the assistant declines. That stops a whole family of wrong
answers, such as a question about a swimming pool on a site with no pool, where the matching words were all common ones.

It is not enough on its own, and our medicine example shows why. The word *does* appear on the site, on that alumni page, so
an assistant that only quotes pages still answered with it. What fixed that case was reading comprehension: a language
model given the same passage understood that "some alumni earned medical degrees" does not mean "we offer one", and
declined. Word checks catch absence; only understanding catches a near miss. That is why we measure the quote-only
mode and the model mode separately, and why we describe the first as safe but unsophisticated.

**2. Verify the numbers.** Models invent figures. Every price, date and percentage in an answer must appear in the
passages it was built from. If a model writes "$5,000" and the page says "$4,500", the answer is thrown away and
replaced with the quoted page text. This is cheap, mechanical and catches a whole class of errors.

**3. Take contact details from the page, not the model.** Email addresses and phone numbers are copied from your
pages. A model never writes them, so it cannot invent a plausible-looking address.

**4. Require a source.** An answer with no valid source link is rejected, and source numbers that do not exist are removed.

## It still has to be useful

Refusing too much is its own failure. If every hard question gets a flat refusal, nobody uses the assistant.
We measure both directions: how often it answers correctly when the site has the answer, and how often it refuses
when it does not. Our small test set requires both to be high at once, and we found the cost: a small local model
declines some two-part questions that a person would answer. We report that openly in the [accuracy
page](/docs/accuracy/) rather than hide it.

## What an honest refusal looks like

> This website doesn't cover that in enough detail for me to answer confidently. You can email admissions@example.edu.

It is short, it does not apologise at length, and it points somewhere useful, using a contact address taken from the
site itself. The wording is picked from a small set of professional phrasings, chosen by the question rather than at
random, so the same question always reads the same way on a support screenshot, but a visitor asking several
unanswerable questions doesn't see the identical sentence every time. When retrieval found a page that came close,
the reply names it, honestly flagged as not quite covering the question, rather than staying silent about it. A
visitor who gets this has lost ten seconds. A visitor who gets a confident wrong answer may have lost a semester.

Every answer in the chat window also carries thumbs up and down. The unhelpful ones are your best test cases, because
they are real questions with real answers that missed.
