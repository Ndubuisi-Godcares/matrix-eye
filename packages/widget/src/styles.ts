/**
 * Widget styles. They live inside a Shadow DOM, so the host website's CSS cannot restyle (or break) the widget,
 * and the widget's CSS cannot leak into the host. Colours are CSS custom properties so a site owner can theme it.
 *
 * Contrast notes (WCAG 2.1 AA): navy #0f2238 on white is about 16:1; white on navy the same; navy on the gold
 * accent #c19a5b is about 6.5:1. Focus rings use navy on light surfaces and light gold on dark ones (3:1 or more).
 */
export const CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }

.ee-root {
  /* Inheritable properties (text-transform, letter-spacing, line-height...) flow through the shadow boundary from
     the host page's own rules, e.g. "* { text-transform: uppercase !important }". Resetting everything here makes
     the widget look the same on every website. Custom properties are unaffected by "all". */
  all: initial;
  display: block;
  --ee-primary: #0f2238;
  --ee-on-primary: #ffffff;
  --ee-accent: #c19a5b;
  --ee-surface: #ffffff;
  --ee-text: #14202e;
  --ee-muted: #52606f;
  --ee-bubble: #eef1f5;
  --ee-border: #d5dbe3;
  --ee-focus: #0f2238;
  --ee-danger: #a12a2a;
  color-scheme: light;
  font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: var(--ee-text);
}
.ee-root[data-theme="dark"] {
  color-scheme: dark; /* native scrollbars and form controls follow the theme (no bright scrollbar on a dark panel) */
  --ee-surface: #121b29;
  --ee-text: #f1f4f8;
  --ee-muted: #a9b4c2;
  --ee-bubble: #1d2a3d;
  --ee-border: #2c3b52;
  --ee-focus: #e8cf9c;
  --ee-danger: #ff9a9a;
}

.ee-launcher, .ee-panel { position: fixed; z-index: 2147483000; }
.ee-root[data-position="right"] .ee-launcher { right: 20px; }
.ee-root[data-position="left"] .ee-launcher { left: 20px; }
.ee-root[data-position="right"] .ee-panel { right: 20px; }
.ee-root[data-position="left"] .ee-panel { left: 20px; }

.ee-launcher {
  bottom: 20px; width: 58px; height: 58px; border-radius: 50%;
  border: 2px solid var(--ee-accent); background: var(--ee-primary); color: var(--ee-on-primary);
  display: grid; place-items: center; cursor: pointer; padding: 0;
  box-shadow: 0 6px 20px rgba(15, 34, 56, .35);
  transition: transform .15s ease;
}
.ee-launcher:hover { transform: scale(1.06); }
.ee-launcher svg { width: 26px; height: 26px; }

.ee-panel {
  bottom: 90px; width: 380px; max-width: calc(100vw - 24px);
  height: 560px; max-height: calc(100dvh - 110px);
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--ee-surface); border: 1px solid var(--ee-border); border-radius: 16px;
  box-shadow: 0 16px 48px rgba(15, 34, 56, .3);
  animation: ee-rise .18s ease-out;
}
.ee-panel[hidden] { display: none; }

.ee-head {
  display: flex; align-items: center; gap: 10px; padding: 12px 14px;
  background: var(--ee-primary); color: var(--ee-on-primary); border-bottom: 3px solid var(--ee-accent);
}
.ee-head h2 { margin: 0; font-size: 16px; font-weight: 650; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ee-icon-btn {
  background: transparent; border: 0; color: inherit; cursor: pointer; padding: 6px; border-radius: 8px;
  display: grid; place-items: center; opacity: .92;
}
.ee-icon-btn:hover { background: rgba(255, 255, 255, .16); opacity: 1; }
.ee-icon-btn svg { width: 20px; height: 20px; }

.ee-log { flex: 1; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--ee-border) transparent; padding: 14px; display: flex; flex-direction: column; gap: 12px; overscroll-behavior: contain; }
.ee-msg { max-width: 88%; display: flex; flex-direction: column; gap: 6px; }
.ee-msg.ee-user { align-self: flex-end; }
.ee-bubble { padding: 9px 13px; border-radius: 14px; word-wrap: break-word; overflow-wrap: anywhere; }
.ee-user .ee-bubble { background: var(--ee-primary); color: var(--ee-on-primary); border-bottom-right-radius: 4px; }
.ee-assistant .ee-bubble { background: var(--ee-bubble); border-bottom-left-radius: 4px; }
.ee-error .ee-bubble { background: transparent; border: 1px solid var(--ee-danger); color: var(--ee-danger); }
.ee-bubble p { margin: 0 0 8px; }
.ee-bubble p:last-child, .ee-bubble ul:last-child, .ee-bubble ol:last-child { margin-bottom: 0; }
.ee-bubble ul, .ee-bubble ol { margin: 0 0 8px; padding-left: 20px; }
.ee-bubble a { color: inherit; text-underline-offset: 2px; }
.ee-cite { font-size: 11px; line-height: 0; }
.ee-cite a { font-weight: 700; text-decoration: none; padding: 0 1px; }
.ee-cite a:hover { text-decoration: underline; }

.ee-sources { font-size: 13px; color: var(--ee-muted); padding: 0 4px; }
.ee-sources-title { margin: 0 0 2px; font-weight: 650; }
.ee-sources ol { margin: 0; padding-left: 20px; }
.ee-sources a { color: var(--ee-text); }
.ee-host { margin-left: 6px; opacity: .85; }

.ee-actions { display: flex; align-items: center; gap: 4px; padding: 0 2px; color: var(--ee-muted); font-size: 13px; }
.ee-actions .ee-icon-btn { color: var(--ee-muted); padding: 5px; opacity: 1; }
.ee-actions .ee-icon-btn:hover { background: var(--ee-bubble); }
.ee-actions .ee-icon-btn[aria-pressed="true"] { color: var(--ee-text); background: var(--ee-bubble); }
.ee-actions .ee-icon-btn svg { width: 17px; height: 17px; }
.ee-retry { font: inherit; background: none; border: 0; padding: 0; color: inherit; text-decoration: underline; cursor: pointer; margin-left: 8px; }

.ee-typing { display: inline-flex; gap: 4px; padding: 4px 0; }
.ee-typing i { width: 7px; height: 7px; border-radius: 50%; background: var(--ee-muted); animation: ee-bounce 1.2s infinite ease-in-out; }
.ee-typing i:nth-child(2) { animation-delay: .15s; }
.ee-typing i:nth-child(3) { animation-delay: .3s; }

.ee-suggestions { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 14px 10px; }
.ee-suggestions[hidden] { display: none; }
.ee-chip {
  font: inherit; font-size: 13px; cursor: pointer; padding: 6px 12px; border-radius: 999px;
  background: var(--ee-surface); color: var(--ee-text); border: 1px solid var(--ee-border);
}
.ee-chip:hover { border-color: var(--ee-accent); background: var(--ee-bubble); }

.ee-form { display: flex; align-items: flex-end; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--ee-border); background: var(--ee-surface); }
.ee-input {
  flex: 1; resize: none; font: inherit; color: var(--ee-text); background: var(--ee-surface);
  border: 1px solid var(--ee-border); border-radius: 12px; padding: 9px 12px; max-height: 110px; min-height: 40px;
  overflow-y: hidden; /* switched to auto by the script only when the text outgrows the box */
  scrollbar-width: thin;
}
.ee-input::placeholder { color: var(--ee-muted); opacity: 1; }
.ee-send {
  flex: none; width: 40px; height: 40px; border-radius: 50%; border: 0; cursor: pointer;
  background: var(--ee-primary); color: var(--ee-on-primary); display: grid; place-items: center; padding: 0;
}
.ee-send:disabled { opacity: .4; cursor: not-allowed; }
.ee-send svg { width: 19px; height: 19px; }

.ee-brand { text-align: center; font-size: 12px; color: var(--ee-muted); padding: 0 0 8px; background: var(--ee-surface); }
.ee-brand a { color: inherit; }

.ee-sr { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; padding: 0; }

:is(.ee-launcher, .ee-icon-btn, .ee-chip, .ee-send, .ee-input, .ee-retry, a, .ee-log):focus-visible { outline: 3px solid var(--ee-focus); outline-offset: 2px; }
.ee-head :is(.ee-icon-btn):focus-visible { outline-color: var(--ee-accent); }

@keyframes ee-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes ee-bounce { 0%, 80%, 100% { transform: scale(.6); opacity: .5; } 40% { transform: scale(1); opacity: 1; } }

/* Phones: the panel becomes a full-screen sheet so the keyboard and thumbs have room. */
@media (max-width: 480px) {
  .ee-panel, .ee-root[data-position] .ee-panel {
    inset: 0; width: 100%; max-width: none; height: 100dvh; max-height: none; border-radius: 0; border: 0;
    padding-bottom: env(safe-area-inset-bottom);
  }
  .ee-launcher { bottom: 16px; }
  .ee-root[data-position="right"] .ee-launcher { right: 16px; }
  .ee-root[data-position="left"] .ee-launcher { left: 16px; }
  .ee-input { font-size: 16px; } /* 16px stops iOS zooming into the field */
}

@media (prefers-reduced-motion: reduce) {
  .ee-panel { animation: none; }
  .ee-launcher { transition: none; }
  .ee-typing i { animation: none; opacity: .8; }
}

@media (forced-colors: active) {
  .ee-launcher, .ee-send, .ee-chip, .ee-input, .ee-bubble { border: 1px solid CanvasText; }
}
`;
