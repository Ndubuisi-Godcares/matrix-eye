/**
 * Documentation search (Pagefind).
 *
 * The search box starts hidden and is revealed only when the index exists (`/pagefind/pagefind.js` is produced at
 * build time), so on a build without the index, or with scripts off, no broken box is shown. Results are built from
 * text nodes, never from HTML strings, so nothing in an excerpt can run as script.
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

const root = document.querySelector<HTMLElement>("[data-search]");
if (root) void setup(root);

async function setup(root: HTMLElement) {
  const input = root.querySelector<HTMLInputElement>("input")!;
  const list = root.querySelector<HTMLUListElement>(".search__results")!;
  const status = root.querySelector<HTMLElement>("[data-search-status]")!;

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

  // Reveal the box only if an index was built.
  const probe = await fetch("/pagefind/pagefind-entry.json", { method: "HEAD" }).catch(() => null);
  if (!probe?.ok) return;
  root.hidden = false;

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

  const close = () => {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
  };

  let latest = 0;
  const run = async () => {
    const query = input.value.trim();
    const ticket = ++latest; // ignore answers to older keystrokes
    if (query.length < 2) {
      list.replaceChildren();
      close();
      return;
    }
    const engine = await load();
    if (!engine) return;
    const found = await engine.search(query);
    const data = await Promise.all(found.results.slice(0, 6).map((r) => r.data()));
    if (ticket !== latest) return;

    list.replaceChildren();
    if (data.length === 0) {
      const empty = document.createElement("li");
      empty.className = "search__empty";
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
    if (event.key === "Escape") {
      close();
      input.blur();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      list.querySelector<HTMLAnchorElement>("a")?.focus();
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
    } else if (event.key === "Escape") {
      close();
      input.focus();
    }
  });
  // Clicking elsewhere closes the results.
  document.addEventListener("click", (event) => {
    if (!root.contains(event.target as Node)) close();
  });
}
