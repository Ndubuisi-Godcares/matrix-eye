/**
 * Colour helpers. A site owner can set any brand colour; the widget must still be readable, so text placed on
 * that colour is chosen automatically to meet WCAG contrast (white or the brand navy, whichever is stronger).
 */

/** Accepts #rgb or #rrggbb; returns normalised "#rrggbb" or null. Anything else is refused (it goes into CSS). */
export function normalizeHex(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  return /^#[0-9a-f]{6}$/.test(v) ? v : null;
}

/** WCAG relative luminance of a "#rrggbb" colour. */
export function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** WCAG contrast ratio between two colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The text colour to place on `background`: white if that reads well (WCAG AA is 4.5:1), else the brand navy,
 * else black, which is the last resort for mid-tone colours where neither white nor navy is strong enough.
 */
export function readableTextOn(background: string, light = "#ffffff", dark = "#0f2238"): string {
  const AA = 4.5;
  if (contrast(background, light) >= AA) return light;
  if (contrast(background, dark) >= AA) return dark;
  return contrast(background, "#000000") >= contrast(background, light) ? "#000000" : light;
}
