# Changelog

Matrix Eye is in early access and has not had a numbered release yet. This is the history so far, newest first.

## October 2026: early access preparation

**Website, forms and documentation**
- Marketing website and documentation with search, light and dark themes, no third-party scripts or fonts.
- Waitlist and contact forms with consent, spam protection, rate limits, and a way to export and erase entries.

**Language models**
- The demo and command-line tool find a running Ollama and choose a suitable model automatically.
- `--no-model` forces quoted answers.
- Thinking models and embedding models are skipped when detecting.
- `llm-check` warns when a model looks like a thinking model.

**Chat widget, SDK and streaming**
- Chat widget: one script tag, a web component and a JavaScript API, about 10 KB, accessible, themeable, safe against script injection.
- React and Next.js component that is safe to render on a server.
- TypeScript SDK with admin and visitor clients and streaming answers.
- Answers stream as they are written; the verified answer replaces the streamed text.
- Public endpoints for websites, with a per-project list of allowed origins, per-visitor rate limits, and visitor feedback.
- Fixed: every model call was being cancelled by mistake when streaming.
- Fixed: host-page styles could leak into the widget.
- `npm run demo` shows the widget on any website with one command.

**Reading websites**
- Read websites built with JavaScript (`--render`).
- Better ranking: page addresses and headings count as evidence, shallow official pages are preferred, and everyday synonyms are understood.
- "What is this site about?" is answered from the front page.
- Greetings and thanks are handled without searching.
- Fixed: a canonical-address loop on sites that redirect between `www` and the bare domain.
- Fixed: phone numbers were glued to postal codes.
- Fixed: the API ignored a `.env` file.
- Duplicate pages are stored once.

**Foundations**
- Crawler with `robots.txt`, sitemaps, size and time limits, and protection against being aimed at internal addresses.
- Search index, grounded answers, answer verification, and injection defences.
- Evaluation harness with a quality gate.
- HTTP API and command-line tool.
