/**
 * The small amount of JavaScript every page loads. Each feature is an enhancement: with scripts off, the site
 * still reads, navigates (the menu is simply always visible on wide screens) and every link works.
 */

/* ---------- colour theme toggle ---------- */
function currentTheme(): "light" | "dark" {
  const set = document.documentElement.getAttribute("data-theme");
  if (set === "light" || set === "dark") return set;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function syncThemeButtons() {
  const dark = currentTheme() === "dark";
  document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]").forEach((button) => {
    button.setAttribute("aria-label", dark ? "Switch to the light theme" : "Switch to the dark theme");
  });
}

document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* the choice just is not remembered */
    }
    syncThemeButtons();
  });
});
syncThemeButtons();

/* ---------- mobile menu ---------- */
const navToggle = document.querySelector<HTMLButtonElement>("[data-nav-toggle]");
const nav = document.querySelector<HTMLElement>("[data-nav]");
if (navToggle && nav) {
  const setOpen = (open: boolean) => {
    nav.dataset.open = String(open);
    navToggle.setAttribute("aria-expanded", String(open));
  };
  navToggle.addEventListener("click", () => setOpen(navToggle.getAttribute("aria-expanded") !== "true"));
  // Escape closes the menu and returns focus to its button, as keyboard users expect.
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && navToggle.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      navToggle.focus();
    }
  });
  nav.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("a")) setOpen(false);
  });
}

/* ---------- copy buttons on code blocks ---------- */
const live = document.createElement("div");
live.className = "sr-only";
live.setAttribute("aria-live", "polite");
document.body.appendChild(live);

document.addEventListener("click", async (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-copy]");
  if (!button) return;
  const block = button.closest(".code-block");
  const code = block?.querySelector("pre")?.textContent ?? "";
  try {
    await navigator.clipboard.writeText(code);
    const label = button.querySelector("span");
    if (label) label.textContent = "Copied";
    live.textContent = "Code copied to the clipboard";
    setTimeout(() => {
      if (label) label.textContent = "Copy";
      live.textContent = "";
    }, 2000);
  } catch {
    live.textContent = "Could not copy automatically. Select the code and copy it.";
  }
});

/* ---------- tabs (code examples) ---------- */
document.querySelectorAll<HTMLElement>("[data-tabs]").forEach((root) => {
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const panels = Array.from(root.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
  const select = (index: number, focus = false) => {
    tabs.forEach((tab, i) => {
      const active = i === index;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1; // only the active tab is in the tab order; arrows move between tabs
      if (active && focus) tab.focus();
    });
    panels.forEach((panel, i) => (panel.hidden = i !== index));
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(i));
    tab.addEventListener("keydown", (event) => {
      const last = tabs.length - 1;
      const target = event.key === "ArrowRight" ? (i === last ? 0 : i + 1) : event.key === "ArrowLeft" ? (i === 0 ? last : i - 1) : event.key === "Home" ? 0 : event.key === "End" ? last : -1;
      if (target >= 0) {
        event.preventDefault();
        select(target, true);
      }
    });
  });
  select(0);
});

/* ---------- wide tables ---------- */
// A table wider than the screen scrolls inside its own box instead of pushing the whole page sideways. The box is
// focusable and labelled so a keyboard user can scroll it too.
document.querySelectorAll<HTMLTableElement>("main table").forEach((table) => {
  if (table.closest(".table-wrap") || table.scrollWidth <= (table.parentElement?.clientWidth ?? Infinity) + 1) return;
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  wrap.tabIndex = 0;
  wrap.setAttribute("role", "region");
  wrap.setAttribute("aria-label", `${table.querySelector("caption")?.textContent?.trim() || "Table"} (scrolls sideways)`);
  table.replaceWith(wrap);
  wrap.append(table);
});
