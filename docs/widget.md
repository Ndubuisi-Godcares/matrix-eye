# Chat widget

An embeddable chat widget that answers visitor questions from your website's content and cites the pages it drew
from. One script tag, no build step. Its styles are isolated in a Shadow DOM, so the host page's CSS cannot affect
it and it cannot affect the host page. About 10 KB gzipped, no dependencies.

## 1. Allow your website

A browser may only use the assistant from an **origin** (scheme, host, port; no path) explicitly listed on the
project. A new project accepts no origins until one is added.

```bash
curl -X PATCH $API/v1/projects/$PROJECT/settings \
  -H "authorization: Bearer $MATRIX_EYE_API_KEY" -H "content-type: application/json" \
  -d '{"allowedOrigins": ["https://www.school.edu", "https://school.edu"]}'
```

`"*"` allows any website. Use it only for demos. `https://school.edu` and `https://www.school.edu` are different
origins; list both if both are used.

## 2. Add it to a page

```html
<script src="https://YOUR-HOST/matrix-eye-widget.js" defer
        data-project="PROJECT_ID"
        data-api="https://YOUR-API-HOST"></script>
```

Other ways, same widget:

```html
<matrix-eye-chat project="PROJECT_ID" api="https://YOUR-API-HOST"></matrix-eye-chat>
```

```js
const chat = MatrixEye.init({ project: "PROJECT_ID", api: "https://YOUR-API-HOST", color: "#0f2238" });
chat.open(); chat.ask("How do I apply?"); chat.destroy();
```

React / Next.js:

```tsx
"use client"; // Next.js App Router: required, because the widget runs in the browser
import { MatrixEyeChat } from "@matrix-eye/widget-react";
export default function Assistant() {
  return <MatrixEyeChat project="PROJECT_ID" api="https://YOUR-API-HOST" />;
}
```

Try it locally on any site: `npm run demo -- https://example.edu` (see the [quickstart](quickstart.md)).

## 3. Settings

| Setting (`data-…` / attribute / `init` key) | Values | Default |
|---|---|---|
| `project`, `api` | project id; API address (`/` = same origin) | required |
| `position` | `right`, `left` | `right` |
| `title` | header text | the project's name |
| `color` | `#rrggbb` header, launcher and your messages. Text colour is chosen automatically for contrast | `#0f2238` |
| `accent` | `#rrggbb` borders and highlights | `#c19a5b` |
| `template` | `minimal`, `saas`, `developer` — changes spacing, radius and type treatment, not just colour | `minimal` |
| `launcher-icon` / `launcherIcon` (`data-launcher-icon` on the script/element) | `chat`, `sparkle`, `headset`, `help`, `book`, `dot` | `chat` |
| `theme` | `light`, `dark`, `auto` (follows the visitor's system) | `auto` |
| `greeting` | opening message (else the project's greeting, else a default) | |
| `placeholder` | input hint | `Ask a question…` |
| `open` | start with the window open | closed |
| `branding` | `false` hides "Powered by MatrixEye" | shown |
| `persist` | `false` stops saving the conversation for the browser tab | saved |
| `labels` (init only) | override any text, e.g. to translate | English |

Starter questions and the greeting can be set per project (not per page):
`PATCH /v1/projects/:id/settings` with `greeting` and `suggestedQuestions` (up to four).

### Saved appearance (the dashboard's Template Studio)

`template`, `launcherIcon`, `color` and `accent` can also be saved per project with
`PATCH /v1/projects/:id/settings` and an `appearance` object, e.g.
`{"appearance": {"template": "saas", "launcherIcon": "sparkle", "color": "#0f2238", "accent": "#c19a5b"}}`. Every
visitor's widget picks this up automatically from `GET /v1/public/projects/:id/config`, with no change needed to
the script tag on your site. **An explicit value on the script tag or `init()` call always wins** over the saved
one, field by field — so you can save a site-wide default from the dashboard and still override it per page if
you need to. See `apps/dashboard` (`npm run dev -w @matrix-eye/dashboard`) for a visual editor that calls this
same endpoint and shows a live preview; it needs an admin API key and `MATRIX_EYE_CORS_ORIGINS` to include the
dashboard's own origin (it is a local admin tool for the person who already holds that key, the same trust model
as the CLI — not a public multi-tenant login).

## 4. What visitors get

- Answers stream as they are generated, then are replaced by the verified version with numbered source references.
- Every factual answer links to the page it was grounded in; the assistant abstains when the site doesn't say.
- A thumbs up/down on each answer, reviewable with `GET /v1/projects/:id/feedback?rating=down` to surface exactly what to fix.
- A stop control while an answer streams, a retry after an error, and a control to start a new conversation.
- The conversation persists across a reload within the same tab (`sessionStorage`; never transmitted or shared).

## 5. Accessibility

Built to WCAG 2.1 AA and checked in a real browser with axe-core (light, dark and custom colours):

- Fully keyboard-operable: opening moves focus into the input; Escape or the close control returns it to the launcher.
- Screen reader support: a labelled dialog, transcript and controls; the finished answer is announced once (streamed
  fragments are not read aloud); links that open new tabs are identified as such; the typing indicator has a text alternative.
- Colour contrast meets AA, focus rings are always visible, animation is suppressed under *reduced motion*, and
  forced-colors (high-contrast) mode is supported.
- On phones the window becomes a full-screen sheet; the input uses 16px text so iOS does not zoom on focus.

Automated checks surface only part of the problem space. Testing with real screen readers (NVDA, VoiceOver) remains
planned before public launch.

## 6. Security notes

- Answers are rendered as plain text, never HTML, so a hostile page cannot inject script through model output.
- Links are created only for `http(s)` URLs and open with `rel="noopener noreferrer"`.
- The widget holds no secret: it can only send chat messages and feedback and read display settings, and only from allowed origins.
- The origin check stops other *websites* from embedding the assistant. It does not stop a script outside a browser
  from calling the public endpoints directly, so those are rate-limited per visitor (default 20 messages a minute).

## 7. Build

`npm run build` writes `packages/widget/dist/matrix-eye-widget.js` (script tag) and an ES module. The build fails if the
script exceeds 30 KB gzipped.
