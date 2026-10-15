import assert from "node:assert/strict";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import spawn from "cross-spawn";

const directory = resolve(dirname(fileURLToPath(import.meta.url)), "../packages/folio");
const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
const registry = "https://registry.npmjs.org";
const distTag = process.env.DIST_TAG ?? (manifest.version.includes("-") ? "next" : "latest");
assert(/^[a-z][a-z0-9-]*$/.test(distTag), "Invalid npm dist-tag");
const temp = await mkdtemp(join(tmpdir(), "folio-release-"));
const pack = spawn.sync("npm", ["pack", "--json", "--silent", "--pack-destination", temp], {
  cwd: directory,
  encoding: "utf8",
});
if (pack.status !== 0) throw new Error(`npm pack failed: ${pack.stderr}`);
const [artifact] = JSON.parse(pack.stdout);
const existing = spawn.sync(
  "npm",
  [
    "view",
    `${manifest.name}@${manifest.version}`,
    "dist.integrity",
    "--json",
    "--registry",
    registry,
  ],
  { cwd: directory, encoding: "utf8" },
);
if (existing.status === 0) {
  assert.equal(
    JSON.parse(existing.stdout),
    artifact.integrity,
    "This npm version already contains a different artifact. Bump the version; published versions are immutable.",
  );
  console.log(
    `${manifest.name}@${manifest.version} already contains this exact artifact; publication verified.`,
  );
} else {
  if (!/E404|404 Not Found/.test(`${existing.stdout}\n${existing.stderr}`)) {
    throw new Error(`Could not verify npm registry: ${existing.stdout}\n${existing.stderr}`);
  }
  const result = spawn.sync(
    "npm",
    [
      "publish",
      join(temp, artifact.filename),
      "--access",
      "public",
      "--tag",
      distTag,
      "--registry",
      registry,
    ],
    { cwd: directory, stdio: "inherit" },
  );
  if (result.status !== 0) throw new Error(`npm publish failed (${result.status})`);
}
