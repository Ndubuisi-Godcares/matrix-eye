# MatrixEye: instructions for Claude Code

**Memory (read this before anything else):** At the beginning of every new session — and especially the first message after a
conversation reset or a switch to a different account/machine — read the **entire** root `memory.md` file top to bottom before
planning, answering status questions, or modifying code. Do not skim or read only the last section: `memory.md` is written to be
a complete, standalone handover, so treat every section as required reading, in particular:
- **Section 1** (identity/overview) and **Section 3** (architecture and full directory map / project topology) — so you know what
  the product is and where everything lives without re-deriving it from scratch.
- **Section 2, 6, 8** (stack, database schema, env vars/integrations) — the concrete technical facts.
- **Section 9** (verification status) and **Section 11, "Current development position" — READ THIS FIRST** — the exact point
  work stopped and the next concrete action. Section 11 is the single most load-bearing section: if short on time, read it, but
  the rest should still be read before doing real work.
- **Section 12** (prioritized backlog) and **Section 13** (known issues/troubleshooting) — so you don't repeat solved problems
  or re-propose rejected ideas.
- **Section 15** (session handover log) — the chronological narrative, useful for "what happened and when" questions.

Then verify the specific details relevant to the current task against the current source code/`git log`/`git status` (memory
says what was VERIFIED/REPORTED/UNVERIFIED and when; things drift). If the user asks "what's next" or "how ready is this," answer
from Section 11/12 after a quick re-verification, not from guesswork.

Before ending a meaningful development session (and immediately if the user signals they are about to reset the conversation or
switch accounts), update `memory.md` with implementation changes, verification results, outstanding work, and the exact next
action — edit sections in place, don't just append, so the file never lies about current state. This file is the only thing that
survives a conversation reset or an account switch: if it isn't in `memory.md`, it is lost to future sessions.

## Quick facts
- Product: MatrixEye (one word), a website-intelligence chat assistant that cites sources and abstains when unsure. Formerly "Eagle's Eye".
- Monorepo (npm workspaces, Node 24, TypeScript). Packages `@matrix-eye/*`; settings `MATRIX_EYE_*`.
- Checks: `npm run typecheck`, `npm run build`, `npm test`, `npm run eval -- --gate`.
- `git push` updates two GitHub repos (matrix-machine/matrix-eye and Ndubuisi-Godcares/matrix-eye). Confirm before pushing anywhere new.
- Windows + Git Bash: write multi-line scripts with the Write tool (heredoc quoting breaks); open files as UTF-8; never print `.env` values.
- Keep content honest (estimates labelled, drafts marked, no unbuilt claims). PDFs use the Yu Mincho font.
