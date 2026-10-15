import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(resolve(root, "packages/folio/package.json"), "utf8"));
for (const name of ["core", "react", "styles"]) {
  const path = resolve(root, `packages/${name}/package.json`);
  const internal = JSON.parse(await readFile(path, "utf8"));
  internal.version = manifest.version;
  await writeFile(path, `${JSON.stringify(internal, null, 2)}\n`);
}
for (const [name, symbol] of [
  ["packages/core/src/version.ts", "folioCoreVersion"],
  ["packages/react/src/index.ts", "folioReactVersion"],
]) {
  const path = resolve(root, name);
  const source = await readFile(path, "utf8");
  await writeFile(
    path,
    source.replace(
      new RegExp(`export const ${symbol} = "[^"]+";`),
      `export const ${symbol} = "${manifest.version}";`,
    ),
  );
}
