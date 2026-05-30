import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const manifestPath = join(packageDir, "package.json");
const backupPath = join(packageDir, "package.json.pack-backup");

async function restoreManifest() {
  try {
    await rename(backupPath, manifestPath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

async function prepareManifest() {
  await restoreManifest();

  const source = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(source);

  await writeFile(backupPath, source);

  manifest.scripts = {
    build: "tsup --config tsup.config.ts && node scripts/build-styles.mjs",
    test: "vitest run --passWithNoTests src",
    typecheck: "tsc --noEmit",
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

const action = process.argv[2];

if (action === "prepare") {
  await prepareManifest();
} else if (action === "restore") {
  await restoreManifest();
} else {
  throw new Error(`Unknown pack manifest action: ${action ?? "(missing)"}`);
}
