/**
 * Server-side rendering (Next.js, Astro...). This file runs in plain Node: there is no `window`, `document` or
 * `HTMLElement`, exactly as on a server. Importing and rendering the component must not touch the browser.
 */
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EaglesEyeChat } from "../src";

describe("server-side rendering", () => {
  it("really is a server-like environment", () => {
    expect(typeof document).toBe("undefined");
    expect(typeof HTMLElement).toBe("undefined");
  });

  it("renders an empty placeholder without touching the browser", () => {
    const html = renderToString(createElement(EaglesEyeChat, { project: "p1", api: "https://api.example.com" }));
    expect(html).toContain("data-eagles-eye-host");
    expect(html).not.toContain("script");
  });

  it("lets the widget module itself be imported on a server (it only defines the element in a browser)", async () => {
    const widget = await import("@eagles-eye/widget");
    expect(typeof widget.init).toBe("function");
    expect(typeof widget.renderAnswer).toBe("function");
  });
});
