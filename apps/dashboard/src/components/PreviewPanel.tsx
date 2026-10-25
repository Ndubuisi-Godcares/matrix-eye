import { useEffect, useRef, useState } from "react";
import { ChatWidget, type WidgetOptions } from "@matrix-eye/widget";
import { PublicClient, type WidgetAppearance } from "@matrix-eye/sdk";

type Viewport = "desktop" | "tablet" | "mobile";
const VIEWPORTS: Record<Viewport, { label: string; width: number }> = {
  desktop: { label: "Desktop", width: 900 },
  tablet: { label: "Tablet", width: 700 },
  mobile: { label: "Mobile", width: 390 },
};

const BLANK_DOC = "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"></head><body style=\"margin:0\"></body></html>";

/**
 * A genuinely live preview: it mounts the real, unmodified @matrix-eye/widget package (the same code every
 * visitor's browser runs) inside a sandboxed iframe sized to the chosen viewport, talking to the real public API
 * for the selected project. An iframe, not a styled div, because the widget positions itself with
 * `position: fixed` relative to its own viewport — inside the iframe, that viewport is the device frame, which is
 * exactly the containment this preview needs, with no special "preview mode" added to the production widget.
 *
 * This shows the widget live and open, not the full preview-state matrix (welcome/typing/error/etc.) a more
 * complete studio would offer — see docs/dashboard.md for what is and is not built yet.
 */
export function PreviewPanel({ baseUrl, projectId, appearance }: { baseUrl: string; projectId: string; appearance: WidgetAppearance }) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [ready, setReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const widgetRef = useRef<ChatWidget | null>(null);

  useEffect(() => {
    if (!ready) return;
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;

    widgetRef.current?.destroy();
    doc.body.replaceChildren();
    const host = doc.createElement("div");
    doc.body.appendChild(host);

    const client = new PublicClient({ baseUrl }, projectId);
    const options: WidgetOptions = {
      projectId,
      startOpen: true,
      persist: false,
      position: "right",
      template: appearance.template ?? undefined,
      launcherIcon: appearance.launcherIcon ?? undefined,
      color: appearance.color ?? undefined,
      accent: appearance.accent ?? undefined,
    };
    widgetRef.current = new ChatWidget(host, options, client);
    return () => {
      widgetRef.current?.destroy();
      widgetRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `appearance` fields are listed individually below
  }, [ready, baseUrl, projectId, appearance.template, appearance.launcherIcon, appearance.color, appearance.accent]);

  return (
    <div className="preview">
      <div className="preview__toolbar" role="group" aria-label="Preview viewport">
        {(Object.keys(VIEWPORTS) as Viewport[]).map((v) => (
          <button key={v} type="button" className={`preview__viewport-btn${viewport === v ? " preview__viewport-btn--active" : ""}`} aria-pressed={viewport === v} onClick={() => setViewport(v)}>
            {VIEWPORTS[v].label}
          </button>
        ))}
      </div>
      <div className="preview__stage">
        <div className="preview__frame" style={{ width: VIEWPORTS[viewport].width }}>
          <iframe ref={iframeRef} title="Live chat widget preview" srcDoc={BLANK_DOC} onLoad={() => setReady(true)} />
        </div>
      </div>
      <p className="preview__hint">
        Live against the real API for this project &mdash; not scripted demo data. If no answer appears, add this dashboard&rsquo;s origin to the project&rsquo;s allowed origins first.
      </p>
    </div>
  );
}
