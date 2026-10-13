/**
 * The chat window: UI, state and behaviour. It talks to the API only through the small `ChatClient` interface,
 * which the SDK's `PublicClient` satisfies, so tests can drive it with a fake and no network.
 *
 * Accessibility decisions (the reasons behind the code):
 *  - The transcript is a `role="log"` with `aria-live="off"`. Streamed text changes many times a second, and a
 *    live region would make a screen reader read every fragment. Instead, ONE hidden polite live region
 *    announces the finished answer once.
 *  - Opening moves focus to the input; closing (button or Escape) returns focus to the launcher.
 *  - Every control is a real <button>/<textarea> with an accessible name; state is exposed with aria-expanded
 *    and aria-pressed; links that open new tabs say so.
 *  - Colours meet WCAG AA, focus rings are always visible, animations stop under prefers-reduced-motion, and on
 *    narrow screens the panel becomes a full-screen sheet.
 */
import type { ChatTurn, Citation, PublicConfig, StreamEvent } from "@matrix-eye/sdk";
import { luminance, normalizeHex, readableTextOn } from "./colors";
import { renderAnswer, renderSources } from "./render";
import { CSS } from "./styles";

export interface ChatClient {
  config(signal?: AbortSignal): Promise<PublicConfig>;
  stream(message: string, options?: { history?: ChatTurn[]; signal?: AbortSignal }): AsyncGenerator<StreamEvent, void, void>;
  feedback(input: { rating: "up" | "down"; question: string; answer: string }): Promise<void>;
}

export interface WidgetOptions {
  /** Used to namespace saved conversations. */
  projectId: string;
  position?: "right" | "left";
  /** Header title. Defaults to the project's name. */
  title?: string;
  /** Brand colour for the header, launcher and your messages (#rgb or #rrggbb). Default: MatrixEye navy. */
  color?: string;
  /** Accent colour for borders and highlights. Default: MatrixEye gold. */
  accent?: string;
  theme?: "light" | "dark" | "auto";
  /** Opening message. Defaults to the project's greeting, then a generic one. */
  greeting?: string;
  placeholder?: string;
  /** Open the window immediately. */
  startOpen?: boolean;
  /** Show the "Powered by MatrixEye" line. */
  branding?: boolean;
  /** Keep the conversation for the browser tab (sessionStorage) so a page reload does not lose it. */
  persist?: boolean;
  /** Override any text, e.g. to translate the interface. */
  labels?: Partial<Labels>;
}

export const DEFAULT_LABELS = {
  open: "Open chat",
  close: "Close chat",
  restart: "Start a new conversation",
  send: "Send message",
  stop: "Stop generating",
  inputLabel: "Your question",
  placeholder: "Ask a question…",
  sources: "Sources",
  helpful: "Helpful answer",
  notHelpful: "Not a helpful answer",
  thanks: "Thanks for your feedback",
  retry: "Try again",
  stopped: "(stopped)",
  thinking: "The assistant is typing",
  errorNetwork: "Sorry, I couldn't reach the assistant. Please check your connection.",
  errorBusy: "You're sending messages quickly. Please wait a moment and try again.",
  errorForbidden: "This assistant isn't available on this website.",
  errorGeneric: "Sorry, something went wrong. Please try again.",
  greeting: (name: string) => `Hi! I'm the assistant for ${name}. Ask me anything about it.`,
  poweredBy: "Powered by",
};
export type Labels = typeof DEFAULT_LABELS;

/** Conversation turns sent with each question so follow-ups ("how much is it?") make sense. */
const HISTORY_TURNS = 6;
const MAX_STORED = 20;
const SVG_NS = "http://www.w3.org/2000/svg";

const ICONS = {
  chat: ["M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"],
  close: ["M18 6 6 18", "M6 6l12 12"],
  restart: ["M1 4v6h6", "M3.51 15a9 9 0 1 0 2.13-9.36L1 10"],
  send: ["M22 2 11 13", "M22 2 15 22l-4-9-9-4 20-7z"],
  stop: ["M6 6h12v12H6z"],
  up: ["M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"],
  down: ["M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"],
} as const;

interface Message {
  role: "user" | "assistant";
  text: string;
  citations: Citation[];
  status: "done" | "streaming" | "error" | "stopped";
  /** Greetings and notices are shown but never sent to the server as conversation history. */
  transient?: boolean;
  route?: string;
  /** The visitor question this answer responds to (sent with feedback). */
  question?: string;
  rating?: "up" | "down";
  el: HTMLElement;
  bubble: HTMLElement;
  actions?: HTMLElement;
}

interface Stored {
  role: "user" | "assistant";
  text: string;
  citations: Citation[];
  route?: string;
  question?: string;
  rating?: "up" | "down";
}

export class ChatWidget {
  private readonly doc: Document;
  private readonly labels: Labels;
  private readonly storageKey: string;
  private readonly messages: Message[] = [];
  private readonly cleanup: Array<() => void> = [];

  private launcher!: HTMLButtonElement;
  private panel!: HTMLElement;
  private title!: HTMLElement;
  private log!: HTMLElement;
  private suggestions!: HTMLElement;
  private input!: HTMLTextAreaElement;
  private sendButton!: HTMLButtonElement;
  private announcer!: HTMLElement;

  private config: PublicConfig | null = null;
  private abort: AbortController | null = null;
  private disabled = false;
  private pendingFrame = 0;
  private stickToBottom = true;

  constructor(
    private readonly root: ShadowRoot | HTMLElement,
    private readonly options: WidgetOptions,
    private readonly client: ChatClient,
    private readonly env: { storage?: Storage | null } = {},
  ) {
    this.doc = root.ownerDocument;
    this.labels = { ...DEFAULT_LABELS, ...options.labels };
    this.storageKey = `matrix-eye:${options.projectId}`;
    this.build();
    this.restore();
    void this.loadConfig();
    if (options.startOpen) this.open();
  }

  // ------------------------------------------------------------------ public API

  get isOpen(): boolean {
    return !this.panel.hidden;
  }

  open(): void {
    this.panel.hidden = false;
    this.launcher.setAttribute("aria-expanded", "true");
    this.launcher.setAttribute("aria-label", this.labels.close);
    this.scrollToEnd(true);
    this.input.focus();
  }

  close(): void {
    this.panel.hidden = true;
    this.launcher.setAttribute("aria-expanded", "false");
    this.launcher.setAttribute("aria-label", this.labels.open);
    this.launcher.focus();
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** Remove the widget and stop anything in flight. */
  destroy(): void {
    this.abort?.abort();
    if (this.pendingFrame) clearTimeout(this.pendingFrame);
    this.cleanup.forEach((fn) => fn());
    this.root.replaceChildren();
  }

  /** Ask a question programmatically (also used by the suggestion buttons). */
  async ask(question: string): Promise<void> {
    const text = question.trim().slice(0, 1000);
    if (!text || this.abort || this.disabled) return;

    const history = this.historyForServer();
    this.suggestions.hidden = true;
    this.addMessage("user", text);
    const reply = this.addMessage("assistant", "", { status: "streaming", question: text });
    this.setBusy(true);

    const controller = new AbortController();
    this.abort = controller;
    let provisional = "";
    try {
      for await (const event of this.client.stream(text, { history, signal: controller.signal })) {
        if (event.type === "token") {
          provisional += event.text;
          reply.text = provisional;
          this.scheduleRender(reply);
        } else {
          // The final event is authoritative: it replaces whatever was streamed (validation may have changed it).
          reply.text = event.response.answer;
          reply.citations = event.response.citations;
          reply.route = event.response.route;
          reply.status = "done";
          this.render(reply);
          this.announce(reply.text);
          this.addFeedbackControls(reply);
        }
      }
      if (reply.status === "streaming") throw Object.assign(new Error("no final event"), { code: "stream_interrupted" });
    } catch (err) {
      if (controller.signal.aborted) {
        // The visitor pressed Stop: keep what had arrived.
        reply.status = reply.text ? "stopped" : "error";
        if (!reply.text) reply.text = this.labels.stopped;
        this.render(reply);
      } else {
        this.fail(reply, err, text);
      }
    } finally {
      this.abort = null;
      this.setBusy(false);
      this.persist();
      this.scrollToEnd();
      if (this.isOpen) this.input.focus();
    }
  }

  // ------------------------------------------------------------------ construction

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const node = this.doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  private icon(name: keyof typeof ICONS): SVGElement {
    const svg = this.doc.createElementNS(SVG_NS, "svg");
    for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" })) svg.setAttribute(k, v);
    for (const d of ICONS[name]) {
      const path = this.doc.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    }
    return svg;
  }

  private button(className: string, label: string, icon: keyof typeof ICONS): HTMLButtonElement {
    const b = this.el("button", className);
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.appendChild(this.icon(icon));
    return b;
  }

  private on<T extends EventTarget>(target: T, type: string, handler: (event: any) => void): void {
    target.addEventListener(type, handler);
    this.cleanup.push(() => target.removeEventListener(type, handler));
  }

  private build(): void {
    const { options, labels } = this;
    const style = this.el("style");
    style.textContent = CSS;

    const primary = normalizeHex(options.color) ?? "#0f2238";
    const accent = normalizeHex(options.accent) ?? "#c19a5b";
    const dark = options.theme === "dark" || (options.theme !== "light" && typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches);

    const rootEl = this.el("div", "ee-root");
    rootEl.dataset.position = options.position === "left" ? "left" : "right";
    rootEl.dataset.theme = dark ? "dark" : "light";
    // Colours were validated by normalizeHex, so they are safe to place into style properties.
    rootEl.style.setProperty("--ee-primary", primary);
    rootEl.style.setProperty("--ee-on-primary", readableTextOn(primary));
    rootEl.style.setProperty("--ee-accent", accent);
    // A very light brand colour is unreadable as a header background in dark mode; the dark theme keeps its own surface.
    if (dark && luminance(primary) > 0.6) rootEl.style.setProperty("--ee-primary", "#1d2a3d");

    this.launcher = this.button("ee-launcher", labels.open, "chat");
    this.launcher.setAttribute("aria-expanded", "false");
    this.launcher.setAttribute("aria-controls", "ee-panel");

    this.panel = this.el("section", "ee-panel");
    this.panel.id = "ee-panel";
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-label", options.title ?? "Assistant");
    this.panel.hidden = true;

    const head = this.el("div", "ee-head");
    this.title = this.el("h2", undefined, options.title ?? "Assistant");
    const restart = this.button("ee-icon-btn", labels.restart, "restart");
    const close = this.button("ee-icon-btn", labels.close, "close");
    head.append(this.title, restart, close);

    this.log = this.el("div", "ee-log");
    this.log.setAttribute("role", "log");
    this.log.setAttribute("aria-live", "off");
    this.log.setAttribute("aria-label", "Conversation");
    this.log.tabIndex = 0; // keyboard users must be able to scroll the transcript

    this.suggestions = this.el("div", "ee-suggestions");
    this.suggestions.hidden = true;

    const form = this.el("form", "ee-form");
    const inputLabel = this.el("label", "ee-sr", labels.inputLabel);
    inputLabel.htmlFor = "ee-input";
    this.input = this.el("textarea", "ee-input");
    this.input.id = "ee-input";
    this.input.rows = 1;
    this.input.maxLength = 1000;
    this.input.placeholder = options.placeholder ?? labels.placeholder;
    this.sendButton = this.button("ee-send", labels.send, "send");
    this.sendButton.type = "submit";
    this.sendButton.disabled = true;
    form.append(inputLabel, this.input, this.sendButton);

    this.announcer = this.el("div", "ee-sr");
    this.announcer.setAttribute("aria-live", "polite");
    this.announcer.setAttribute("aria-atomic", "true");

    this.panel.append(head, this.log, this.suggestions, form, this.announcer);
    if (options.branding !== false) {
      const brand = this.el("div", "ee-brand", `${labels.poweredBy} `);
      const link = this.el("a", undefined, "MatrixEye");
      link.href = "https://matrixeye.ai";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      brand.appendChild(link);
      this.panel.appendChild(brand);
    }

    rootEl.append(this.launcher, this.panel);
    this.root.replaceChildren(style, rootEl);

    this.on(this.launcher, "click", () => this.toggle());
    this.on(close, "click", () => this.close());
    this.on(restart, "click", () => this.restart());
    this.on(this.panel, "keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.close();
      }
    });
    this.on(form, "submit", (e: Event) => {
      e.preventDefault();
      if (this.abort) this.abort.abort(); // the button is "Stop" while an answer is being written
      else {
        const value = this.input.value;
        this.input.value = "";
        this.resizeInput();
        this.updateSendState();
        void this.ask(value);
      }
    });
    this.on(this.input, "input", () => {
      this.resizeInput();
      this.updateSendState();
    });
    this.on(this.input, "keydown", (e: KeyboardEvent) => {
      // Enter sends, Shift+Enter inserts a new line. Never send mid-composition (e.g. Japanese input).
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    this.on(this.log, "scroll", () => {
      this.stickToBottom = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 40;
    });
  }

  private async loadConfig(): Promise<void> {
    try {
      this.config = await this.client.config();
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "forbidden") {
        this.disabled = true;
        this.input.disabled = true;
        this.sendButton.disabled = true;
        this.notice(this.labels.errorForbidden);
        console.warn("[MatrixEye] This website's origin is not in the project's allowed origins. Add it in the project settings.");
      }
      // Any other failure (offline, server down) is not fatal: the widget still opens and reports errors per question.
    }
    if (this.config && !this.options.title) {
      this.title.textContent = this.config.name;
      this.panel.setAttribute("aria-label", this.config.name);
    }
    this.showGreeting();
  }

  private showGreeting(): void {
    if (this.disabled || this.messages.some((m) => m.transient && m.role === "assistant" && m.status === "done")) return;
    if (this.messages.some((m) => m.role === "user")) return; // a restored conversation needs no greeting
    const name = this.config?.name ?? this.options.title ?? "this website";
    this.addMessage("assistant", this.options.greeting ?? this.config?.greeting ?? this.labels.greeting(name), { transient: true });
    this.suggestions.replaceChildren();
    for (const question of this.config?.suggestedQuestions ?? []) {
      const chip = this.el("button", "ee-chip", question);
      chip.type = "button";
      this.on(chip, "click", () => void this.ask(question));
      this.suggestions.appendChild(chip);
    }
    this.suggestions.hidden = this.suggestions.childElementCount === 0;
  }

  // ------------------------------------------------------------------ messages

  private addMessage(role: Message["role"], text: string, extra: Partial<Message> = {}): Message {
    const el = this.el("div", `ee-msg ${role === "user" ? "ee-user" : "ee-assistant"}`);
    const bubble = this.el("div", "ee-bubble");
    el.appendChild(bubble);
    const message: Message = { role, text, citations: [], status: "done", el, bubble, ...extra };
    this.messages.push(message);
    this.log.appendChild(el);
    this.render(message);
    this.scrollToEnd();
    return message;
  }

  /** Redraw one message from its state. Text is only ever inserted as text (see render.ts). */
  private render(message: Message): void {
    const { bubble } = message;
    bubble.replaceChildren();
    message.el.classList.toggle("ee-error", message.status === "error");
    message.el.querySelector(".ee-sources")?.remove();

    if (message.role === "user") {
      bubble.textContent = message.text;
      return;
    }
    if (message.status === "streaming" && !message.text) {
      const dots = this.el("span", "ee-typing");
      dots.setAttribute("role", "img");
      dots.setAttribute("aria-label", this.labels.thinking);
      dots.append(this.el("i"), this.el("i"), this.el("i"));
      bubble.appendChild(dots);
      return;
    }
    bubble.appendChild(renderAnswer(message.text, message.status === "done" ? message.citations : [], this.doc));
    if (message.status === "stopped") bubble.appendChild(this.el("em", undefined, ` ${this.labels.stopped}`));
    if (message.status === "done") {
      const sources = renderSources(message.citations, this.labels.sources, this.doc);
      if (sources) message.el.insertBefore(sources, message.actions ?? null);
    }
  }

  /** Redraw at most once per frame while tokens stream in. */
  private scheduleRender(message: Message): void {
    if (this.pendingFrame) return;
    this.pendingFrame = setTimeout(() => {
      this.pendingFrame = 0;
      this.render(message);
      this.scrollToEnd();
    }, 40) as unknown as number;
  }

  private notice(text: string): Message {
    return this.addMessage("assistant", text, { transient: true, status: "error" });
  }

  private fail(reply: Message, err: unknown, question: string): void {
    const code = (err as { code?: string }).code ?? "";
    const label =
      code === "rate_limited" || (err as { status?: number }).status === 429
        ? this.labels.errorBusy
        : code === "forbidden"
          ? this.labels.errorForbidden
          : code === "network_error" || code === "stream_interrupted"
            ? this.labels.errorNetwork
            : this.labels.errorGeneric;
    if (code === "forbidden") {
      this.disabled = true;
      this.input.disabled = true;
    }
    reply.text = label;
    reply.status = "error";
    reply.transient = true; // an error is never sent back as conversation history
    this.render(reply);
    this.announce(label);

    if (code !== "forbidden") {
      const actions = this.el("div", "ee-actions");
      const retry = this.el("button", "ee-retry", this.labels.retry);
      retry.type = "button";
      this.on(retry, "click", () => {
        // Remove the failed exchange (question and error) and ask again.
        const i = this.messages.indexOf(reply);
        for (const m of this.messages.splice(Math.max(0, i - 1), 2)) m.el.remove();
        void this.ask(question);
      });
      actions.appendChild(retry);
      reply.el.appendChild(actions);
      reply.actions = actions;
    }
  }

  private addFeedbackControls(message: Message): void {
    // Small talk ("Hello", "Thanks") is not an answer anyone needs to rate.
    if (message.route === "smalltalk" || !message.question) return;
    const actions = this.el("div", "ee-actions");
    const up = this.button("ee-icon-btn", this.labels.helpful, "up");
    const down = this.button("ee-icon-btn", this.labels.notHelpful, "down");
    for (const b of [up, down]) b.setAttribute("aria-pressed", "false");
    const thanks = this.el("span", undefined, "");
    actions.append(up, down, thanks);

    const send = (rating: "up" | "down") => {
      message.rating = rating;
      up.setAttribute("aria-pressed", String(rating === "up"));
      down.setAttribute("aria-pressed", String(rating === "down"));
      up.disabled = down.disabled = true;
      thanks.textContent = this.labels.thanks;
      this.announce(this.labels.thanks);
      this.persist();
      // Feedback is best-effort: a failed request must never disturb the conversation.
      void this.client.feedback({ rating, question: message.question ?? "", answer: message.text }).catch(() => undefined);
    };
    this.on(up, "click", () => send("up"));
    this.on(down, "click", () => send("down"));
    message.el.appendChild(actions);
    message.actions = actions;
    if (message.rating) {
      // Restoring a rated answer: show the earlier choice, locked.
      up.setAttribute("aria-pressed", String(message.rating === "up"));
      down.setAttribute("aria-pressed", String(message.rating === "down"));
      up.disabled = down.disabled = true;
      thanks.textContent = this.labels.thanks;
    }
  }

  // ------------------------------------------------------------------ helpers

  private historyForServer(): ChatTurn[] {
    return this.messages
      .filter((m) => m.status === "done" && !m.transient && m.text)
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role, content: m.text }));
  }

  private setBusy(busy: boolean): void {
    this.sendButton.replaceChildren(this.icon(busy ? "stop" : "send"));
    this.sendButton.setAttribute("aria-label", busy ? this.labels.stop : this.labels.send);
    this.sendButton.type = "submit";
    this.log.setAttribute("aria-busy", String(busy));
    if (busy) this.sendButton.disabled = false;
    else this.updateSendState();
  }

  private updateSendState(): void {
    if (this.abort) return;
    this.sendButton.disabled = this.disabled || this.input.value.trim() === "";
  }

  private resizeInput(): void {
    this.input.style.height = "auto";
    this.input.style.height = `${Math.min(this.input.scrollHeight, 110)}px`;
    // Show a scrollbar only once the text is taller than the box; otherwise rounding leaves a phantom one.
    this.input.style.overflowY = this.input.scrollHeight > 110 ? "auto" : "hidden";
  }

  /** Make a screen reader read this text once, politely. */
  private announce(text: string): void {
    this.announcer.textContent = "";
    // Clearing first guarantees an identical message is announced again.
    queueMicrotask(() => (this.announcer.textContent = text));
  }

  private scrollToEnd(force = false): void {
    if (force || this.stickToBottom) this.log.scrollTop = this.log.scrollHeight;
  }

  private restart(): void {
    this.abort?.abort();
    for (const m of this.messages.splice(0)) m.el.remove();
    this.stickToBottom = true;
    try {
      this.storage()?.removeItem(this.storageKey);
    } catch {
      /* storage may be blocked */
    }
    this.showGreeting();
    this.input.focus();
  }

  // ------------------------------------------------------------------ persistence

  private storage(): Storage | null {
    if (this.options.persist === false) return null;
    try {
      return this.env.storage === undefined ? (globalThis.sessionStorage ?? null) : this.env.storage;
    } catch {
      return null; // sessionStorage can throw when site data is blocked
    }
  }

  private persist(): void {
    const stored: Stored[] = this.messages
      .filter((m) => m.status === "done" && !m.transient)
      .slice(-MAX_STORED)
      .map((m) => ({ role: m.role, text: m.text, citations: m.citations, route: m.route, question: m.question, rating: m.rating }));
    try {
      this.storage()?.setItem(this.storageKey, JSON.stringify(stored));
    } catch {
      /* quota exceeded or storage blocked: the conversation simply is not saved */
    }
  }

  private restore(): void {
    let stored: Stored[] = [];
    try {
      const raw = this.storage()?.getItem(this.storageKey);
      stored = raw ? (JSON.parse(raw) as Stored[]) : [];
    } catch {
      return;
    }
    if (!Array.isArray(stored)) return;
    for (const s of stored.slice(-MAX_STORED)) {
      if ((s.role !== "user" && s.role !== "assistant") || typeof s.text !== "string") continue;
      const message = this.addMessage(s.role, s.text, { citations: Array.isArray(s.citations) ? s.citations : [], route: s.route, question: s.question, rating: s.rating });
      if (s.role === "assistant") {
        this.render(message);
        this.addFeedbackControls(message);
      }
    }
  }
}
