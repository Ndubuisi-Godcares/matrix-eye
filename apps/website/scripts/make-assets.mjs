/**
 * Generates the website's image assets from the original logo (brand/matrix-eye-logo-light.png, drawn on white).
 * The logo's colours are never changed: the same navy and gold appear in light and dark themes (in dark mode the
 * site shows the logo on a light badge, see global.css).
 *
 *   public/brand/logo-light.webp     the full logo, transparent background (used to draw the sharing image)
 *   public/brand/lockup-light.webp   the same logo, small, for the header and footer
 *   public/favicon-32.png, apple-touch-icon.png, icon-512.png   the eye on a cream tile
 *
 * The original is a 1.2 MB picture on a white background. A website needs small files, so the white is removed
 * ("colour to alpha": the exact inverse of laying the logo on white, which keeps its soft metallic edges), the picture
 * is trimmed and converted to WebP.
 * Re-run after changing the logo:  npm run assets --workspace @matrix-eye/website
 */
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "../../../brand/matrix-eye-logo-light.png");
const out = join(here, "../public");
mkdirSync(join(out, "brand"), { recursive: true });

// Earlier versions also made recoloured dark-theme copies; they are no longer used.
for (const old of ["logo-dark.webp", "lockup-dark.webp", "mark-light.webp", "mark-dark.webp"]) rmSync(join(out, "brand", old), { force: true });

const CREAM = { r: 250, g: 248, b: 243, alpha: 1 };

/** The logo with its white background turned into transparency, colours exactly as drawn. */
async function transparent() {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = Buffer.from(data);
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    // How far each channel is from white; the largest gap is how opaque the pixel must be to look the same on white.
    const alpha = Math.max(255 - r, 255 - g, 255 - b) / 255;
    if (alpha < 0.02) {
      px[i + 3] = 0;
      continue;
    }
    // Undo the blend with white to recover the pixel's own colour.
    for (let k = 0; k < 3; k++) px[i + k] = Math.max(0, Math.min(255, Math.round((px[i + k] - 255 * (1 - alpha)) / alpha)));
    px[i + 3] = Math.round(alpha * 255);
  }
  return sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

// Trimming is a separate step from cropping: sharp cannot extract and trim in one pipeline.
const trimmed = async (png) => sharp(png).trim({ threshold: 4 }).png().toBuffer();
const full = await trimmed(await transparent());
const meta = await sharp(source).metadata();

const webp = (buffer, file, width) =>
  sharp(buffer).resize({ width }).webp({ quality: 90, alphaQuality: 95 }).toFile(join(out, "brand", file));
await webp(full, "logo-light.webp", 700);
await webp(full, "lockup-light.webp", 360);

// The eye alone (everything above the lettering, which starts about 70% of the way down) for the small icons.
const fullMeta = await sharp(full).metadata();
const eye = await trimmed(await sharp(full).extract({ left: 0, top: 0, width: fullMeta.width, height: Math.round(fullMeta.height * 0.7) }).png().toBuffer());

async function icon(size, file, padding) {
  const inner = Math.round(size * (1 - padding * 2));
  const mark = await sharp(eye).resize({ width: inner, height: inner, fit: "inside" }).toBuffer();
  const radius = Math.round(size * 0.22);
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`);
  await sharp({ create: { width: size, height: size, channels: 4, background: CREAM } })
    .composite([{ input: mark, gravity: "centre" }, { input: mask, blend: "dest-in" }])
    .png({ compressionLevel: 9 })
    .toFile(join(out, file));
}
await icon(32, "favicon-32.png", 0.06);
await icon(180, "apple-touch-icon.png", 0.1);
await icon(512, "icon-512.png", 0.12);
console.log(`Assets written to apps/website/public (source ${meta.width}x${meta.height})`);
