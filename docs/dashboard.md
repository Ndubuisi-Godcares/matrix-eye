# Template Studio (dashboard)

A local admin tool for designing a project's chat widget: three visual templates, a launcher icon library, brand
colours, and a live preview that runs the real, unmodified widget against the real API — not a mockup. Changes
persist to the project's settings and apply to every visitor automatically, without a redeploy.

## What it is, and is not

It is a **local admin tool**, the same trust model as the CLI or `curl -H "authorization: Bearer $MATRIX_EYE_API_KEY"`:
you run it on your own machine, give it an API key you already hold, and it talks to your API with that key kept
only in your browser's `localStorage`. It is **not** a hosted, multi-tenant login system — that is a later phase
(see `memory.md`'s Phase 4 roadmap), and this app must never be deployed publicly with a key baked in.

It is an early, deliberately small first slice, not the full customization platform a mature product would
eventually have:

- **3 templates** (Matrix Minimal, Modern SaaS, Developer Console), not a dozen.
- **6 launcher icons** across a few families, not a full icon library.
- **Manual brand colours**, not automatic logo/colour discovery from a crawled site.
- **One live preview state** (the widget open, talking to your real API), not the full
  welcome/typing/error/unanswered preview-state matrix.
- **Save, with Reset**, not a draft/publish lifecycle with undo/redo history.

None of this is faked to look more complete than it is: every control in the Studio changes something real in
`packages/widget`, and Save genuinely writes to the project's settings via the same
`PATCH /v1/projects/:id/settings` endpoint documented in the [widget guide](widget.md#saved-appearance-the-dashboards-template-studio).

## Running it

```bash
npm run dev -w @matrix-eye/dashboard
```

Opens on `http://localhost:5183`. It needs:

1. A running API (`npm run dev:api`) with `MATRIX_EYE_CORS_ORIGINS` including `http://localhost:5183`, so the
   browser is allowed to call the admin API cross-origin.
2. An admin API key — the same `MATRIX_EYE_API_KEY` the CLI uses.
3. At least one project already created (the Studio lists existing projects; it does not create them).

To see generated answers in the preview rather than just the decline response, also add
`http://localhost:5183` to the **project's own** `allowedOrigins` (not the same setting as step 1 above — that one
is for the admin API, this one is for the public widget endpoints the live preview talks to):

```bash
curl -X PATCH $API/v1/projects/$PROJECT/settings \
  -H "authorization: Bearer $MATRIX_EYE_API_KEY" -H "content-type: application/json" \
  -d '{"allowedOrigins": ["http://localhost:5183"]}'
```

## How the live preview works

The preview is not a styled `<div>` standing in for the widget — it mounts `@matrix-eye/widget` itself, unmodified,
inside a sandboxed `<iframe>` sized to the chosen viewport (desktop/tablet/mobile). The widget positions its panel
and launcher with `position: fixed`, which resolves relative to its *own* viewport; inside the iframe, that
viewport is the device frame, which is exactly the containment the preview needs with no special "preview mode"
added to the widget that every real visitor also runs. Switching to the mobile viewport genuinely exercises the
widget's own `@media (max-width: 480px)` full-screen behaviour, not an approximation of it.

## Extending it

The template and launcher-icon catalogs are metadata only (`src/lib/catalog.ts`); the actual rendering lives in
`packages/widget/src/styles.ts` (templates) and `src/widget.ts`'s `ICONS` (launcher icons, re-exported so the
dashboard never hand-duplicates the SVG path data). Adding a fourth template or a seventh icon means adding the
real CSS/icon there first, then one entry in the catalog and in the shared `WidgetTemplate` /
`LauncherIcon` types (`packages/sdk/src/types.ts`, mirrored in `apps/api/src/repositories.ts`'s
`ProjectAppearance` — the SDK is published standalone and does not import server-internal packages, so these are
kept in sync by hand, the same as `ProjectSettings` already is).
