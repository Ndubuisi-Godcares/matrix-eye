# MatrixEye: instructions for Claude Code

**Memory:** At the beginning of every new session, read the root `memory.md` before planning or modifying code. Treat it as the
project handover document. Verify relevant details against the current source code when necessary. Before ending a meaningful
development session, update `memory.md` with implementation changes, verification results, outstanding work, and the exact next action.

## Quick facts
- Product: MatrixEye (one word), a website-intelligence chat assistant that cites sources and abstains when unsure. Formerly "Eagle's Eye".
- Monorepo (npm workspaces, Node 24, TypeScript). Packages `@matrix-eye/*`; settings `MATRIX_EYE_*`.
- Checks: `npm run typecheck`, `npm run build`, `npm test`, `npm run eval -- --gate`.
- `git push` updates two GitHub repos (matrix-machine/matrix-eye and Ndubuisi-Godcares/matrix-eye). Confirm before pushing anywhere new.
- Windows + Git Bash: write multi-line scripts with the Write tool (heredoc quoting breaks); open files as UTF-8; never print `.env` values.
- Keep content honest (estimates labelled, drafts marked, no unbuilt claims). PDFs use the Yu Mincho font.
