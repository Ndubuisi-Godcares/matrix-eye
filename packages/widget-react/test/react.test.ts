// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EaglesEyeChat } from "../src";

// Tell React this is a test environment so `act` flushes effects the way a browser would.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: Root;

const widgetHost = () => document.querySelector("eagles-eye-chat") as HTMLElement | null;
const settle = (ms = 60) => act(async () => void (await new Promise((resolve) => setTimeout(resolve, ms))));

beforeEach(() => {
  // The widget asks the API for its display settings; answer without any network.
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ name: "Riverside University", greeting: null, suggestedQuestions: [] }), { status: 200, headers: { "content-type": "application/json" } }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("EaglesEyeChat", () => {
  it("mounts the widget after the component renders", async () => {
    await act(async () => root.render(createElement(EaglesEyeChat, { project: "p1", api: "http://api.test" })));
    await settle();
    expect(widgetHost()?.shadowRoot?.querySelector(".ee-launcher")).not.toBeNull();
  });

  it("removes the widget when the component unmounts", async () => {
    await act(async () => root.render(createElement(EaglesEyeChat, { project: "p1", api: "http://api.test" })));
    await settle();
    expect(widgetHost()).not.toBeNull();
    await act(async () => root.render(null));
    expect(widgetHost()).toBeNull();
  });

  it("does not leak a widget when unmounted before the widget code has loaded", async () => {
    await act(async () => root.render(createElement(EaglesEyeChat, { project: "p1", api: "http://api.test" })));
    await act(async () => root.render(null)); // immediately, before the dynamic import resolves
    await settle(150);
    expect(widgetHost()).toBeNull();
  });

  it("keeps the same widget across re-renders with unchanged settings", async () => {
    const element = () => createElement(EaglesEyeChat, { project: "p1", api: "http://api.test", labels: { open: "Chat now" } });
    await act(async () => root.render(element()));
    await settle();
    const first = widgetHost();
    await act(async () => root.render(element())); // a new `labels` object, same contents
    await settle();
    expect(widgetHost()).toBe(first);
  });

  it("rebuilds the widget when a setting changes", async () => {
    await act(async () => root.render(createElement(EaglesEyeChat, { project: "p1", api: "http://api.test", color: "#0f2238" })));
    await settle();
    await act(async () => root.render(createElement(EaglesEyeChat, { project: "p1", api: "http://api.test", color: "#1b6b4a" })));
    await settle();
    expect(document.querySelectorAll("eagles-eye-chat")).toHaveLength(1); // the old one was removed
    expect(widgetHost()!.shadowRoot!.querySelector<HTMLElement>(".ee-root")!.style.getPropertyValue("--ee-primary")).toBe("#1b6b4a");
  });

  it("passes settings through to the widget", async () => {
    await act(async () => root.render(createElement(EaglesEyeChat, { project: "p1", api: "http://api.test", position: "left", theme: "dark", open: true, title: "Ask us" })));
    await settle();
    const shadow = widgetHost()!.shadowRoot!;
    expect(shadow.querySelector<HTMLElement>(".ee-root")!.dataset.position).toBe("left");
    expect(shadow.querySelector<HTMLElement>(".ee-root")!.dataset.theme).toBe("dark");
    expect(shadow.querySelector<HTMLElement>(".ee-head h2")!.textContent).toBe("Ask us");
    expect(shadow.querySelector<HTMLElement>(".ee-panel")!.hidden).toBe(false);
  });
});
