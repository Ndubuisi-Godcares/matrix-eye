// @vitest-environment jsdom
/**
 * The custom element and the init() function: how websites actually add the widget.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { init } from "../src/index";

const tick = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ name: "Riverside University", greeting: null, suggestedQuestions: [] }), { status: 200, headers: { "content-type": "application/json" } }));
  sessionStorage.clear();
});
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("<matrix-eye-chat>", () => {
  it("builds the widget from plain attributes", async () => {
    document.body.innerHTML = '<matrix-eye-chat project="p1" api="http://api.test" position="left" theme="dark" color="#1b6b4a" open></matrix-eye-chat>';
    await tick();
    const shadow = document.querySelector("matrix-eye-chat")!.shadowRoot!;
    const root = shadow.querySelector<HTMLElement>(".ee-root")!;
    expect(root.dataset.position).toBe("left");
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.getPropertyValue("--ee-primary")).toBe("#1b6b4a");
    expect(shadow.querySelector<HTMLElement>(".ee-panel")!.hidden).toBe(false); // the `open` attribute
  });

  it("starts closed by default and can hide the branding line", async () => {
    document.body.innerHTML = '<matrix-eye-chat project="p1" api="http://api.test" branding="false"></matrix-eye-chat>';
    await tick();
    const shadow = document.querySelector("matrix-eye-chat")!.shadowRoot!;
    expect(shadow.querySelector<HTMLElement>(".ee-panel")!.hidden).toBe(true);
    expect(shadow.querySelector(".ee-brand")).toBeNull();
  });

  it("ignores unknown option values instead of breaking", async () => {
    document.body.innerHTML = '<matrix-eye-chat project="p1" api="http://api.test" position="middle" theme="neon"></matrix-eye-chat>';
    await tick();
    const root = document.querySelector("matrix-eye-chat")!.shadowRoot!.querySelector<HTMLElement>(".ee-root")!;
    expect(root.dataset.position).toBe("right"); // default
    expect(["light", "dark"]).toContain(root.dataset.theme);
  });

  it("explains a missing project or api instead of failing silently, and renders nothing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    document.body.innerHTML = '<matrix-eye-chat api="http://api.test"></matrix-eye-chat>';
    await tick();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("project id"));
    expect(document.querySelector("matrix-eye-chat")!.shadowRoot).toBeNull();
    error.mockRestore();
  });

  it("cleans up when removed from the page", async () => {
    document.body.innerHTML = '<matrix-eye-chat project="p1" api="http://api.test"></matrix-eye-chat>';
    await tick();
    const element = document.querySelector("matrix-eye-chat") as HTMLElement & { chat: unknown };
    expect(element.chat).not.toBeNull();
    element.remove();
    expect(element.chat).toBeNull();
  });
});

describe("init()", () => {
  it("creates a widget from JavaScript and controls it", async () => {
    const handle = init({ project: "p1", api: "http://api.test", color: "#0f2238", labels: { open: "Chat with us" } });
    await tick();
    const shadow = document.querySelector("matrix-eye-chat")!.shadowRoot!;
    expect(shadow.querySelector(".ee-launcher")!.getAttribute("aria-label")).toBe("Chat with us"); // richer options than attributes allow
    handle.open();
    expect(shadow.querySelector<HTMLElement>(".ee-panel")!.hidden).toBe(false);
    handle.toggle();
    expect(shadow.querySelector<HTMLElement>(".ee-panel")!.hidden).toBe(true);
    handle.destroy();
    expect(document.querySelector("matrix-eye-chat")).toBeNull();
  });

  it("is also available as a global for plain-script sites", () => {
    expect(typeof (window as unknown as { MatrixEye: { init: unknown } }).MatrixEye.init).toBe("function");
  });
});
