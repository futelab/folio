import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const directory = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/demo/dist");
const html = await readFile(resolve(directory, "index.html"), "utf8");
const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
assert(
  assets.some((url) => url.startsWith("/folio/assets/")),
  "Missing /folio/ asset base",
);
for (const url of assets) {
  if (/^(?:https?:|data:|#)/.test(url)) continue;
  assert(url.startsWith("/folio/"), `Asset escapes GitHub Pages project path: ${url}`);
  await access(resolve(directory, url.slice("/folio/".length)));
}
console.log(`GitHub Pages asset base verified (${assets.length} references)`);
