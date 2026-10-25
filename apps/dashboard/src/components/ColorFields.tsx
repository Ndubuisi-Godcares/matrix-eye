const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isValidHex(value: string): boolean {
  return HEX_RE.test(value.trim());
}

export function ColorFields({
  color,
  accent,
  onColorChange,
  onAccentChange,
}: {
  color: string;
  accent: string;
  onColorChange: (value: string) => void;
  onAccentChange: (value: string) => void;
}) {
  return (
    <div className="color-fields">
      <label className={`field field--color${isValidHex(color) ? "" : " field--invalid"}`}>
        <span>Brand colour</span>
        <div className="color-fields__row">
          <input type="color" value={isValidHex(color) ? normalize(color) : "#0f2238"} onChange={(e) => onColorChange(e.target.value)} aria-label="Pick brand colour" />
          <input value={color} onChange={(e) => onColorChange(e.target.value)} placeholder="#0f2238" spellCheck={false} />
        </div>
        {!isValidHex(color) && <small>Must be a hex colour, e.g. #0f2238</small>}
      </label>
      <label className={`field field--color${isValidHex(accent) ? "" : " field--invalid"}`}>
        <span>Accent colour</span>
        <div className="color-fields__row">
          <input type="color" value={isValidHex(accent) ? normalize(accent) : "#c19a5b"} onChange={(e) => onAccentChange(e.target.value)} aria-label="Pick accent colour" />
          <input value={accent} onChange={(e) => onAccentChange(e.target.value)} placeholder="#c19a5b" spellCheck={false} />
        </div>
        {!isValidHex(accent) && <small>Must be a hex colour, e.g. #c19a5b</small>}
      </label>
    </div>
  );
}

/** <input type="color"> needs a full 6-digit value; a 3-digit shorthand is expanded. */
function normalize(hex: string): string {
  const v = hex.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : "#000000";
}
