/**
 * Generates the website's image assets from the original logo (brand/matrix-eye-logo.png, neon on a black background).
 * The logo's colours are never changed.
 *
 *   public/brand/logo.webp     the full logo with a transparent background (used to draw the sharing image)
 *   public/brand/lockup.webp   the same logo, small, for the header and footer
 *   public/favicon-32.png, apple-touch-icon.png, icon-512.png   the emblem on a dark tile
 *   brand/matrix-eye-logo-transparent.png   full-size transparent copy for any other use
 *
 * The black is removed with "colour to alpha": a pixel's brightness becomes its opacity and its colour is restored
 * to full strength, which is the exact inverse of laying the logo on black. Glowing edges therefore fade smoothly
 * into whatever is behind them. The picture is then trimmed and converted to WebP.
 * Re-run after changing the logo:  npm run assets --workspace @matrix-eye/website
 */
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const brandDir = join(here, "../../../brand");
const source = join(brandDir, "matrix-eye-logo.png");
const out = join(here, "../public");
mkdirSync(join(out, "brand"), { recursive: true });

// Earlier logos produced files with other names; they are no longer used.
for (const old of ["logo-light.webp", "logo-dark.webp", "lockup-light.webp", "lockup-dark.webp", "mark-light.webp", "mark-dark.webp"]) rmSync(join(out, "brand", old), { force: true });

const TILE = { r: 10, g: 19, b: 32, alpha: 1 }; // the site's dark background, for the small icons

/** The logo with its black background turned into transparency, colours at full strength. */
async function transparent() {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = Buffer.from(data);
  for (let i = 0; i < px.length; i += 4) {
    const alpha = Math.max(px[i], px[i + 1], px[i + 2]) / 255;
    if (alpha < 0.06) {
      // Near-black: the background and its faint noise.
      px[i] = px[i + 1] = px[i + 2] = px[i + 3] = 0;
      continue;
    }
    for (let k = 0; k < 3; k++) px[i + k] = Math.min(255, Math.round(px[i + k] / alpha));
    px[i + 3] = Math.round(alpha * 255);
  }
  return sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

// Trimming is a separate step from cropping: sharp cannot extract and trim in one pipeline.
const trimmed = async (png) => sharp(png).trim({ threshold: 4 }).png().toBuffer();
const full = await trimmed(await transparent());
await sharp(full).toFile(join(brandDir, "matrix-eye-logo-transparent.png"));

const webp = (buffer, file, width) =>
  sharp(buffer).resize({ width }).webp({ quality: 90, alphaQuality: 95 }).toFile(join(out, "brand", file));
await webp(full, "logo.webp", 700);
await webp(full, "lockup.webp", 360);

// The emblem alone (everything above the lettering, which starts about 74% of the way down) for the small icons.
const fullMeta = await sharp(full).metadata();
const emblem = await trimmed(await sharp(full).extract({ left: 0, top: 0, width: fullMeta.width, height: Math.round(fullMeta.height * 0.72) }).png().toBuffer());

async function icon(size, file, padding) {
  const inner = Math.round(size * (1 - padding * 2));
  const mark = await sharp(emblem).resize({ width: inner, height: inner, fit: "inside" }).toBuffer();
  const radius = Math.round(size * 0.22);
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`);
  await sharp({ create: { width: size, height: size, channels: 4, background: TILE } })
    .composite([{ input: mark, gravity: "centre" }, { input: mask, blend: "dest-in" }])
    .png({ compressionLevel: 9 })
    .toFile(join(out, file));
}
await icon(32, "favicon-32.png", 0.06);
await icon(180, "apple-touch-icon.png", 0.12);
await icon(512, "icon-512.png", 0.14);
const meta = await sharp(source).metadata();
console.log(`Assets written to apps/website/public (source ${meta.width}x${meta.height}, trimmed ${fullMeta.width}x${fullMeta.height})`);
