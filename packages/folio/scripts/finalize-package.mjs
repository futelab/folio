import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const dist = new URL("../dist/", import.meta.url);
await writeFile(new URL("styles.d.ts", dist), "export {};\n");
// esbuild removes module directives. Only the editor entry points are client boundaries.
for (const entry of ["index", "react"]) {
  for (const extension of ["js", "cjs"]) {
    const path = new URL(`${entry}.${extension}`, dist);
    await writeFile(path, `"use client";\n${await readFile(path, "utf8")}`);
  }
}
// Internal workspace aliases in generated declarations must refer to the public core entry.
// Run after tsup exits: its JavaScript onSuccess hook can run before declarations finish.
for (const name of await readdir(dist)) {
  if (!/\.d\.(?:ts|cts)$/.test(name)) continue;
  const path = new URL(name, dist);
  const suffix = name.endsWith(".d.cts") ? "cjs" : "js";
  const content = (await readFile(path, "utf8")).replace(
    /(['"])@futelab\/folio-core(?:\/browser)?\1/g,
    JSON.stringify(`./core.${suffix}`),
  );
  if (/@futelab\/folio-(?:core|react)/.test(content)) {
    throw new Error(`Private workspace reference in ${fileURLToPath(path)}`);
  }
  await writeFile(path, content);
}
