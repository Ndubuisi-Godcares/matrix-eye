import type { LauncherIcon } from "@matrix-eye/sdk";
import { LAUNCHER_ICONS } from "../lib/catalog";
import { IconGlyph } from "./IconGlyph";

export function LauncherIconGallery({ selected, onSelect }: { selected: LauncherIcon; onSelect: (id: LauncherIcon) => void }) {
  const families = [...new Set(LAUNCHER_ICONS.map((i) => i.family))];
  return (
    <div className="icon-gallery">
      {families.map((family) => (
        <div key={family} className="icon-gallery__family">
          <h3>{family}</h3>
          <div className="icon-gallery__row">
            {LAUNCHER_ICONS.filter((i) => i.family === family).map((icon) => {
              const active = icon.id === selected;
              return (
                <button key={icon.id} type="button" className={`icon-swatch${active ? " icon-swatch--active" : ""}`} aria-pressed={active} aria-label={icon.name} title={icon.name} onClick={() => onSelect(icon.id)}>
                  <IconGlyph id={icon.id} className="icon-swatch__glyph" />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
