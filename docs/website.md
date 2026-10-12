# The website

`apps/website` is the public marketing and documentation site. It is a static site (Astro): every page is built ahead of
time, so it is fast, cheap to host and has almost nothing to attack. The only dynamic parts are the waitlist and contact
forms, which talk to the API (`/v1/public/waitlist`, `/v1/public/contact`).

## Commands

| Command | What it does |
|---|---|
| `npm run dev -w @eagles-eye/website` | Development server with live reload. |
| `npm run build -w @eagles-eye/website` | Builds `apps/website/dist` and its search index. |
| `npm run serve -w @eagles-eye/website` | Serves the build with the production security headers (port 4400). |
| `npm run check -w @eagles-eye/website` | Type-checks pages and components (`astro check`). Part of `npm run typecheck`. |
| `npm run deploy-config -w @eagles-eye/website` | Regenerates `vercel.json` from the shared header rules. |

Tests live in `apps/website/test` and run with `npm test`: static checks (SEO, links, headings, size budgets) and
real-browser checks (accessibility with axe-core in light and dark, no console or policy errors, nothing loaded from other
websites, phone layout, keyboard use, search, and both forms against a real API).

## Settings

Set these when building. None are secret; they end up in the pages.

| Variable | Meaning | Default |
|---|---|---|
| `PUBLIC_SITE_URL` | The site's address, used in canonical links, the sitemap and link previews. | `https://eagleseye.ai` (placeholder) |
| `PUBLIC_API_URL` | Where the forms send data. Empty means the forms say the service is not connected yet. | empty |
| `PUBLIC_LEGAL_ENTITY` | Company name shown on the legal pages. | placeholder text |
| `PUBLIC_CONTACT_EMAIL` | Public contact address. When unset only the contact form is offered. | unset |

On the API side, `EAGLE_SITE_ORIGINS` must list the website's address (comma-separated), or the browser will block the
forms. `EAGLE_FORM_RATE_LIMIT_PER_MINUTE` changes the per-visitor form limit (default 5).

## Before launch: decisions only the owner can make

1. **Domain.** `eagleseye.ai` is a placeholder. Set `PUBLIC_SITE_URL`, then run `npm run deploy-config` and commit the new
   `vercel.json` (its security policy names the API address).
2. **Legal entity and contact address**, then **have a lawyer review `/privacy/` and `/terms/`**. They are drafts with
   bracketed gaps, marked `noindex`, and not linked as final.
3. **Pricing.** Every number is an estimate and is labelled so. Validate with real conversations before publishing as an offer.
4. **A hosting account.** Nothing is deployed. The build is plain files and works on any static host; `vercel.json` carries
   the headers for Vercel.
5. **Real screen-reader testing.** Automated checks catch many problems, not all. Test with NVDA or VoiceOver before launch.

## Deploying to Vercel

The repository carries a `vercel.json` at its root and another in `apps/website`, so it deploys with either project setting:

1. Import the GitHub repository in Vercel. Leave **Framework Preset** on "Other" and the **Root Directory** at its default (the
   repository root), or set it to `apps/website`. Do not override the build or output settings; the file sets them.
2. Add the build variables from the table above under **Settings > Environment Variables**: at least `PUBLIC_SITE_URL` and
   `PUBLIC_API_URL`.
3. Run `PUBLIC_API_URL=https://your-api npm run deploy-config -w @eagles-eye/website` and commit both files whenever the API
   address changes, because the security policy names it.

If a build says "No Output Directory named public", the project is not reading these files: check the Root Directory and
that the output directory field is empty.

## Design decisions

See [ADR-007](adr/ADR-007-website.md).
