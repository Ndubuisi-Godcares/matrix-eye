// @vitest-environment jsdom
/**
 * Widget behaviour, driven through a fake client (no network, no server).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatResponse, PublicConfig, StreamEvent } from "@eagles-eye/sdk";
import { ChatWidget, type ChatClient, type WidgetOptions } from "../src/widget";

const CONFIG: PublicConfig = { name: "Riverside University", greeting: null, suggestedQuestions: ["How much is tuition?", "How do I apply?"] };
const FINAL: ChatResponse = {
  answer: "Computer Science costs **$4,500** per year [1].",
  abstained: false,
  route: "llm",
  citations: [{ id: 1, url: "https://riverside.edu/tuition", title: "Tuition", snippet: "s" }],
};

interface Fake extends ChatClient {
  streamCalls: Array<{ message: string; history?: unknown }>;
  feedbackCalls: Array<{ rating: string; question: string; answer: string }>;
}

/** A client whose stream is scripted per call. */
function fakeClient(opts: { config?: () => Promise<PublicConfig>; stream?: (message: string, signal?: AbortSignal) => AsyncGenerator<StreamEvent, void, void> } = {}): Fake {
  const fake: Fake = {
    streamCalls: [],
    feedbackCalls: [],
    config: opts.config ?? (async () => CONFIG),
    stream(message, options) {
      fake.streamCalls.push({ message, history: options?.history });
      return (opts.stream ?? defaultStream)(message, options?.signal);
    },
    async feedback(input) {
      fake.feedbackCalls.push(input);
    },
  };
  return fake;
}

async function* defaultStream(): AsyncGenerator<StreamEvent, void, void> {
  yield { type: "token", text: "Computer Science costs " };
  yield { type: "token", text: "$4,500" };
  yield { type: "final", response: FINAL };
}

const tick = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));

let host: HTMLElement;
let root: ShadowRoot;
let widget: ChatWidget | null;
let storage: Storage;

function mount(client: ChatClient, options: Partial<WidgetOptions> = {}) {
  widget = new ChatWidget(root, { projectId: "p1", ...options }, client, { storage });
  return widget;
}
const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector(selector) as T;
const all = (selector: string) => Array.from(root.querySelectorAll(selector)) as HTMLElement[];
const bubbles = () => all(".ee-assistant .ee-bubble").map((b) => b.textContent);

async function type(text: string) {
  const input = q<HTMLTextAreaElement>(".ee-input");
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
async function submit() {
  q<HTMLFormElement>(".ee-form").requestSubmit();
  await tick();
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = host.attachShadow({ mode: "open" });
  storage = (() => {
    const data = new Map<string, string>();
    return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k), clear: () => data.clear(), key: () => null, length: 0 } as Storage;
  })();
});
afterEach(() => {
  widget?.destroy();
  widget = null;
  host.remove();
});

describe("opening and closing", () => {
  it("starts closed, opens on click, and keeps aria state in sync", async () => {
    mount(fakeClient());
    await tick();
    const launcher = q<HTMLButtonElement>(".ee-launcher");
    expect(q(".ee-panel").hidden).toBe(true);
    expect(launcher.getAttribute("aria-expanded")).toBe("false");

    launcher.click();
    expect(q(".ee-panel").hidden).toBe(false);
    expect(launcher.getAttribute("aria-expanded")).toBe("true");
    expect(launcher.getAttribute("aria-label")).toBe("Close chat");
  });

  it("moves focus into the input on open and back to the launcher on close", async () => {
    mount(fakeClient());
    await tick();
    q<HTMLButtonElement>(".ee-launcher").click();
    expect(root.activeElement).toBe(q(".ee-input"));
    q<HTMLButtonElement>(".ee-head .ee-icon-btn:last-child").click();
    expect(root.activeElement).toBe(q(".ee-launcher"));
  });

  it("closes on Escape and returns focus to the launcher", async () => {
    mount(fakeClient(), { startOpen: true });
    await tick();
    expect(q(".ee-panel").hidden).toBe(false);
    q(".ee-input").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(q(".ee-panel").hidden).toBe(true);
    expect(root.activeElement).toBe(q(".ee-launcher"));
  });
});

describe("accessibility structure", () => {
  it("labels the dialog, transcript, input and every button", async () => {
    mount(fakeClient(), { startOpen: true });
    await tick();
    expect(q(".ee-panel").getAttribute("role")).toBe("dialog");
    expect(q(".ee-panel").getAttribute("aria-label")).toBe("Riverside University");
    expect(q(".ee-log").getAttribute("role")).toBe("log");
    expect(q(".ee-log").getAttribute("aria-live")).toBe("off"); // streaming must not be read out token by token
    expect((q<HTMLLabelElement>("label.ee-sr")).htmlFor).toBe(q(".ee-input").id);
    for (const button of all("button")) {
      const name = button.getAttribute("aria-label") || button.textContent;
      expect(name?.trim(), button.outerHTML).toBeTruthy();
    }
    for (const svg of all("svg")) expect(svg.getAttribute("aria-hidden")).toBe("true");
  });

  it("makes the transcript keyboard-scrollable and uses one polite live region", async () => {
    mount(fakeClient());
    await tick();
    expect(q(".ee-log").getAttribute("tabindex")).toBe("0");
    const live = all('[aria-live="polite"]');
    expect(live).toHaveLength(1);
  });

  it("announces the finished answer once, not each streamed fragment", async () => {
    mount(fakeClient(), { startOpen: true });
    await tick();
    await type("How much is tuition?");
    await submit();
    await tick();
    expect(q('[aria-live="polite"]').textContent).toBe(FINAL.answer);
  });
});

describe("greeting and suggestions", () => {
  it("greets by project name and shows suggested questions that ask when clicked", async () => {
    const client = fakeClient();
    mount(client, { startOpen: true });
    await tick();
    expect(bubbles()[0]).toContain("Riverside University");
    expect(q(".ee-suggestions").hidden).toBe(false);
    const chips = all(".ee-chip");
    expect(chips.map((c) => c.textContent)).toEqual(["How much is tuition?", "How do I apply?"]);

    chips[0]!.click();
    await tick(150);
    expect(client.streamCalls[0]!.message).toBe("How much is tuition?");
    expect(q(".ee-suggestions").hidden).toBe(true);
  });

  it("uses a custom greeting and title when provided", async () => {
    mount(fakeClient(), { greeting: "Welcome, future student!", title: "Ask Riverside" });
    await tick();
    expect(bubbles()[0]).toBe("Welcome, future student!");
    expect(q(".ee-head h2").textContent).toBe("Ask Riverside");
  });
});

describe("asking a question", () => {
  it("shows the typing indicator, streams text, then replaces it with the validated answer and sources", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const client = fakeClient({
      stream: async function* () {
        await gate;
        yield { type: "token", text: "Provisional ones" };
        await tick(300); // long enough to inspect the in-progress state before the final answer arrives
        yield { type: "final", response: FINAL };
      },
    });
    mount(client, { startOpen: true });
    await tick();
    await type("How much is tuition?");
    q<HTMLFormElement>(".ee-form").requestSubmit();
    await tick();

    expect(q(".ee-typing")).not.toBeNull(); // before the first token
    expect(q(".ee-send").getAttribute("aria-label")).toBe("Stop generating");
    release();
    await tick(120);
    expect(all(".ee-assistant .ee-bubble").at(-1)!.textContent).toContain("Provisional ones");

    await tick(400);
    const last = all(".ee-assistant").at(-1)!;
    expect(last.querySelector(".ee-bubble")!.textContent).toBe("Computer Science costs $4,500 per year\u20601."); // validated text replaced it (marker glued to the word)
    expect(last.querySelector("strong")!.textContent).toBe("$4,500");
    expect(last.querySelector(".ee-cite a")!.getAttribute("href")).toBe("https://riverside.edu/tuition");
    expect(last.querySelector(".ee-sources a")!.textContent).toBe("Tuition");
    expect(q(".ee-send").getAttribute("aria-label")).toBe("Send message");
  });

  it("shows the visitor's message, clears the input, and refuses empty or whitespace questions", async () => {
    const client = fakeClient();
    mount(client, { startOpen: true });
    await tick();
    expect(q<HTMLButtonElement>(".ee-send").disabled).toBe(true);
    await type("   ");
    expect(q<HTMLButtonElement>(".ee-send").disabled).toBe(true);
    await submit();
    expect(client.streamCalls).toHaveLength(0);

    await type("How much is tuition?");
    expect(q<HTMLButtonElement>(".ee-send").disabled).toBe(false);
    await submit();
    expect(all(".ee-user .ee-bubble")[0]!.textContent).toBe("How much is tuition?");
    expect(q<HTMLTextAreaElement>(".ee-input").value).toBe("");
  });

  it("sends Enter as submit and Shift+Enter as a new line", async () => {
    const client = fakeClient();
    mount(client, { startOpen: true });
    await tick();
    await type("hello");
    const shiftEnter = new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true });
    q(".ee-input").dispatchEvent(shiftEnter);
    expect(shiftEnter.defaultPrevented).toBe(false);
    expect(client.streamCalls).toHaveLength(0);

    q(".ee-input").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await tick(150);
    expect(client.streamCalls).toHaveLength(1);
  });

  it("does not send while the visitor is mid-composition (e.g. typing Japanese)", async () => {
    const client = fakeClient();
    mount(client, { startOpen: true });
    await tick();
    await type("こんにちは");
    q(".ee-input").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true }));
    await tick();
    expect(client.streamCalls).toHaveLength(0);
  });

  it("sends the last turns as history, excluding greetings and errors", async () => {
    const client = fakeClient();
    mount(client, { startOpen: true });
    await tick();
    for (const text of ["one", "two", "three", "four"]) {
      await type(text);
      await submit();
      await tick(120);
    }
    const lastHistory = client.streamCalls.at(-1)!.history as Array<{ role: string; content: string }>;
    expect(lastHistory).toHaveLength(6); // capped
    expect(lastHistory.every((t) => !t.content.includes("Riverside University") || t.role === "assistant")).toBe(true);
    expect(lastHistory[0]!.role).toBe("user");
    expect(client.streamCalls[0]!.history).toEqual([]); // greeting is not history
  });

  it("lets the visitor stop a running answer and keeps what had arrived", async () => {
    const client = fakeClient({
      stream: async function* (_m, signal) {
        yield { type: "token", text: "Partial answer so far" };
        await new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      },
    });
    mount(client, { startOpen: true });
    await tick();
    await type("long question");
    q<HTMLFormElement>(".ee-form").requestSubmit();
    await tick(120);
    expect(q(".ee-send").getAttribute("aria-label")).toBe("Stop generating");
    q<HTMLFormElement>(".ee-form").requestSubmit(); // the same button now means Stop
    await tick(120);
    const last = all(".ee-assistant .ee-bubble").at(-1)!;
    expect(last.textContent).toContain("Partial answer so far");
    expect(last.textContent).toContain("(stopped)");
    expect(q(".ee-send").getAttribute("aria-label")).toBe("Send message");
  });
});

describe("errors", () => {
  const failing = (code: string, status = 500) =>
    fakeClient({
      stream: async function* () {
        throw Object.assign(new Error("boom"), { code, status });
      },
    });

  it.each([
    ["network_error", "couldn't reach the assistant"],
    ["stream_interrupted", "couldn't reach the assistant"],
    ["rate_limited", "sending messages quickly"],
    ["internal", "something went wrong"],
  ])("explains %s in plain words", async (code, expected) => {
    mount(failing(code, code === "rate_limited" ? 429 : 500), { startOpen: true });
    await tick();
    await type("hello?");
    await submit();
    expect(all(".ee-assistant .ee-bubble").at(-1)!.textContent!.toLowerCase()).toContain(expected);
    expect(q<HTMLTextAreaElement>(".ee-input").disabled).toBe(false); // the visitor can try again
  });

  it("offers a retry that asks the same question again without duplicating the exchange", async () => {
    let calls = 0;
    const client = fakeClient({
      stream: async function* () {
        if (++calls === 1) throw Object.assign(new Error("down"), { code: "network_error" });
        yield { type: "final", response: FINAL };
      },
    });
    mount(client, { startOpen: true });
    await tick();
    await type("How much is tuition?");
    await submit();
    q<HTMLButtonElement>(".ee-retry").click();
    await tick(150);
    expect(calls).toBe(2);
    expect(all(".ee-user .ee-bubble")).toHaveLength(1);
    expect(all(".ee-assistant .ee-bubble").at(-1)!.textContent).toContain("Computer Science costs");
    expect(q(".ee-retry")).toBeNull();
  });

  it("never sends an error message back to the server as conversation history", async () => {
    let calls = 0;
    const client = fakeClient({
      stream: async function* () {
        if (++calls === 1) throw Object.assign(new Error("x"), { code: "internal" });
        yield { type: "final", response: FINAL };
      },
    });
    mount(client, { startOpen: true });
    await tick();
    await type("first");
    await submit();
    await type("second");
    await submit();
    await tick(120);
    const history = client.streamCalls[1]!.history as Array<{ content: string }>;
    expect(history.some((h) => /something went wrong/i.test(h.content))).toBe(false);
  });

  it("disables the widget when the website is not allowed to use the assistant", async () => {
    const client = fakeClient({
      config: async () => {
        throw Object.assign(new Error("not allowed"), { code: "forbidden", status: 403 });
      },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mount(client, { startOpen: true });
    await tick();
    expect(q<HTMLTextAreaElement>(".ee-input").disabled).toBe(true);
    expect(root.textContent).toContain("isn't available on this website");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("still opens and works when the config request fails for other reasons", async () => {
    const client = fakeClient({
      config: async () => {
        throw Object.assign(new Error("offline"), { code: "network_error" });
      },
    });
    mount(client, { startOpen: true, title: "Help" });
    await tick();
    expect(q<HTMLTextAreaElement>(".ee-input").disabled).toBe(false);
    expect(bubbles()[0]).toContain("Help");
  });
});

describe("feedback", () => {
  it("lets the visitor rate an answer once and reports it", async () => {
    const client = fakeClient();
    mount(client, { startOpen: true });
    await tick();
    await type("How much is tuition?");
    await submit();
    await tick(150);

    const [up, down] = all(".ee-actions .ee-icon-btn") as HTMLButtonElement[];
    expect(up!.getAttribute("aria-pressed")).toBe("false");
    down!.click();
    expect(down!.getAttribute("aria-pressed")).toBe("true");
    expect(up!.disabled && down!.disabled).toBe(true); // rate once
    expect(client.feedbackCalls).toEqual([{ rating: "down", question: "How much is tuition?", answer: FINAL.answer }]);
    expect(q(".ee-actions span").textContent).toBe("Thanks for your feedback");
  });

  it("does not ask for ratings on small talk, and survives a failing feedback request", async () => {
    const small = fakeClient({ stream: async function* () { yield { type: "final", response: { answer: "Hello!", abstained: false, route: "smalltalk", citations: [] } }; } });
    mount(small, { startOpen: true });
    await tick();
    await type("Hello");
    await submit();
    await tick(100);
    expect(all(".ee-actions")).toHaveLength(0);
    widget!.destroy();

    const broken = fakeClient();
    broken.feedback = async () => {
      throw new Error("server down");
    };
    root = host.attachShadow === undefined ? root : document.createElement("div").attachShadow({ mode: "open" });
    mount(broken, { startOpen: true, persist: false });
    await tick();
    await type("How much is tuition?");
    await submit();
    await tick(150);
    expect(() => (q(".ee-actions .ee-icon-btn") as HTMLButtonElement).click()).not.toThrow();
    await tick();
    expect(all(".ee-assistant .ee-bubble").at(-1)!.textContent).toContain("Computer Science costs"); // conversation undisturbed
  });
});

describe("saved conversations", () => {
  it("restores a conversation after a reload, including sources and the rating", async () => {
    let client = fakeClient();
    mount(client, { startOpen: true });
    await tick();
    await type("How much is tuition?");
    await submit();
    await tick(150);
    (q(".ee-actions .ee-icon-btn") as HTMLButtonElement).click();
    widget!.destroy();

    root = document.createElement("div").attachShadow({ mode: "open" });
    client = fakeClient();
    mount(client, { startOpen: true });
    await tick();
    expect(all(".ee-user .ee-bubble")[0]!.textContent).toBe("How much is tuition?");
    expect(q(".ee-sources a")).not.toBeNull();
    expect((q(".ee-actions .ee-icon-btn") as HTMLButtonElement).getAttribute("aria-pressed")).toBe("true");
    expect(all(".ee-assistant .ee-bubble").some((b) => b.textContent!.includes("Hi! I'm the assistant"))).toBe(false); // no second greeting
  });

  it("starts fresh on request and forgets the saved conversation", async () => {
    mount(fakeClient(), { startOpen: true });
    await tick();
    await type("hello there");
    await submit();
    await tick(150);
    q<HTMLButtonElement>('[aria-label="Start a new conversation"]').click();
    await tick();
    expect(all(".ee-user")).toHaveLength(0);
    expect(storage.getItem("eagles-eye:p1")).toBeNull();
    expect(bubbles()[0]).toContain("Hi!");
  });

  it("works when storage is blocked or full, and when persistence is switched off", async () => {
    const hostile = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("blocked"); } } as unknown as Storage;
    widget = new ChatWidget(root, { projectId: "p2", startOpen: true }, fakeClient(), { storage: hostile });
    await tick();
    await type("hello there");
    await submit();
    await tick(150);
    expect(all(".ee-assistant .ee-bubble").at(-1)!.textContent).toContain("Computer Science costs");
    widget.destroy();

    const spy = vi.spyOn(storage, "setItem");
    root = document.createElement("div").attachShadow({ mode: "open" });
    mount(fakeClient(), { startOpen: true, persist: false });
    await tick();
    await type("hello there");
    await submit();
    await tick(150);
    expect(spy).not.toHaveBeenCalled();
  });

  it("ignores corrupted saved data instead of crashing", async () => {
    storage.setItem("eagles-eye:p1", "{not json");
    mount(fakeClient(), { startOpen: true });
    await tick();
    expect(bubbles()[0]).toContain("Hi!");
    storage.setItem("eagles-eye:p1", JSON.stringify([{ role: "hacker", text: 5 }, { role: "user", text: "ok" }]));
    widget!.destroy();
    root = document.createElement("div").attachShadow({ mode: "open" });
    mount(fakeClient(), { startOpen: true });
    await tick();
    expect(all(".ee-user .ee-bubble").map((b) => b.textContent)).toEqual(["ok"]);
  });
});

describe("theming and teardown", () => {
  it("applies a brand colour with readable text, and refuses unsafe colour values", async () => {
    mount(fakeClient(), { color: "#e63946", accent: "red; background:url(x)", theme: "light" });
    await tick();
    const rootEl = q<HTMLElement>(".ee-root");
    expect(rootEl.style.getPropertyValue("--ee-primary")).toBe("#e63946");
    expect(rootEl.style.getPropertyValue("--ee-on-primary")).toBe("#000000");
    expect(rootEl.style.getPropertyValue("--ee-accent")).toBe("#c19a5b"); // invalid value ignored, default kept
  });

  it("supports left placement, dark theme and hiding the branding line", async () => {
    mount(fakeClient(), { position: "left", theme: "dark", branding: false });
    await tick();
    expect(q(".ee-root").dataset.position).toBe("left");
    expect(q(".ee-root").dataset.theme).toBe("dark");
    expect(q(".ee-brand")).toBeNull();
  });

  it("shows a safe 'Powered by' link by default", async () => {
    mount(fakeClient());
    await tick();
    const link = q<HTMLAnchorElement>(".ee-brand a");
    expect(link.rel).toBe("noopener noreferrer");
    expect(link.target).toBe("_blank");
  });

  it("cancels in-flight work and removes everything on destroy", async () => {
    let aborted = false;
    const client = fakeClient({
      stream: async function* (_m, signal) {
        signal?.addEventListener("abort", () => (aborted = true));
        await new Promise(() => undefined);
      },
    });
    mount(client, { startOpen: true });
    await tick();
    await type("hello there");
    q<HTMLFormElement>(".ee-form").requestSubmit();
    await tick();
    widget!.destroy();
    expect(aborted).toBe(true);
    expect(root.childElementCount).toBe(0);
    widget = null;
  });
});
