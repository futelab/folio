import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const stylesRoot = resolve(here, "../../styles");

const tokens = readFileSync(resolve(stylesRoot, "styles.css"), "utf8")
  .split("\n")
  .filter((line) => !line.startsWith("@import"))
  .join("\n");
const editor = readFileSync(resolve(stylesRoot, "editor.css"), "utf8");
const reader = readFileSync(resolve(stylesRoot, "reader.css"), "utf8");
const interactions = readFileSync(resolve(here, "../../react/src/editor-interactions.css"), "utf8");
const layout = readFileSync(resolve(stylesRoot, "layout.css"), "utf8");
const features = readFileSync(resolve(stylesRoot, "features.css"), "utf8");

writeFileSync(
  resolve(here, "../styles.css"),
  `${tokens}\n${editor}\n${reader}\n${interactions}\n${layout}\n${features}\n`,
);
