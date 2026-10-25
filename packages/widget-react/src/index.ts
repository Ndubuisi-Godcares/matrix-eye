/**
 * React wrapper for the MatrixEye chat widget.
 *
 *   import { MatrixEyeChat } from "@matrix-eye/widget-react";
 *   <MatrixEyeChat project="PROJECT_ID" api="https://api.example.com" color="#0f2238" />
 *
 * It renders nothing visible itself (the widget floats in a corner) and works with Next.js: the widget code is
 * loaded inside an effect, so it never runs on the server, and the component is safe to import in server code.
 * In the Next.js App Router, use it from a file marked "use client".
 */
import { createElement, useEffect, useRef, type ReactElement } from "react";
import type { EmbedOptions, WidgetHandle } from "@matrix-eye/widget";

export type MatrixEyeChatProps = EmbedOptions;

/** Mounts the chat widget while the component is on screen, and removes it when it unmounts. */
export function MatrixEyeChat(props: MatrixEyeChatProps): ReactElement {
  const container = useRef<HTMLDivElement | null>(null);
  // Primitive options are listed individually so the widget is only rebuilt when one actually changes,
  // not on every render (object props such as `labels` are compared by value through JSON).
  const { project, api, position, title, color, accent, template, launcherIcon, theme, greeting, placeholder, open, branding, persist, labels } = props;
  const labelsKey = JSON.stringify(labels ?? null);

  useEffect(() => {
    const parent = container.current;
    if (!parent) return;
    let cancelled = false;
    let handle: WidgetHandle | null = null;
    // Imported here, not at the top: the widget touches browser-only APIs when it loads.
    void import("@matrix-eye/widget").then((module) => {
      if (cancelled) return; // unmounted (or re-rendered with new options) before the code arrived
      handle = module.init({ project, api, position, title, color, accent, template, launcherIcon, theme, greeting, placeholder, open, branding, persist, labels }, parent);
    });
    return () => {
      cancelled = true;
      handle?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `labels` is tracked through labelsKey
  }, [project, api, position, title, color, accent, template, launcherIcon, theme, greeting, placeholder, open, branding, persist, labelsKey]);

  // An empty, invisible host. The widget positions itself with `position: fixed`.
  return createElement("div", { ref: container, "data-matrix-eye-host": "" });
}
