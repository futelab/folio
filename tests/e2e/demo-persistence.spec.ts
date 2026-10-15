import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Locator } from "@playwright/test";

const storageKey = "futelab.folio.demo.pages";
async function editorContentText(editor: Locator) {
  return editor.evaluate((element) => {
    const content = element.cloneNode(true) as HTMLElement;
    content.querySelectorAll(".folio-collaboration-cursor").forEach((cursor) => cursor.remove());
    return content.textContent;
  });
}

test("demo saves versioned snapshots and restores the latest draft after reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New page", exact: true }).click();
  await page.getByRole("textbox", { name: "Page title", exact: true }).fill("Persistent draft");
  await page.locator(".ProseMirror").click();
  await page.keyboard.insertText("持久保存的文档 draft");
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  const snapshot = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);
  expect(snapshot).toMatchObject({ format: "folio-demo", version: 1 });
  expect(snapshot.pages[0].document).toMatchObject({
    format: "folio",
    version: 1,
    document: { type: "doc" },
  });
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Page title", exact: true })).toHaveValue(
    "Persistent draft",
  );
  await expect(page.locator(".ProseMirror")).toContainText("持久保存的文档 draft");
});

test("demo keeps malformed saved data untouched and offers the original backup", async ({
  page,
}) => {
  const original = '{"broken":';
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: storageKey,
    value: original,
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("original saved draft has been preserved");
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(original);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download original backup" }).click();
  const download = await downloadPromise;
  expect(await readFile((await download.path())!, "utf8")).toBe(original);
  await page.getByTitle("Reset", { exact: true }).click();
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).format, storageKey),
  ).toBe("folio-demo");
});

test("a localStorage quota failure keeps the in-memory draft available for export", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    localStorage.setItem(
      key,
      JSON.stringify([
        {
          id: "saved-original",
          title: "Original draft",
          icon: "□",
          updatedAt: 1,
          document: {
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Original saved content" }] },
            ],
          },
        },
      ]),
    );
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage is full", "QuotaExceededError");
    };
  }, storageKey);
  await page.goto("/");
  const originalSaved = await page.evaluate((key) => localStorage.getItem(key), storageKey);
  await expect(page.getByRole("alert")).toContainText("Your draft is still open");
  await page.getByRole("button", { name: "New page", exact: true }).click();
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("Unsaved but recoverable");
  await expect(page.getByRole("alert")).toContainText("Your draft is still open");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadPromise;
  expect(await readFile((await download.path())!, "utf8")).toContain("Unsaved but recoverable");
  await expect(page.locator(".ProseMirror")).toContainText("Unsaved but recoverable");
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(originalSaved);
});

test("demo migrates valid legacy saved pages into versioned document snapshots", async ({
  page,
}) => {
  await page.addInitScript(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify([
          {
            id: "legacy",
            title: "Legacy draft",
            icon: "□",
            updatedAt: 1,
            document: {
              type: "doc",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Legacy content" }] }],
            },
          },
        ]),
      ),
    storageKey,
  );
  await page.goto("/");
  await expect(page.locator(".ProseMirror")).toContainText("Legacy content");
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);
  expect(saved.pages[0].document).toMatchObject({ format: "folio", version: 1 });
});

test("demo read-only mode blocks document mutations and still allows exporting", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  const before = await page.locator(".ProseMirror").textContent();
  await page.getByRole("switch", { name: "Read-only", exact: true }).check();
  await expect(page.locator(".ProseMirror")).toHaveAttribute("contenteditable", "false");
  await expect(page.getByRole("textbox", { name: "Page title", exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
  await expect(page.getByRole("button", { name: "Import", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeEnabled();
  await expect(page.getByRole("toolbar", { name: "Document actions" })).toHaveCount(0);
  const browsing = page.getByRole("toolbar", { name: "Document browsing", exact: true });
  await expect(browsing).toBeVisible();
  await browsing.getByRole("button", { name: "Find and replace", exact: true }).click();
  const search = page.getByRole("search", { name: "Find and replace", exact: true });
  await search.getByRole("searchbox", { name: "Find in document", exact: true }).fill("reusable");
  await expect(search.getByRole("button", { name: "Next match", exact: true })).toBeEnabled();
  await expect(search.getByRole("textbox", { name: "Replace with", exact: true })).toBeDisabled();
  await expect(search.getByRole("button", { name: "Replace", exact: true })).toBeDisabled();
  await expect(search.getByRole("button", { name: "Replace all", exact: true })).toBeDisabled();
  await search.getByRole("button", { name: "Close search", exact: true }).click();
  await browsing.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Comments", exact: true })).toBeVisible();
  await browsing.getByRole("button", { name: "Comments", exact: true }).click();
  await browsing.getByRole("button", { name: "Version history", exact: true }).click();
  const history = page.getByRole("dialog", { name: "Version history", exact: true });
  await expect(
    history.getByRole("button", { name: "Save current version", exact: true }),
  ).toBeDisabled();
  await history.getByRole("button", { name: /Initial demo version/ }).click();
  await expect(
    history.getByRole("button", { name: "Restore this version", exact: true }),
  ).toBeDisabled();
  await history.getByRole("button", { name: "Close version history", exact: true }).click();
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("Must not be inserted");
  expect(await page.locator(".ProseMirror").textContent()).toBe(before);
  await page.getByRole("switch", { name: "Read-only", exact: true }).uncheck();
  await expect(page.locator(".ProseMirror")).toHaveAttribute("contenteditable", "true");
});

test("changing the locale translates the demo and editor without replacing content", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New page", exact: true }).click();
  await page.locator(".ProseMirror").click();
  await page.keyboard.insertText("保留的内容");
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
  await expect(page.getByRole("navigation", { name: "页面", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "图片", exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "只读", exact: true })).toBeVisible();
  await expect(page.locator(".ProseMirror")).toContainText("保留的内容");
  await page.getByRole("combobox", { name: "界面语言", exact: true }).selectOption("en");
  await expect(page.getByRole("button", { name: "Image", exact: true })).toBeVisible();
});

test("a 390px workspace keeps multilingual read-only tools within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  // A third page makes the horizontal page strip wider than the viewport.
  await page.getByRole("button", { name: "New page", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Page title", exact: true })
    .fill("窄屏页面与较长的页面标题");
  await page.locator(".ProseMirror").click();
  await page.keyboard.insertText("窄屏文档内容");

  async function expectViewportContained() {
    const geometry = await page.evaluate(() => {
      const targets = Array.from(
        document.querySelectorAll(
          ".folio-demo__sidebar, .folio-demo__tools, .folio-demo__tools select, .folio-demo__file-actions button, .folio-demo__toggle",
        ),
      );
      return {
        viewport: window.innerWidth,
        pageWidth: document.documentElement.scrollWidth,
        bounds: targets.map((element) => ({
          name: element.className || element.tagName,
          left: element.getBoundingClientRect().left,
          right: element.getBoundingClientRect().right,
        })),
      };
    });
    expect(geometry.viewport).toBe(390);
    expect(geometry.pageWidth).toBeLessThanOrEqual(390);
    for (const bound of geometry.bounds) {
      expect(bound.left, `${bound.name} starts inside the viewport`).toBeGreaterThanOrEqual(0);
      expect(bound.right, `${bound.name} ends inside the viewport`).toBeLessThanOrEqual(390);
    }
  }

  await expectViewportContained();
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
  await page.getByRole("switch", { name: "只读", exact: true }).check();
  await expect(page.getByRole("switch", { name: "只读", exact: true })).toBeChecked();
  await expectViewportContained();
  const pageStrip = await page
    .locator(".folio-demo__page-list")
    .evaluate((element) => ({ content: element.scrollWidth, available: element.clientWidth }));
  expect(pageStrip.content).toBeGreaterThan(pageStrip.available);
  await page.getByTitle("预览", { exact: true }).click();
  await expect(page.getByTestId("folio-reader")).toBeVisible();
  await expectViewportContained();
});

test("unsupported Markdown export reports the loss and preserves the current document", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  const before = await page.locator(".ProseMirror").textContent();
  await page.getByRole("combobox", { name: "File format", exact: true }).selectOption("markdown");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByTestId("demo-feedback")).toContainText(
    "Export failed. The current document has been kept.",
  );
  await expect(page.getByTestId("demo-feedback")).toContainText("Markdown");
  expect(await page.locator(".ProseMirror").textContent()).toBe(before);
  await page.getByRole("combobox", { name: "File format", exact: true }).selectOption("html");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadPromise;
  expect(await readFile((await download.path())!, "utf8")).toContain("Launch checklist");
});

for (const sample of [
  {
    format: "json",
    name: "document.json",
    mimeType: "application/json",
    content: JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Imported JSON content" }] }],
    }),
    text: "Imported JSON content",
  },
  {
    format: "html",
    name: "document.html",
    mimeType: "text/html",
    content: "<h2>Imported HTML title</h2><p>Imported HTML content</p>",
    text: "Imported HTML content",
  },
  {
    format: "markdown",
    name: "document.md",
    mimeType: "text/markdown",
    content: "## Imported Markdown title\n\nImported Markdown content",
    text: "Imported Markdown content",
  },
]) {
  test(`demo imports and exports ${sample.format} files`, async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New page", exact: true }).click();
    await page
      .getByRole("combobox", { name: "File format", exact: true })
      .selectOption(sample.format);
    await page.getByLabel("Import document file", { exact: true }).setInputFiles({
      name: sample.name,
      mimeType: sample.mimeType,
      buffer: Buffer.from(sample.content),
    });
    await expect(page.locator(".ProseMirror")).toContainText(sample.text);
    await expect(page.getByTestId("demo-feedback")).toContainText("Document imported.");
    if (sample.format === "markdown") {
      await page.locator(".ProseMirror h2").fill("Imported Markdown title edited");
      await expect(page.locator(".ProseMirror h2")).toHaveText("Imported Markdown title edited");
    }
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const download = await downloadPromise;
    const exported = await readFile((await download.path())!, "utf8");
    expect(exported).toContain(sample.text);
    if (sample.format === "markdown") {
      expect(exported).toContain("## Imported Markdown title edited");
      await page.getByLabel("Import document file", { exact: true }).setInputFiles({
        name: "round-trip.md",
        mimeType: "text/markdown",
        buffer: Buffer.from(exported),
      });
      await expect(page.locator(".ProseMirror h2")).toHaveText("Imported Markdown title edited");
    }
  });
}

test("invalid JSON imports leave the current document untouched", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  const before = await page.locator(".ProseMirror").textContent();
  await page.getByLabel("Import document file", { exact: true }).setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"type":"doc","content":false}'),
  });
  await expect(page.getByTestId("demo-feedback")).toContainText(
    "Import failed. The current document has been kept.",
  );
  expect(await page.locator(".ProseMirror").textContent()).toBe(before);
  await page.getByLabel("Import document file", { exact: true }).setInputFiles({
    name: "unsafe.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Unsafe imported link",
                marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
              },
            ],
          },
        ],
      }),
    ),
  });
  await expect(page.getByTestId("demo-feedback")).toContainText("URL is not permitted");
  expect(await page.locator(".ProseMirror").textContent()).toBe(before);
});

test("demo uploads a real PNG and rejects SVG and oversized images", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New page", exact: true }).click();
  await page.getByRole("button", { name: "Image", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Image", exact: true });
  await dialog.getByLabel("Upload image", { exact: true }).setInputFiles({
    name: "unsafe.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"),
  });
  await expect(dialog.getByRole("alert")).toContainText("SVG files are not supported");
  await dialog.getByLabel("Upload image", { exact: true }).setInputFiles({
    name: "oversized.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(1024 * 1024 + 1),
  });
  await expect(dialog.getByRole("alert")).toContainText("1 MB or smaller");
  await dialog
    .getByLabel("Upload image", { exact: true })
    .setInputFiles(resolve("apps/demo/public/folio-workspace.png"));
  await expect(dialog.getByLabel("URL", { exact: true })).toHaveValue(/^data:image\/png;base64,/);
  await dialog.getByLabel("Caption", { exact: true }).fill("Uploaded example");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("demo-feedback")).toHaveCount(0);
  await expect(page.locator(".ProseMirror img")).toHaveAttribute("src", /^data:image\/png;base64,/);
  await page.getByTitle("Preview", { exact: true }).click();
  await expect(
    page.getByTestId("folio-reader").getByText("Uploaded example", { exact: true }),
  ).toBeVisible();
});

test("demo supplies selectable mention candidates", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New page", exact: true }).click();
  await page.getByRole("button", { name: "Mention", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Mention", exact: true });
  await dialog.getByRole("option", { name: "Maya", exact: true }).click();
  await expect(page.locator(".ProseMirror [data-type='mention']")).toContainText("Maya");
});

test("embedded image uploads respect the document budget before changing the draft", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New page", exact: true }).click();
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 500;
    canvas.height = 450;
    const context = canvas.getContext("2d")!;
    const pixels = context.createImageData(canvas.width, canvas.height);
    for (let offset = 0; offset < pixels.data.length; offset += 65_536)
      crypto.getRandomValues(pixels.data.subarray(offset, offset + 65_536));
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/png");
  });
  const image = {
    name: "large-example.png",
    mimeType: "image/png",
    buffer: Buffer.from(dataUrl.split(",")[1], "base64"),
  };
  expect(image.buffer.length).toBeLessThan(1024 * 1024);
  expect(image.buffer.length).toBeGreaterThan(750_000);
  await page.getByRole("button", { name: "Image", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Image", exact: true });
  await dialog.getByLabel("Upload image", { exact: true }).setInputFiles(image);
  await expect(dialog.getByLabel("URL", { exact: true })).toHaveValue(/^data:image\/png;base64,/);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".ProseMirror img")).toHaveCount(1);
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Image", exact: true }).click();
  await dialog.getByLabel("Upload image", { exact: true }).setInputFiles(image);
  await expect(dialog.getByRole("alert")).toContainText("no room for another embedded image");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".ProseMirror img")).toHaveCount(1);
  await expect(page.locator(".ProseMirror")).toHaveAttribute("contenteditable", "true");
  await page.getByRole("button", { name: /Design review notes/ }).click();
  await expect(page.getByTestId("demo-feedback")).toHaveCount(0);
});

test("feature laboratory switches toolbar slots and mounts a working slash menu in a portal", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New page", exact: true }).click();
  const editor = page.locator(".ProseMirror");
  await editor.fill("Preserved text");
  await page.getByText("Feature laboratory", { exact: true }).click();
  const mode = page.getByLabel("Toolbar mode", { exact: true });
  await mode.selectOption("hidden");
  await expect(page.getByRole("toolbar", { name: "Document actions", exact: true })).toHaveCount(0);
  await expect(editor).toHaveText("Preserved text");
  await mode.selectOption("custom");
  await expect(page.getByTestId("demo-custom-toolbar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Host bold action" })).toBeVisible();
  await mode.selectOption("floating");
  await expect(page.getByRole("toolbar", { name: "Document actions", exact: true })).toBeVisible();
  await mode.selectOption("default");
  await page.getByLabel("Mount floating UI outside the editor", { exact: true }).check();
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("/head");
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  expect(await menu.evaluate((element) => Boolean(element.closest(".folio-ui-portal")))).toBe(true);
  await menu.getByRole("menuitem", { name: /Heading 2/ }).click();
  await page.keyboard.insertText("Portal heading");
  await expect(editor.locator("h2")).toHaveText("Portal heading");
  await expect(editor).toContainText("Preserved text");
  await expect(page.getByTestId("demo-feedback")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.getByRole("switch", { name: "只读", exact: true }).check();
  await expect(editor).toHaveAttribute("contenteditable", "false");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});

test("two-person demo synchronizes independent peers and keeps a readonly peer receiving edits", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New page", exact: true }).click();
  await page.getByText("Feature laboratory", { exact: true }).click();
  await page.getByLabel("Two-person collaboration", { exact: true }).check();
  const editors = page.locator(".ProseMirror");
  await expect(editors).toHaveCount(2);
  const maya = editors.nth(0);
  const bob = editors.nth(1);
  await maya.fill("Maya writes");
  await expect.poll(() => editorContentText(bob)).toBe("Maya writes");
  await bob.click();
  await page.keyboard.press("Home");
  await page.keyboard.insertText("Bob and ");
  await expect.poll(() => editorContentText(maya)).toBe("Bob and Maya writes");
  await page.getByLabel("Make Bob read-only", { exact: true }).check();
  await expect(bob).toHaveAttribute("contenteditable", "false");
  await maya.click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" again");
  await expect.poll(() => editorContentText(bob)).toBe("Bob and Maya writes again");
  await page.getByLabel("Two-person collaboration", { exact: true }).uncheck();
  await expect(editors).toHaveCount(1);
  await expect(editors).toHaveText("Bob and Maya writes again");
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  await page.reload();
  await expect(editors).toHaveText("Bob and Maya writes again");
  await expect(editors).toHaveCount(1);
});

test("demo discussions stay isolated per page and support replies and resolved threads", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New page", exact: true }).click();
  await page.getByRole("textbox", { name: "Page title", exact: true }).fill("Discussion page");
  await page.locator(".ProseMirror").fill("Review this block");
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Comments", exact: true });
  await panel.getByLabel("Comment text", { exact: true }).fill("Please review");
  await panel.getByRole("button", { name: "Comment on block", exact: true }).click();
  await expect(panel.getByText("Please review", { exact: true })).toBeVisible();
  await panel.getByLabel("Reply", { exact: true }).fill("Reviewed");
  await panel.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(panel.getByText("Reviewed", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Resolve", exact: true }).click();
  await expect(panel.getByText("Resolved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New page", exact: true }).click();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(panel.getByText("No comments yet", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Discussion page/ }).click();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(panel.getByText("Please review", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Reopen", exact: true }).click();
  await expect(panel.getByLabel("Reply", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(panel.getByText("No comments yet", { exact: true })).toBeVisible();
});

test("demo history restores a named revision and plain paste keeps the page deep link", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New page", exact: true }).click();
  const editor = page.locator(".ProseMirror");
  await editor.fill("Checkpoint content");
  await page.getByRole("button", { name: "Version history", exact: true }).click();
  const history = page.getByRole("dialog", { name: "Version history", exact: true });
  await expect(history.getByRole("button", { name: /Initial demo version/ })).toBeVisible();
  await history.getByRole("textbox", { name: "Version name", exact: true }).fill("Checkpoint A");
  await history.getByRole("button", { name: "Save current version", exact: true }).click();
  await expect(history.getByRole("button", { name: /Checkpoint A/ })).toBeVisible();
  await history.getByRole("button", { name: "Close version history", exact: true }).click();
  await editor.fill("Changed after checkpoint");
  await page.getByRole("button", { name: "Version history", exact: true }).click();
  await history.getByRole("button", { name: /Checkpoint A/ }).click();
  await expect(
    history.getByRole("button", { name: "Restore this version", exact: true }),
  ).toBeEnabled();
  await history.getByRole("button", { name: "Restore this version", exact: true }).click();
  await expect(editor).toHaveText("Checkpoint content");
  await history.getByRole("button", { name: "Close version history", exact: true }).click();
  await page.getByText("Feature laboratory", { exact: true }).click();
  await page.getByLabel("Paste as plain text", { exact: true }).check();
  await editor.click();
  await page.keyboard.press("End");
  await editor.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", " Pasted plain");
    transfer.setData("text/html", "<strong> Pasted plain</strong>");
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    });
    // Firefox discards constructor-supplied clipboardData on synthetic events.
    // Supply the same real DataTransfer to exercise the editor's paste handler.
    if (!event.clipboardData?.types.length)
      Object.defineProperty(event, "clipboardData", { value: transfer });
    element.dispatchEvent(event);
  });
  await expect(editor).toHaveText("Checkpoint content Pasted plain");
  await expect(editor.locator("strong")).toHaveCount(0);
  const linkedUrl = page.url();
  expect(new URL(linkedUrl).searchParams.get("page")).toBeTruthy();
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Folio editor plan/ }).click();
  await page.goto(linkedUrl);
  await expect(editor).toHaveText("Checkpoint content Pasted plain");
});
