/**
 * Generates the website's image assets from the original logo (brand/eagles-eye-logo-primary.png):
 *
 *   public/brand/logo-light.webp   logo for light backgrounds (navy + gold), transparent
 *   public/brand/logo-dark.webp    logo for dark backgrounds (white + gold), transparent
 *   public/favicon-32.png, apple-touch-icon.png, icon-512.png   the eye mark on navy
 *
 * The original is a 0.4 MB PNG. A website needs a small file that also works on a dark theme, so it is trimmed,
 * resized, converted to WebP, and recoloured (navy lettering to near-white) for dark backgrounds.
 * Re-run after changing the logo:  npm run assets --workspace @eagles-eye/website
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "../../../brand/eagles-eye-logo-primary.png");
const out = join(here, "../public");
mkdirSync(join(out, "brand"), { recursive: true });

const NAVY = [15, 34, 56];
const WHITE_ON_DARK = [241, 244, 248];

/**
 * The logo with its original transparency kept. `navy` replaces the navy lettering and outline (for a dark theme);
 * the gold is untouched. Colour is classified per pixel (gold is warm: red well above blue); the alpha channel,
 * which already carries the anti-aliased edges, is left exactly as designed.
 */
async function recoloured(navy) {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = Buffer.from(data);
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue; // fully transparent: nothing to colour
    const isGold = px[i] - px[i + 2] > 45;
    if (!isGold) {
      px[i] = navy[0];
      px[i + 1] = navy[1];
      px[i + 2] = navy[2];
    }
  }
  return sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } });
}

for (const [name, navy] of [["light", NAVY], ["dark", WHITE_ON_DARK]]) {
  const image = await recoloured(navy);
  await image.trim({ threshold: 8 }).resize({ width: 720 }).webp({ quality: 90, alphaQuality: 95 }).toFile(join(out, `brand/logo-${name}.webp`));
}

// The eye mark (top part of the logo, above the script lettering) for favicons.
const meta = await sharp(source).metadata();
const w = meta.width, h = meta.height;
const cropped = await (await recoloured(WHITE_ON_DARK))
  .extract({ left: Math.round(w * 0.2), top: Math.round(h * 0.06), width: Math.round(w * 0.62), height: Math.round(h * 0.46) })
  .png()
  .toBuffer();
// Trimming is a separate step: sharp cannot extract and trim in one pipeline.
const eye = await sharp(cropped).trim({ threshold: 8 }).png().toBuffer();

async function icon(size, file, padding = 0.18) {
  const inner = Math.round(size * (1 - padding * 2));
  const mark = await sharp(eye).resize({ width: inner, height: inner, fit: "inside" }).toBuffer();
  const radius = Math.round(size * 0.22);
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`);
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: NAVY[0], g: NAVY[1], b: NAVY[2], alpha: 1 } } })
    .composite([{ input: mark, gravity: "centre" }, { input: mask, blend: "dest-in" }])
    .png({ compressionLevel: 9 })
    .toFile(join(out, file));
}
await icon(32, "favicon-32.png", 0.1);
await icon(180, "apple-touch-icon.png", 0.14);
await icon(512, "icon-512.png", 0.16);
console.log("Assets written to apps/website/public");
