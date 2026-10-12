/**
 * Generates public/og.png (1200x630), the image shown when a link to the site is shared.
 * It is drawn in a real browser from the logo and the site's own heading font so it matches the brand exactly.
 * Re-run after changing the tagline or logo:  npm run og --workspace @eagles-eye/website
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const dataUri = (file, type) => `data:${type};base64,${readFileSync(file).toString("base64")}`;

const logo = dataUri(join(root, "public/brand/logo-light.webp"), "image/webp");
const font = dataUri(join(root, "../../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2"), "font/woff2");
const sans = dataUri(join(root, "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"), "font/woff2");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "F"; src: url(${font}) format("woff2"); font-weight: 100 900; }
@font-face { font-family: "I"; src: url(${sans}) format("woff2"); font-weight: 100 900; }
html, body { margin: 0; width: 1200px; height: 630px; }
body { background: #fbf9f4; position: relative; overflow: hidden; font-family: "I", sans-serif; color: #0f2238; }
.glow { position: absolute; right: -200px; top: -250px; width: 900px; height: 900px; border-radius: 50%; background: radial-gradient(closest-side, rgba(193,154,91,.30), rgba(193,154,91,0)); }
.bar { position: absolute; left: 0; top: 0; bottom: 0; width: 14px; background: #c19a5b; }
.wrap { position: absolute; left: 90px; top: 70px; right: 90px; bottom: 70px; display: flex; flex-direction: column; justify-content: space-between; }
img { height: 150px; width: auto; align-self: flex-start; }
h1 { font-family: "F", serif; font-weight: 580; font-size: 78px; line-height: 1.06; letter-spacing: -0.02em; margin: 0; max-width: 980px; }
p { margin: 0; font-size: 30px; color: #55616f; }
</style></head><body><div class="glow"></div><div class="bar"></div>
<div class="wrap"><img src="${logo}" alt=""><h1>An assistant for your website that shows its sources</h1><p>Answers from your own pages, with a link to each one. Early access.</p></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(root, "public/og.png") });
await browser.close();
console.log("public/og.png written");
