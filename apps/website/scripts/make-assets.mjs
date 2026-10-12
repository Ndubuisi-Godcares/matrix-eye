/**
 * Generates the website's image assets from the original logo (brand/matrix-eye-logo-light.png, drawn on white):
 *
 *   public/brand/logo-light.webp, logo-dark.webp   the full logo (eye + MATRIXEYE lettering), transparent
 *   public/brand/mark-light.webp, mark-dark.webp   the eye alone, for the header and footer (the lettering is live text there)
 *   public/favicon-32.png, apple-touch-icon.png, icon-512.png   the eye on navy
 *
 * The original is a 1.2 MB picture on a white background. A website needs small files with a transparent background
 * that also work on a dark theme, so the white is removed ("colour to alpha": the exact inverse of laying the logo
 * on white, which keeps its soft metallic edges), the picture is trimmed and converted to WebP, and for dark
 * backgrounds the navy parts are lightened and the gold brightened.
 * Re-run after changing the logo:  npm run assets --workspace @matrix-eye/website
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "../../../brand/matrix-eye-logo-light.png");
const out = join(here, "../public");
mkdirSync(join(out, "brand"), { recursive: true });

const NAVY = [10, 24, 44];
// Navy parts are blended this far toward a pale blue on dark backgrounds, which keeps the metallic shading.
const LIFT_TO = [100, 170, 255];
const LIFT = 0.6;
// Gold looks dimmer against a dark page, so it is warmed and brightened a little there.
const BRIGHT_GOLD = [255, 207, 96];

/** The logo with its white background turned into transparency. `dark` lightens the non-gold parts for dark pages. */
async function transparent(dark) {
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
    let c = [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round((v - 255 * (1 - alpha)) / alpha))));
    const isGold = c[0] > c[2] + 10; // warm = gold; navy is always bluer than it is red
    if (dark) {
      const [to, amount] = isGold ? [BRIGHT_GOLD, 0.4] : [LIFT_TO, LIFT];
      c = c.map((v, k) => Math.round(v + (to[k] - v) * amount));
    }
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
    px[i + 3] = Math.round(alpha * 255);
  }
  return { px, width: info.width, height: info.height };
}

const toPng = async ({ px, width, height }) => sharp(px, { raw: { width, height, channels: 4 } }).png().toBuffer();
// Trimming is a separate step from cropping: sharp cannot extract and trim in one pipeline.
const trimmed = async (png) => sharp(png).trim({ threshold: 4 }).png().toBuffer();

const lightFull = await toPng(await transparent(false));
const darkFull = await toPng(await transparent(true));
const meta = await sharp(source).metadata();

// The eye mark: everything above the lettering (the lettering starts about 70% of the way down).
const markArea = { left: 0, top: 0, width: meta.width, height: Math.round(meta.height * 0.68) };
const markLight = await trimmed(await sharp(lightFull).extract(markArea).png().toBuffer());
const markDark = await trimmed(await sharp(darkFull).extract(markArea).png().toBuffer());

const webp = (buffer, file, width) =>
  sharp(buffer).resize({ width }).webp({ quality: 90, alphaQuality: 95 }).toFile(join(out, "brand", file));
await webp(await trimmed(lightFull), "logo-light.webp", 700);
await webp(await trimmed(darkFull), "logo-dark.webp", 700);
await webp(markLight, "mark-light.webp", 300);
await webp(markDark, "mark-dark.webp", 300);

async function icon(size, file, padding) {
  const inner = Math.round(size * (1 - padding * 2));
  const mark = await sharp(markDark).resize({ width: inner, height: inner, fit: "inside" }).toBuffer();
  const radius = Math.round(size * 0.22);
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`);
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: NAVY[0], g: NAVY[1], b: NAVY[2], alpha: 1 } } })
    .composite([{ input: mark, gravity: "centre" }, { input: mask, blend: "dest-in" }])
    .png({ compressionLevel: 9 })
    .toFile(join(out, file));
}
await icon(32, "favicon-32.png", 0.06);
await icon(180, "apple-touch-icon.png", 0.1);
await icon(512, "icon-512.png", 0.12);
const mk = await sharp(markLight).metadata();
console.log(`Assets written to apps/website/public (mark ${mk.width}x${mk.height})`);
