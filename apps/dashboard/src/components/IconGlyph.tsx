import { ICONS } from "@matrix-eye/widget";
import type { LauncherIcon } from "@matrix-eye/sdk";

/** Renders one of the widget's own launcher icons, from the exact same path data it uses — never a hand-copied duplicate. */
export function IconGlyph({ id, className }: { id: LauncherIcon; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICONS[id].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
