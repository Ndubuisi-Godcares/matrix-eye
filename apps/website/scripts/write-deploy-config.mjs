/**
 * Writes vercel.json from the shared header definitions (scripts/headers.mjs).
 *
 *   PUBLIC_API_URL=https://api.example.com npm run deploy-config --workspace @eagles-eye/website
 *
 * The API address is added to the Content-Security-Policy so the forms may talk to it and nothing else.
 * Re-run whenever the API address changes; a test fails if the committed file is out of date.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { vercelConfig } from "./headers.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// PLACEHOLDER until the API's domain is chosen: the same address the rest of the site assumes. Always set PUBLIC_API_URL
// for a real deployment, otherwise the browser will refuse to let the forms talk to your API.
const apiUrl = process.env.PUBLIC_API_URL ?? "https://api.eagleseye.ai";
const apiOrigin = new URL(apiUrl).origin;

writeFileSync(join(root, "vercel.json"), `${JSON.stringify(vercelConfig({ apiOrigin }), null, 2)}\n`);
console.log(`vercel.json written (forms may connect to ${apiOrigin})`);
