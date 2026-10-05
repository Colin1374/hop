// Build: src.html (source, icon placeholder) → index.html / hop.html / index_gh.html
// index.html is what GitHub Pages serves, so it must be the built artifact.
import { readFileSync, writeFileSync } from "node:fs";

const PLACEHOLDER = "ICON_B64_PLACEHOLDER";
const src = readFileSync(new URL("./src.html", import.meta.url), "utf8");
const b64 = readFileSync(new URL("./icon_b64.txt", import.meta.url), "utf8").trim();

if (!src.includes(PLACEHOLDER)) throw new Error(`source missing ${PLACEHOLDER}`);
if (!b64.startsWith("iVBOR")) throw new Error("icon_b64.txt does not look like a PNG");

const out = src.replace(PLACEHOLDER, "data:image/png;base64," + b64);
if (out.includes(PLACEHOLDER)) throw new Error("placeholder survived replacement");
if (!out.includes("data:image/png;base64,")) throw new Error("no inlined icon in output");

for (const name of ["index.html", "hop.html", "index_gh.html"]) {
  writeFileSync(new URL("./" + name, import.meta.url), out);
  console.log(`${name}: ${out.length} bytes`);
}
console.log("build ok, icon inlined");
