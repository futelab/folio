import { copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

for (const name of ["README.md", "README.ZH-CN.md", "LICENSE"]) {
  await copyFile(
    fileURLToPath(new URL(`../../../${name}`, import.meta.url)),
    fileURLToPath(new URL(`../${name}`, import.meta.url)),
  );
}
