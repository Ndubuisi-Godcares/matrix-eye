/**
 * Site-wide search (Pagefind), opened via the header's search button or Ctrl/Cmd+K, with optional voice input.
 * Shares the loading/excerpt logic with the docs sidebar search (search.ts) but is a modal dialog rather than an
 * inline box, so it is kept separate: the open/close, focus-trap and keyboard-shortcut concerns do not apply there.
 */

interface PagefindResult {
  url: string;
  meta: { title?: string };
  excerpt: string;
}
interface Pagefind {
  options(options: Record<string, unknown>): Promise<void>;
  search(query: string): Promise<{ results: Array<{ data(): Promise<PagefindResult> }> }>;
}

const root = document.querySelector<HTMLElement>("[data-cmdk]");
const openButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-cmdk-open]"));
if (root && openButtons.length) void setup(root, openButtons);

async function setup(root: HTMLElement, openButtons: HTMLButtonElement[]) {
  const panel = root.querySelector<HTMLElement>(".cmdk__panel")!;
  const input = root.querySelector<HTMLInputElement>("input")!;
  const list = root.querySelector<HTMLUListElement>(".cmdk__results")!;
  const status = root.querySelector<HTMLElement>("[data-cmdk-status]")!;
  const micButton = root.querySelector<HTMLButtonElement>("[data-cmdk-mic]")!;

  // Reveal the trigger button(s) and this box only if a search index was actually built, same as the docs search.
  const probe = await fetch("/pagefind/pagefind-entry.json", { method: "HEAD" }).catch(() => null);
  if (!probe?.ok) return;
  openButtons.forEach((button) => (button.hidden = false));

  let pagefind: Pagefind | null = null;
  /** Load the search code on first use (it is a few tens of kilobytes plus a small WebAssembly module). */
  const load = async (): Promise<Pagefind | null> => {
    if (pagefind) return pagefind;
    try {
      const path = "/pagefind/pagefind.js";
      pagefind = (await import(/* @vite-ignore */ path)) as Pagefind;
      await pagefind.options({ baseUrl: "/" });
      return pagefind;
    } catch {
      return null;
    }
  };

  /** Excerpts mark matches with <mark>…</mark>. Rebuild them from text so only <mark> survives. */
  const appendExcerpt = (target: HTMLElement, excerpt: string) => {
    const parts = excerpt.split(/(<mark>.*?<\/mark>)/g);
    for (const part of parts) {
      const match = /^<mark>(.*)<\/mark>$/.exec(part);
      const text = (match ? match[1] : part) ?? "";
      const decoded = new DOMParser().parseFromString(text, "text/html").documentElement.textContent ?? "";
      if (match) {
        const mark = document.createElement("mark");
        mark.textContent = decoded;
        target.appendChild(mark);
      } else {
        target.appendChild(document.createTextNode(decoded));
      }
    }
  };

  /* ---------- voice search (Web Speech API; not in every browser, so it is entirely optional) ---------- */
  interface SpeechRecognitionAlternative {
    transcript: string;
  }
  interface SpeechRecognitionResultLike {
    0: SpeechRecognitionAlternative;
    isFinal: boolean;
  }
  interface SpeechRecognitionEventLike extends Event {
    results: ArrayLike<SpeechRecognitionResultLike>;
  }
  interface SpeechRecognitionLike extends EventTarget {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    maxAlternatives: number;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    onerror: (() => void) | null;
    onend: (() => void) | null;
  }
  type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
  const win = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  const SpeechRecognitionImpl = win.SpeechRecognition ?? win.webkitSpeechRecognition;

  let recognition: SpeechRecognitionLike | null = null;
  let listening = false;
  const setListening = (next: boolean) => {
    listening = next;
    micButton.classList.toggle("is-listening", next);
    micButton.setAttribute("aria-pressed", String(next));
  };
  const stopListening = () => {
    if (listening) recognition?.stop();
  };

  if (SpeechRecognitionImpl) {
    micButton.hidden = false;
    micButton.addEventListener("click", () => {
      if (listening) {
        stopListening();
        return;
      }
      recognition = new SpeechRecognitionImpl();
      recognition.lang = document.documentElement.lang || "en-US";
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        const last = event.results[event.results.length - 1];
        const transcript = last?.[0]?.transcript ?? "";
        input.value = transcript;
        void run();
      };
      recognition.onerror = () => {
        setListening(false);
        status.textContent = "Could not hear that. Please try again, or type your question.";
      };
      recognition.onend = () => setListening(false);
      try {
        recognition.start();
        setListening(true);
        status.textContent = "Listening…";
      } catch {
        setListening(false);
      }
    });
  }

  /* ---------- open / close ---------- */
  let lastFocused: HTMLElement | null = null;
  const isOpen = () => !root.hidden;
  const open = () => {
    if (isOpen()) return;
    lastFocused = document.activeElement as HTMLElement | null;
    root.hidden = false;
    document.body.style.overflow = "hidden";
    input.focus();
  };
  const close = () => {
    if (!isOpen()) return;
    stopListening();
    root.hidden = true;
    document.body.style.overflow = "";
    lastFocused?.focus();
  };

  openButtons.forEach((button) => button.addEventListener("click", open));
  root.querySelectorAll<HTMLElement>("[data-cmdk-dismiss]").forEach((el) => el.addEventListener("click", close));

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      isOpen() ? close() : open();
    } else if (event.key === "Escape" && isOpen()) {
      close();
    }
  });

  // Focus trap: Tab/Shift+Tab stay within the panel while it is open.
  panel.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>("button:not([hidden]), input, a[href]"));
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  /* ---------- search ---------- */
  let latest = 0;
  const run = async () => {
    const query = input.value.trim();
    const ticket = ++latest; // ignore answers to older keystrokes
    if (query.length < 2) {
      list.replaceChildren();
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      status.textContent = listening ? status.textContent : "";
      return;
    }
    const engine = await load();
    if (!engine || ticket !== latest) return;
    const found = await engine.search(query);
    const data = await Promise.all(found.results.slice(0, 8).map((r) => r.data()));
    if (ticket !== latest) return;

    list.replaceChildren();
    if (data.length === 0) {
      const empty = document.createElement("li");
      empty.className = "cmdk__empty";
      empty.textContent = `No results for "${query}".`;
      list.appendChild(empty);
    }
    for (const result of data) {
      const item = document.createElement("li");
      item.setAttribute("role", "option");
      const link = document.createElement("a");
      link.href = result.url;
      const title = document.createElement("strong");
      title.textContent = result.meta.title ?? result.url;
      const excerpt = document.createElement("span");
      appendExcerpt(excerpt, result.excerpt);
      link.append(title, excerpt);
      item.appendChild(link);
      list.appendChild(item);
    }
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    status.textContent = data.length ? `${data.length} result${data.length === 1 ? "" : "s"}` : "No results";
  };

  let timer: number | undefined;
  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void run(), 150); // wait for a pause in typing
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      list.querySelector<HTMLAnchorElement>("a")?.focus();
    } else if (event.key === "Enter") {
      // Go straight to the top result, the way a visitor expects a search box to behave.
      const top = list.querySelector<HTMLAnchorElement>("a");
      if (top) {
        event.preventDefault();
        top.click();
      }
    }
  });
  list.addEventListener("keydown", (event) => {
    const links = Array.from(list.querySelectorAll<HTMLAnchorElement>("a"));
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      links[Math.min(index + 1, links.length - 1)]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index <= 0) input.focus();
      else links[index - 1]?.focus();
    }
  });
}

// An explicit module marker: without any import/export, TS would treat this as a global script and collide with
// other script entry points (e.g. search.ts) that happen to declare the same top-level names.
export {};
