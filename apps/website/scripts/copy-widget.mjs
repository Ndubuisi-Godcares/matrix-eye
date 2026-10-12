/**
 * Copies the built chat widget into the site (public/matrix-eye-widget.js) so the site can host it and, when
 * PUBLIC_WIDGET_PROJECT is set, show the real assistant on its own pages. Skipped quietly if the widget is not built.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "../../../packages/widget/dist/matrix-eye-widget.js");
if (existsSync(source)) {
  mkdirSync(join(here, "../public"), { recursive: true });
  copyFileSync(source, join(here, "../public/matrix-eye-widget.js"));
  console.log("Widget copied into the site.");
} else {
  console.log("Widget not built; skipping (run `npm run build` at the repository root first).");
}
