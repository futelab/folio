import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import spawn from "cross-spawn";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootManifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const requested = process.argv.slice(2);
const consumers = requested.length ? requested : ["react18", "react19", "next"];
assert(
  consumers.every((name) => ["react18", "react19", "next"].includes(name)),
  "Unknown consumer",
);
await mkdir(join(root, ".tmp"), { recursive: true });
const temp = await mkdtemp(join(tmpdir(), "folio-consumer-"));

function run(command, args, cwd, capture = false) {
  const result = spawn.sync(command, args, {
    cwd,
    env: { ...process.env, NODE_PATH: "", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: capture ? "pipe" : "inherit",
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.error ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }
  return result.stdout;
}

const pack = JSON.parse(
  run(
    "npm",
    ["pack", "--json", "--silent", "--pack-destination", temp],
    join(root, "packages/folio"),
    true,
  ),
);
assert.equal(pack.length, 1);
const files = new Set(pack[0].files.map((file) => file.path));
for (const file of [
  "LICENSE",
  "README.md",
  "styles.css",
  "dist/reader.js",
  "dist/react.js",
  "dist/core.js",
  "dist/serialization.js",
  "dist/serialization.browser.js",
  "dist/index.d.ts",
]) {
  assert(files.has(file), `Missing packed file: ${file}`);
}
for (const file of files) {
  assert(
    !file.startsWith("src/") && !file.includes("pack-backup"),
    `Unexpected packed file: ${file}`,
  );
}
for (const name of await readdir(join(root, "packages/folio/dist"))) {
  if (!/\.d\.(?:ts|cts)$/.test(name)) continue;
  const types = await readFile(join(root, "packages/folio/dist", name), "utf8");
  assert(
    !/@futelab\/folio-(?:core|react)|\.\.\/\.\.\/(?:react|core)\/src/.test(types),
    `Private source dependency in ${name}`,
  );
}
const tarball = join(temp, pack[0].filename);

const appSource = `"use client";
import { useState } from "react";
import { FolioEditor, FolioReader } from "@futelab/folio/react";
import { fromMarkdown, toHTML } from "@futelab/folio/serialization";
import type { FolioDocument } from "@futelab/folio/core";
export default function App() {
  const [value, setValue] = useState<FolioDocument>(() => fromMarkdown("# Package consumer"));
  const [readOnly, setReadOnly] = useState(false);
  return <main>
    <button onClick={() => setReadOnly(v => !v)}>Toggle read only</button>
    <FolioEditor documentId="consumer" value={value} onChange={setValue} editable={!readOnly} locale="zh-CN" />
    <FolioReader value={value} headingIdPrefix="client" />
    <output data-testid="html">{toHTML(value)}</output>
  </main>;
}`;
const runtimeSource = `import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { createEmptyFolioDocument, createFolioSnapshot, parseFolioSnapshot } from "@futelab/folio/core";
import { FolioEditor } from "@futelab/folio/react";
import { FolioReader } from "@futelab/folio/reader";
import { toHTML, fromHTML, fromMarkdown, toMarkdown } from "@futelab/folio/serialization";
const document = fromMarkdown("# SSR consumer");
assert.match(renderToString(React.createElement(FolioReader,{value:document})),/SSR consumer/);
assert.equal(typeof FolioEditor,"function");
assert.deepEqual(parseFolioSnapshot(createFolioSnapshot(document)).document,document);
assert.match(toHTML(fromHTML("<p>HTML works</p>")),/HTML works/);
assert.match(toMarkdown(document),/SSR consumer/);
assert.equal(createEmptyFolioDocument().type,"doc");
assert.equal(typeof window,"undefined");
`;
const cjsSource = `const assert = require("node:assert/strict");
const React = require("react");
const {renderToString} = require("react-dom/server");
const {createEmptyFolioDocument} = require("@futelab/folio/core");
const {FolioReader} = require("@futelab/folio/reader");
const {toHTML} = require("@futelab/folio/serialization");
assert.equal(typeof require("@futelab/folio/react").FolioEditor,"function");
assert.equal(typeof require("@futelab/folio").FolioEditor,"function");
assert.match(renderToString(React.createElement(FolioReader,{value:createEmptyFolioDocument()})),/article/);
assert.match(toHTML(createEmptyFolioDocument()),/<p>/);
`;

async function smokeBrowser(url) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    const editor = page.locator('[contenteditable="true"]');
    await editor.waitFor();
    await editor.fill("Consumer package works");
    await page.locator(".folio-reader").filter({ hasText: "Consumer package works" }).waitFor();
    assert.match(await page.getByTestId("html").textContent(), /Consumer package works/);
    await page.getByRole("button", { name: "Toggle read only" }).click();
    await page.locator('.folio-editor [contenteditable="false"]').waitFor();
    assert.equal(await page.locator(".folio-block-side-controls").count(), 0);
    assert.deepEqual(errors, [], `Browser runtime errors: ${errors.join("; ")}`);
  } finally {
    await browser.close();
  }
}

async function staticServer(directory) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const target = resolve(directory, `.${pathname === "/" ? "/index.html" : pathname}`);
      if (!target.startsWith(`${resolve(directory)}${process.platform === "win32" ? "\\" : "/"}`)) {
        response.writeHead(403).end();
        return;
      }
      const body = await readFile(target);
      const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html" };
      response.setHeader("Content-Type", types[extname(target)] ?? "application/octet-stream");
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

for (const name of consumers) {
  console.log(`\nValidating packed consumer: ${name}`);
  const directory = join(temp, name);
  await mkdir(directory);
  const reactVersion =
    name === "react18" ? "18.3.1" : rootManifest.devDependencies.react.replace(/^\^/, "");
  const manifest = {
    name: `folio-consumer-${name}`,
    private: true,
    type: "module",
    dependencies: { "@futelab/folio": tarball, react: reactVersion, "react-dom": reactVersion },
    devDependencies: {
      typescript: rootManifest.devDependencies.typescript,
      "@types/node": rootManifest.devDependencies["@types/node"],
      "@types/react": name === "react18" ? "^18.3.0" : rootManifest.devDependencies["@types/react"],
      "@types/react-dom":
        name === "react18" ? "^18.3.0" : rootManifest.devDependencies["@types/react-dom"],
      vite: rootManifest.devDependencies.vite,
      "@vitejs/plugin-react": rootManifest.devDependencies["@vitejs/plugin-react"],
      ...(name === "next" ? { next: "16.4.1" } : {}),
    },
  };
  await writeFile(join(directory, "package.json"), JSON.stringify(manifest, null, 2));
  await writeFile(join(directory, "app.tsx"), appSource);
  await writeFile(join(directory, "runtime.mjs"), runtimeSource);
  await writeFile(join(directory, "runtime.cjs"), cjsSource);
  await writeFile(
    join(directory, "consumer.cts"),
    'import React = require("react"); import {FolioReader} from "@futelab/folio/reader"; import {FolioEditor} from "@futelab/folio/react"; import {FolioEditor as RootEditor} from "@futelab/folio"; import {createEmptyFolioDocument} from "@futelab/folio/core"; const element: React.ReactElement = React.createElement(FolioReader,{value:createEmptyFolioDocument()}); const editor: typeof FolioEditor = RootEditor; void element; void editor;',
  );
  await writeFile(
    join(directory, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        jsx: "react-jsx",
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        esModuleInterop: true,
        types: ["node"],
      },
      include: ["app.tsx"],
    }),
  );
  await writeFile(
    join(directory, "tsconfig.cjs.json"),
    JSON.stringify({
      extends: "./tsconfig.json",
      compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext" },
      include: ["consumer.cts"],
    }),
  );
  run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"],
    directory,
  );
  run(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit"], directory);
  run(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.cjs.json"], directory);
  run(process.execPath, ["runtime.mjs"], directory);
  run(process.execPath, ["runtime.cjs"], directory);
  if (name === "next") {
    // The strict standalone checks above cover Folio's declarations. Next's own vendored
    // declarations require the framework's standard skipLibCheck setting during next build.
    const nextConfig = JSON.parse(await readFile(join(directory, "tsconfig.json"), "utf8"));
    nextConfig.compilerOptions.skipLibCheck = true;
    await writeFile(join(directory, "tsconfig.json"), JSON.stringify(nextConfig));
    await mkdir(join(directory, "app"));
    await writeFile(
      join(directory, "app/layout.tsx"),
      'import "@futelab/folio/styles.css"; export default function Layout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }',
    );
    await writeFile(
      join(directory, "app/page.tsx"),
      'import App from "../app"; import {FolioReader} from "@futelab/folio/reader"; export default function Page(){return <><FolioReader value={{type:"doc",content:[{type:"paragraph",content:[{type:"text",text:"SSR consumer"}]}]}}/><App/></>;}',
    );
    await writeFile(
      join(directory, "next.config.mjs"),
      "export default { experimental: { cpus: 2 } };",
    );
    run(process.execPath, ["node_modules/next/dist/bin/next", "build"], directory);
    const probe = await staticServer(directory);
    const port = new URL(probe.url).port;
    await new Promise((done) => probe.server.close(done));
    const child = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", port],
      { cwd: directory, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }, stdio: "pipe" },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    try {
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          if ((await fetch(probe.url)).ok) {
            ready = true;
            break;
          }
        } catch {
          /* Wait for Next's listener. */
        }
        if (child.exitCode !== null) break;
        await new Promise((done) => setTimeout(done, 200));
      }
      assert(ready, `Next server did not start: ${output}`);
      const html = await (await fetch(probe.url)).text();
      assert.match(html, /SSR consumer/);
      await smokeBrowser(probe.url);
    } finally {
      child.kill();
    }
  } else {
    await writeFile(
      join(directory, "index.html"),
      '<html><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>',
    );
    await writeFile(
      join(directory, "main.tsx"),
      'import React from "react"; import {createRoot} from "react-dom/client"; import "@futelab/folio/styles.css"; import App from "./app"; createRoot(document.getElementById("root")!).render(<App/>);',
    );
    await writeFile(
      join(directory, "vite.config.mjs"),
      'import {defineConfig} from "vite"; import react from "@vitejs/plugin-react"; export default defineConfig({plugins:[react()]});',
    );
    run(process.execPath, ["node_modules/vite/bin/vite.js", "build"], directory);
    const { server, url } = await staticServer(join(directory, "dist"));
    try {
      await smokeBrowser(url);
    } finally {
      await new Promise((done) => server.close(done));
    }
  }
  console.log(`PASS: ${name} types, ESM, CJS, SSR, production build and browser runtime`);
}
console.log(`Packed consumer verification passed. Artifacts: ${temp}`);
