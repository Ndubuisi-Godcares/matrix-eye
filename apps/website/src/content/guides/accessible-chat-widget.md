---
title: "What we tested to make a chat widget accessible"
description: "Streaming text breaks screen readers in a specific way. The decisions behind an accessible chat window, what automated audits can prove, and what they cannot."
date: 2026-10-12
tags: ["accessibility", "engineering"]
---

A chat window looks simple and is surprisingly hard to make accessible. Here is what we built into the Matrix Eye
widget, why, and, just as important, what we have not proven.

## The problem unique to streaming chat

Answers appear word by word. If you mark the conversation as a live region, a screen reader announces every change,
which means it starts reading half-formed sentences and re-reads them as more words arrive. The result is noise.

Our approach: the transcript is *not* a live region. While an answer streams, nothing is announced. When the answer
is complete and verified, one hidden polite live region receives the final text, so a screen-reader user hears the
answer once, in full. The typing indicator has a text alternative so they know something is happening.

## Keyboard and focus

- Opening the window moves focus to the question box, so a keyboard user can type at once.
- Escape, or the close button, closes it and returns focus to the button that opened it. Nobody gets lost.
- Every control is a real button or text field with a name. The send button becomes "Stop generating" while an
  answer is being written, and its name changes with it.
- Enter sends; Shift+Enter adds a line. Enter is ignored while someone is composing text with an input method editor
  (for example typing Japanese), which would otherwise send half a character sequence.
- The transcript can be focused and scrolled with the keyboard.

## Seeing it clearly

- Text meets WCAG 2.1 AA contrast in light and dark. When a site owner picks a brand colour, the text colour on it is
  computed: white if it reads well, else navy, else black. Mid-tone reds, for example, fail with white or navy but pass with black.
- Focus rings are always visible and thicker than the default.
- Animation stops for people who ask their system to reduce motion, and high-contrast (forced colours) mode is supported.
- On a phone the window becomes full-screen, and the text box uses 16-pixel type so iPhones do not zoom into it.

## Safe by construction

Answers are inserted as plain text, never as markup, and links are limited to `http` and `https`, so a hostile web
page cannot get script into the chat window through the model's output. Tests feed it script tags, event-handler
attributes and `javascript:` links and confirm they appear as harmless text.

## What we run on every change

The browser tests load the real widget in Chromium and run an automated accessibility audit (axe-core, WCAG 2.1 A and AA plus
best practices) with an answer on screen, in light, dark and a custom brand colour. The audit has already
caught real problems for us: contrast failures on a custom colour, and a measuring error while an animation was running.

## What this does not prove

Automated audits find only part of the problems, often quoted at around a third. They cannot tell you whether a
screen reader's announcement makes sense, whether focus order feels right, or whether the experience is pleasant. So:

- We have **not yet** tested with real screen readers (NVDA, JAWS, VoiceOver, TalkBack). That is planned before launch.
- We have not had disabled users review it. We would like to, and welcome volunteers.
- The window ships with English text. Every label can be overridden, but translations are not yet reviewed.

If you find a barrier, we want to hear about it: use the [contact page](/contact/).
