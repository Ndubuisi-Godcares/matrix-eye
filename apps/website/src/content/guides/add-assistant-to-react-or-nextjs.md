---
title: "Add an assistant to a React or Next.js site"
description: "Create a project, read your site, allow your domain, and add the chat window with the React component or a single script tag. A practical walkthrough."
date: 2026-10-12
tags: ["react", "nextjs", "tutorial"]
---

This walkthrough adds a chat assistant that answers from your own website to a React or Next.js app. It assumes
Eagle's Eye is running (see the [quickstart](/docs/quickstart/)) and that you have the address of your API and your
admin key.

## 1. Create a project and read your site

Do this once, from a script on your computer or server, never in browser code, because it uses your secret key.

```ts
import { EagleEyeClient } from "@eagles-eye/sdk";

const eagle = new EagleEyeClient({ baseUrl: "https://api.example.com", apiKey: process.env.EAGLE_API_KEY });

const project = await eagle.createProject({
  name: "Example Store",
  siteUrl: "https://www.example.com",
  settings: {
    // Exactly the websites that will show the chat window. Include www if you use it.
    allowedOrigins: ["https://www.example.com", "http://localhost:3000"],
    suggestedQuestions: ["How do I return an item?", "Do you ship abroad?"],
  },
});

await eagle.waitForCrawl((await eagle.startCrawl(project.id)).id);
console.log(project.id); // you will need this next
```

If your site is built with React and the crawl finds nothing, the pages are drawn in the browser. Run the crawl with
the rendering option described in the [self-hosting guide](/docs/self-hosting/).

## 2. Add the component

In Next.js (App Router), the chat window runs in the browser, so use it from a client component:

```tsx
// app/assistant.tsx
"use client";
import { EaglesEyeChat } from "@eagles-eye/widget-react";

export default function Assistant() {
  return <EaglesEyeChat project="YOUR_PROJECT_ID" api="https://api.example.com" color="#0f2238" />;
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

The component is safe to render on the server: it renders an empty placeholder there and loads the chat window in the
browser. In a plain React app, import it the same way.

## 3. Or use one script tag

For any other site, including WordPress, this is enough, placed just before `</body>`:

```html
<script src="https://YOUR-HOST/eagles-eye-widget.js" defer
        data-project="YOUR_PROJECT_ID"
        data-api="https://api.example.com"></script>
```

## 4. Check it works

- Open your site. A round chat button appears in the corner. If it does not, open the browser console: the widget
  explains exactly what is missing.
- If it says "This assistant isn't available on this website", the page's address is not in `allowedOrigins`.
  Origins must match exactly: `https://example.com` and `https://www.example.com` are different.
- Ask the questions your visitors ask most. Click 👎 on weak answers.

## 5. Improve it from real use

```ts
const unhappy = await eagle.listFeedback(project.id, "down");
for (const item of unhappy) console.log(item.question, "->", item.answer);
```

Each entry is a real visitor question with the answer they were given. For every one, either the page needs to say
the thing more clearly, or a fixed rule should set the answer. After changing the site, re-run the crawl; only changed
pages are read again.

## Styling and behaviour

`color`, `accent`, `position` (`left` or `right`), `theme` (`light`, `dark` or `auto`), `title`, `greeting`,
`placeholder` and `open` are all supported, and every text label can be overridden to translate the window. The full
list is in the [widget guide](/docs/widget/).
