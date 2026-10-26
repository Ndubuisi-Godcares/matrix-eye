---
title: "What we tested to make a chat widget accessible"
description: "Streaming text breaks screen readers in a specific way. The decisions behind an accessible chat widget, what automated checks can prove, and what they cannot."
date: 2026-10-12
tags: ["accessibility", "engineering"]
---

A chat widget looks simple and is surprisingly difficult to make accessible. This documents what was built into the
MatrixEye widget, why, and, just as important, what has not yet been proven.

## The problem unique to streaming chat

Answers render word by word. Marking the conversation as a live region causes a screen reader to announce every
change, which means it reads half-formed sentences aloud and re-reads them as further words arrive. The result is
noise, not information.

The approach taken: the transcript is *not* a live region. While an answer streams, nothing is announced. Once the
answer is complete and verified, a single hidden, polite live region receives the final text, so a screen-reader
user hears the answer exactly once, in full. The typing indicator carries a text alternative, so its presence is
still communicated.

## Keyboard and focus

- Opening the widget moves focus into the input field, so a keyboard user can type immediately.
- Escape, or the close control, closes it and returns focus to the control that opened it — focus is never stranded.
- Every control is a real button or text field with an accessible name. The send button becomes "Stop generating"
  while an answer streams, with its name updated to match.
- Enter sends; Shift+Enter inserts a line break. Enter is suppressed while an input method editor is composing text
  (for example, typing Japanese), which would otherwise send an incomplete character sequence.
- The transcript is focusable and scrollable by keyboard.

## Seeing it clearly

- Text meets WCAG 2.1 AA contrast in both light and dark. When a project sets a brand colour, the text colour
  against it is computed: white if that reads well, otherwise navy, otherwise black. Mid-tone reds, for example,
  fail against both white and navy but pass against black.
- Focus rings are always visible, and thicker than the browser default.
- Animation is suppressed for visitors whose system requests reduced motion, and forced-colors (high-contrast) mode is supported.
- On a phone the widget becomes full-screen, and the input uses 16px text so iOS does not zoom on focus.

## Safe by construction

Answers are rendered as plain text, never as markup, and links are restricted to `http` and `https`, so a hostile
web page cannot inject script into the chat widget through model output. Tests feed it script tags,
event-handler attributes and `javascript:` links and confirm each renders as inert text.

## What runs on every change

The browser test suite loads the real widget in Chromium and runs an automated accessibility check (axe-core, WCAG
2.1 A and AA plus best practices) with an answer on screen, in light, dark and a custom brand colour. That check
has already caught real problems: contrast failures on a custom colour, and a measurement error during an active
animation.

## What this does not prove

Automated checks surface only part of the problem space, commonly cited at around a third. They cannot establish
whether a screen reader's announcement is coherent, whether focus order feels natural, or whether the experience is
actually pleasant to use. Stated plainly:

- Testing with real screen readers (NVDA, JAWS, VoiceOver, TalkBack) has **not yet** happened; it is planned before launch.
- Review by disabled users has not happened. Volunteers are welcome.
- The widget ships with English text. Every label is overridable, but translations have not been reviewed.

Barriers found should be reported via the [contact page](/contact/).
