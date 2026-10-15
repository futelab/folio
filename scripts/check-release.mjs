import { readFile, appendFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const manifest = JSON.parse(
  await readFile(new URL("../packages/folio/package.json", import.meta.url), "utf8"),
);
const tag = process.env.GITHUB_REF_NAME;
if (!tag || tag !== `v${manifest.version}`)
  throw new Error(`Release tag must be v${manifest.version}`);
execFileSync("git", ["merge-base", "--is-ancestor", "HEAD", "origin/main"], { stdio: "inherit" });
const prerelease = manifest.version.split("-")[1]?.split(".")[0];
const distTag = prerelease
  ? ["alpha", "beta", "rc"].includes(prerelease)
    ? prerelease
    : "next"
  : "latest";
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `dist_tag=${distTag}\n`);
console.log(`Release ${tag} -> npm dist-tag ${distTag}`);
