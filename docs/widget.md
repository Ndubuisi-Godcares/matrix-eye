# Chat widget

A floating chat window that answers visitors' questions from your website and cites the pages it used.
One script tag, no build step. Its styles live in a Shadow DOM, so your site's CSS cannot break it and it cannot
break your site. About 10 KB gzipped, no dependencies.

## 1. Allow your website

A browser may only use the assistant if the project lists the website's **origin** (scheme, host, port; no path).
A new project is closed until you do this.

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
| `theme` | `light`, `dark`, `auto` (follows the visitor's system) | `auto` |
| `greeting` | opening message (else the project's greeting, else a default) | |
| `placeholder` | input hint | `Ask a question…` |
| `open` | start with the window open | closed |
| `branding` | `false` hides "Powered by MatrixEye" | shown |
| `persist` | `false` stops saving the conversation for the browser tab | saved |
| `labels` (init only) | override any text, e.g. to translate | English |

Starter questions and the greeting can be set per project (not per page):
`PATCH /v1/projects/:id/settings` with `greeting` and `suggestedQuestions` (up to four).

## 4. What visitors get

- Answers appear as they are written, then are replaced by the checked version with numbered sources.
- Every factual answer links to the pages it came from; "I couldn't find that" when the site does not say.
- 👍 / 👎 on each answer. Read them with `GET /v1/projects/:id/feedback?rating=down`. They show exactly what to fix.
- Stop button while an answer is being written; "Try again" after an error; a "new conversation" button.
- The conversation survives a page reload within the same tab (sessionStorage; never shared or sent anywhere).

## 5. Accessibility

Built to WCAG 2.1 AA and tested in a real browser with axe-core (light, dark and custom colours):

- Fully keyboard-operable. Opening moves focus into the input; Escape or the close button returns it to the launcher.
- Screen readers: labelled dialog, transcript and controls; the finished answer is announced once (streamed
  fragments are not read out); links that open new tabs say so; the typing indicator has a text alternative.
- Colour contrast meets AA, focus rings are always visible, animation stops under *reduce motion*, and forced-colors
  (high-contrast) mode is supported.
- On phones the window becomes a full-screen sheet; the input uses 16 px text so iOS does not zoom.

Automated tools find only part of the problems. Testing with real screen readers (NVDA, VoiceOver) is still planned
before public launch.

## 6. Security notes

- Answers are inserted as plain text, never HTML, so a hostile page cannot inject script through the model.
- Links are only created for `http(s)` URLs and open with `rel="noopener noreferrer"`.
- The widget holds no secret. It can only chat, send feedback and read display settings, and only from allowed origins.
- The origin check stops other *websites* from embedding your assistant. It cannot stop a script outside a browser from
  calling the public endpoints, so those are rate-limited per visitor (default 20 messages a minute).

## 7. Build

`npm run build` writes `packages/widget/dist/matrix-eye-widget.js` (script tag) and an ES module. The build fails if the
script exceeds 30 KB gzipped.
