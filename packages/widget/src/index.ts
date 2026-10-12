/**
 * Entry point of the embeddable widget.
 *
 * Three ways to use it, all producing the same window:
 *
 *   1. One script tag (most websites):
 *        <script src="https://cdn.example.com/eagles-eye-widget.js" defer
 *                data-project="PROJECT_ID" data-api="https://api.example.com"></script>
 *
 *   2. The custom element, e.g. from a framework:
 *        <eagles-eye-chat project="PROJECT_ID" api="https://api.example.com"></eagles-eye-chat>
 *
 *   3. JavaScript:
 *        const handle = EaglesEye.init({ project: "...", api: "...", color: "#0f2238" });
 *        handle.open();  handle.destroy();
 *
 * Settings are the same everywhere (as data-* attributes on the script, plain attributes on the element, or
 * properties for init()): project, api, position, title, color, accent, theme, greeting, placeholder, open,
 * branding, persist. See docs/widget.md.
 */
import { PublicClient } from "@eagles-eye/sdk";
import { ChatWidget, type WidgetOptions } from "./widget";

export { ChatWidget, DEFAULT_LABELS, type ChatClient, type Labels, type WidgetOptions } from "./widget";
export { renderAnswer, renderSources, safeUrl } from "./render";

/** Everything a visitor-facing widget needs to know, in the shape used by attributes and init(). */
export interface EmbedOptions {
  project: string;
  api: string;
  position?: "right" | "left";
  title?: string;
  color?: string;
  accent?: string;
  theme?: "light" | "dark" | "auto";
  greeting?: string;
  placeholder?: string;
  open?: boolean;
  branding?: boolean;
  persist?: boolean;
  labels?: WidgetOptions["labels"];
}

export interface WidgetHandle {
  open(): void;
  close(): void;
  toggle(): void;
  ask(question: string): Promise<void>;
  destroy(): void;
}

const TAG = "eagles-eye-chat";

const bool = (value: string | null | undefined, fallback: boolean) => (value == null ? fallback : !/^(false|0|no|off)$/i.test(value.trim()));
const oneOf = <T extends string>(value: string | null | undefined, allowed: readonly T[]): T | undefined => (allowed.includes(value as T) ? (value as T) : undefined);

/** Read settings from a bag of string attributes (script data-* or element attributes). */
function optionsFromAttributes(get: (name: string) => string | null): EmbedOptions | null {
  const project = get("project")?.trim();
  const api = get("api")?.trim();
  if (!project || !api) {
    console.error("[Eagle's Eye] The widget needs both a project id and an api address (data-project and data-api).");
    return null;
  }
  return {
    project,
    api,
    position: oneOf(get("position"), ["right", "left"] as const),
    title: get("title") ?? undefined,
    color: get("color") ?? undefined,
    accent: get("accent") ?? undefined,
    theme: oneOf(get("theme"), ["light", "dark", "auto"] as const),
    greeting: get("greeting") ?? undefined,
    placeholder: get("placeholder") ?? undefined,
    open: get("open") !== null && bool(get("open") || "true", true),
    branding: bool(get("branding"), true),
    persist: bool(get("persist"), true),
  };
}

function start(root: ShadowRoot, embed: EmbedOptions): ChatWidget {
  const { project, api, ...rest } = embed;
  // api="/" means the API is on the same origin as the page, so requests use relative paths.
  const client = new PublicClient({ baseUrl: api === "/" ? "" : api }, project);
  return new ChatWidget(root, { projectId: project, position: rest.position, title: rest.title, color: rest.color, accent: rest.accent, theme: rest.theme, greeting: rest.greeting, placeholder: rest.placeholder, startOpen: rest.open, branding: rest.branding, persist: rest.persist, labels: rest.labels }, client);
}

/** `<eagles-eye-chat>`: a self-contained chat window. Styles are isolated in a Shadow DOM. */
// `HTMLElement` does not exist on a server. Falling back to an empty class lets this module be imported during
// server-side rendering (Next.js, Astro...) without crashing; the element is only ever created in a browser.
const ElementBase: typeof HTMLElement = typeof HTMLElement !== "undefined" ? HTMLElement : (class {} as unknown as typeof HTMLElement);

export class EaglesEyeChatElement extends ElementBase {
  private widget: ChatWidget | null = null;
  private embedOptions: EmbedOptions | null = null;

  /** Provide settings in code instead of attributes. Must be called before the element is attached. */
  setOptions(options: EmbedOptions): void {
    this.embedOptions = options;
  }

  /** Programmatic access to the running widget (null before it is attached). */
  get chat(): ChatWidget | null {
    return this.widget;
  }

  connectedCallback(): void {
    if (this.widget) return;
    const options = this.embedOptions ?? optionsFromAttributes((name) => this.getAttribute(name));
    if (!options) return;
    this.widget = start(this.shadowRoot ?? this.attachShadow({ mode: "open" }), options);
  }

  disconnectedCallback(): void {
    this.widget?.destroy();
    this.widget = null;
  }
}

if (typeof customElements !== "undefined" && !customElements.get(TAG)) customElements.define(TAG, EaglesEyeChatElement);

/** Create a widget from JavaScript. Returns a handle to control it. */
export function init(options: EmbedOptions, parent: HTMLElement = document.body): WidgetHandle {
  const element = document.createElement(TAG) as EaglesEyeChatElement;
  element.setOptions(options); // full settings (including labels) go straight to the widget
  parent.appendChild(element); // attaching starts the widget
  const widget = element.chat as ChatWidget;
  return {
    open: () => widget.open(),
    close: () => widget.close(),
    toggle: () => widget.toggle(),
    ask: (q) => widget.ask(q),
    destroy: () => {
      element.remove(); // disconnectedCallback destroys the widget
    },
  };
}

// Script-tag mode: if this file was loaded with data-project and data-api, mount the widget automatically.
const script = typeof document !== "undefined" ? (document.currentScript as HTMLScriptElement | null) : null;
if (script?.dataset.project) {
  const mount = () => {
    const options = optionsFromAttributes((name) => script.getAttribute(`data-${name}`));
    if (!options) return;
    const element = document.createElement(TAG);
    for (const attr of Array.from(script.attributes)) if (attr.name.startsWith("data-")) element.setAttribute(attr.name.slice(5), attr.value);
    document.body.appendChild(element);
  };
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
}

// A global for plain-JavaScript users when loaded as a classic script.
if (typeof window !== "undefined") (window as unknown as { EaglesEye: unknown }).EaglesEye = { init };
