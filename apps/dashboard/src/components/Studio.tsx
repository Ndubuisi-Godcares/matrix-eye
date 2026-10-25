import { useMemo, useState } from "react";
import { DEFAULT_APPEARANCE, MatrixEyeClient, MatrixEyeError, type LauncherIcon, type Project, type WidgetAppearance, type WidgetTemplate } from "@matrix-eye/sdk";
import { ColorFields, isValidHex } from "./ColorFields";
import { LauncherIconGallery } from "./LauncherIconGallery";
import { PreviewPanel } from "./PreviewPanel";
import { TemplateGallery } from "./TemplateGallery";

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

export function Studio({ client, project, baseUrl }: { client: MatrixEyeClient; project: Project; baseUrl: string }) {
  const [saved, setSaved] = useState<WidgetAppearance>(project.settings.appearance ?? DEFAULT_APPEARANCE);
  const [draft, setDraft] = useState<WidgetAppearance>(saved);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const colorText = draft.color ?? "";
  const accentText = draft.accent ?? "";
  const colorsValid = (colorText === "" || isValidHex(colorText)) && (accentText === "" || isValidHex(accentText));

  const setTemplate = (template: WidgetTemplate) => setDraft((d) => ({ ...d, template }));
  const setLauncherIcon = (launcherIcon: LauncherIcon) => setDraft((d) => ({ ...d, launcherIcon }));

  async function save() {
    if (!colorsValid) return;
    setSaveState({ kind: "saving" });
    try {
      const next = await client.updateSettings(project.id, { appearance: draft });
      setSaved(next.appearance);
      setDraft(next.appearance);
      setSaveState({ kind: "saved" });
    } catch (err) {
      setSaveState({ kind: "error", message: err instanceof MatrixEyeError ? err.message : "Could not save. Check the connection and try again." });
    }
  }

  return (
    <div className="studio">
      <div className="studio__header">
        <div>
          <h1>{project.name}</h1>
          <p className="studio__site">{project.siteUrl}</p>
        </div>
        <div className="studio__save">
          {saveState.kind === "error" && <span className="studio__save-error">{saveState.message}</span>}
          {saveState.kind === "saved" && !dirty && <span className="studio__save-ok">Saved</span>}
          <button type="button" className="btn btn--ghost" disabled={!dirty} onClick={() => setDraft(saved)}>
            Reset
          </button>
          <button type="button" className="btn btn--primary" disabled={!dirty || !colorsValid || saveState.kind === "saving"} onClick={() => void save()}>
            {saveState.kind === "saving" ? "Saving…" : "Save to project"}
          </button>
        </div>
      </div>

      <div className="studio__layout">
        <div className="studio__controls">
          <section className="studio__section">
            <h2>Chatbot design</h2>
            <TemplateGallery selected={draft.template ?? "minimal"} onSelect={setTemplate} />
          </section>
          <section className="studio__section">
            <h2>Launcher icon</h2>
            <LauncherIconGallery selected={draft.launcherIcon ?? "chat"} onSelect={setLauncherIcon} />
          </section>
          <section className="studio__section">
            <h2>Branding</h2>
            <ColorFields color={colorText} accent={accentText} onColorChange={(color) => setDraft((d) => ({ ...d, color: color || null }))} onAccentChange={(accent) => setDraft((d) => ({ ...d, accent: accent || null }))} />
          </section>
        </div>

        <div className="studio__preview">
          <PreviewPanel baseUrl={baseUrl} projectId={project.id} appearance={draft} />
        </div>
      </div>
    </div>
  );
}
