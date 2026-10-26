---
title: "Add an assistant to a React or Next.js site"
description: "Create a project, read your site, allow your domain, and add the chat window with the React component or a single script tag. A practical walkthrough."
date: 2026-10-12
tags: ["react", "nextjs", "tutorial"]
---

This walkthrough adds a chat assistant, grounded in your own website's content, to a React or Next.js app. It
assumes MatrixEye is running (see the [quickstart](/docs/quickstart/)) and that you have your API's address and
admin key.

## 1. Create a project and index your site

Run this once, from a script on your own computer or server — never from browser code, since it uses the secret key.

```ts
import { MatrixEyeClient } from "@matrix-eye/sdk";

const matrix = new MatrixEyeClient({ baseUrl: "https://api.example.com", apiKey: process.env.MATRIX_EYE_API_KEY });

const project = await matrix.createProject({
  name: "Example Store",
  siteUrl: "https://www.example.com",
  settings: {
    // Exactly the websites that will show the chat window. Include www if you use it.
    allowedOrigins: ["https://www.example.com", "http://localhost:3000"],
    suggestedQuestions: ["How do I return an item?", "Do you ship abroad?"],
  },
});

await matrix.waitForCrawl((await matrix.startCrawl(project.id)).id);
console.log(project.id); // you will need this next
```

If the site is built with React and the crawl indexes nothing, the pages render client-side. Run the crawl with the
rendering option described in the [self-hosting guide](/docs/self-hosting/).

## 2. Add the component

In Next.js (App Router), the chat window runs in the browser, so use it from a client component:

```tsx
// app/assistant.tsx
"use client";
import { MatrixEyeChat } from "@matrix-eye/widget-react";

export default function Assistant() {
  return <MatrixEyeChat project="YOUR_PROJECT_ID" api="https://api.example.com" color="#0f2238" />;
}
```

```tsx
// app/layout.tsx
import Assistant from "./assistant";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Assistant />
      </body>
    </html>
  );
}
```

The component is safe to render on the server: it renders an empty placeholder there and loads the widget in the
browser. In a plain React app, import it the same way.

## 3. Or use a single script tag

For any other site, including WordPress, this is sufficient, placed just before `</body>`:

```html
<script src="https://YOUR-HOST/matrix-eye-widget.js" defer
        data-project="YOUR_PROJECT_ID"
        data-api="https://api.example.com"></script>
```

## 4. Check it works

- Open the site. A round launcher appears in the corner. If it does not, open the browser console: the widget
  reports exactly what is missing.
- "This assistant isn't available on this website" means the page's address is not in `allowedOrigins`. Origins must
  match exactly: `https://example.com` and `https://www.example.com` are distinct.
- Ask the questions visitors ask most, and flag weak answers with a thumbs down.

## 5. Improve it from real use

```ts
const unhappy = await matrix.listFeedback(project.id, "down");
for (const item of unhappy) console.log(item.question, "->", item.answer);
```

Each entry is a real visitor question paired with the answer actually given. For each one, either the source page
needs to state the fact more clearly, or a fixed rule should define the answer. After editing the site, re-run the
crawl — only changed pages are reprocessed.

## Styling and behaviour

`color`, `accent`, `position` (`left` or `right`), `theme` (`light`, `dark` or `auto`), `title`, `greeting`,
`placeholder` and `open` are all supported, and every text label can be overridden to translate the window. The full
list is in the [widget guide](/docs/widget/).
