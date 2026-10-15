import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

async function openDragDocument(page: Page, paragraphs: string[]) {
  await page.goto("/");
  await page.getByRole("button", { name: "New page", exact: true }).click();
  await page.getByLabel("Import document file", { exact: true }).setInputFiles({
    name: "block-drag-fixture.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        type: "doc",
        content: paragraphs.map((text) => ({
          type: "paragraph",
          content: [{ type: "text", text }],
        })),
      }),
    ),
  });
  const editor = page.getByTestId("folio-editor").locator(".ProseMirror");
  await expect(editor.locator(":scope > p")).toHaveText(paragraphs);
  await page.locator(".folio-demo__topbar").click();
  return editor;
}

async function beginBlockDrag(page: Page, source: Locator) {
  await source.hover();
  const handle = page.getByRole("button", { name: "Drag block", exact: true });
  await expect(handle).toBeVisible();
  await expect(handle).toHaveAttribute("draggable", "true");
  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await handle.dispatchEvent("dragstart", {
    clientX: handleBox!.x + handleBox!.width / 2,
    clientY: handleBox!.y + handleBox!.height / 2,
    dataTransfer,
  });
  return { dataTransfer, handle, handleBox: handleBox! };
}

async function scrollAfterAnimationFrames(page: Page, selector?: string) {
  return page.evaluate(async (scrollSelector) => {
    // Observe several actual animation frames so a leaked drag scroll loop has
    // time to move, without tying the assertion to a fixed wall-clock delay.
    for (let frame = 0; frame < 6; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    return scrollSelector
      ? document.querySelector<HTMLElement>(scrollSelector)!.scrollTop
      : window.scrollY;
  }, selector);
}

test("demo presents a complete Notion-like editing workspace", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("folio-demo")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Pages" })).toBeVisible();
  await expect(page.getByRole("main", { name: "Editor" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Preview" })).toHaveCount(0);
  await page.getByTitle("Preview").click();
  await expect(page.getByRole("complementary", { name: "Preview" })).toBeVisible();
  await expect(page.getByTestId("folio-editor")).toBeVisible();
  await expect(page.getByTestId("folio-reader")).toBeVisible();
  await expect(page.getByRole("menu", { name: "Slash commands" })).toHaveCount(0);
  await expect(page.getByText("Saved locally")).toBeVisible();
});

test("blank page uses a document-first surface with preview collapsed", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New page" }).click();

  await expect(page.getByRole("complementary", { name: "Preview" })).toHaveCount(0);
  await expect(page.getByPlaceholder("Untitled")).toBeVisible();
  await expect(page.getByPlaceholder("Untitled")).toHaveValue("");
  const paragraph = page.locator(".ProseMirror > p").first();
  async function expectParagraphHint(hint: string) {
    await expect(paragraph).toHaveAttribute("data-placeholder", hint);
    await expect
      .poll(() => paragraph.evaluate((element) => getComputedStyle(element, "::before").content))
      .toContain(hint);
    const geometry = await paragraph.evaluate((element) => ({
      top: element.getBoundingClientRect().top,
      toolbarBottom: document.querySelector(".folio-editor-actions")!.getBoundingClientRect()
        .bottom,
      float: getComputedStyle(element, "::before").cssFloat,
      pointerEvents: getComputedStyle(element, "::before").pointerEvents,
    }));
    expect(geometry.top).toBeGreaterThanOrEqual(geometry.toolbarBottom);
    expect(geometry.float).toBe("left");
    expect(geometry.pointerEvents).toBe("none");
    await expect(page.locator(".folio-demo__editor-placeholder")).toHaveCount(0);
  }
  await expectParagraphHint("Type '/' for commands");

  const editor = page.getByTestId("folio-editor");
  await expect(editor).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-CN");
  await expectParagraphHint("输入 / 打开命令菜单");
  await page.getByRole("switch", { name: "只读", exact: true }).check();
  await expect(page.locator(".ProseMirror")).toHaveAttribute("contenteditable", "false");
  await expect
    .poll(() => paragraph.evaluate((element) => getComputedStyle(element, "::before").content))
    .toBe("none");
  await page.getByRole("switch", { name: "只读", exact: true }).uncheck();
  await expectParagraphHint("输入 / 打开命令菜单");

  await page.locator(".ProseMirror").click();
  await page.keyboard.insertText("首段实际内容");
  await expect(paragraph).toHaveText("首段实际内容");
  await expect(paragraph).not.toHaveAttribute("data-placeholder");
  await expect
    .poll(() => paragraph.evaluate((element) => getComputedStyle(element, "::before").content))
    .toBe("none");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.press("Backspace");
  await expectParagraphHint("输入 / 打开命令菜单");

  await page.setViewportSize({ width: 390, height: 844 });
  await expectParagraphHint("输入 / 打开命令菜单");
  await page.getByRole("combobox", { name: "界面语言", exact: true }).selectOption("en");
  await expectParagraphHint("Type '/' for commands");
});

test("formatting toolbar does not dominate blank pages", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New page" }).click();

  await expect(page.getByRole("toolbar", { name: "Text formatting" })).toHaveCount(0);

  const editor = page.getByRole("textbox").last();
  await editor.click();
  await page.keyboard.type("Select me");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");

  await expect(page.getByRole("toolbar", { name: "Text formatting" })).toBeVisible();
});

test("formatting toolbar follows the selected text instead of the editor bottom", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New page" }).click();

  const editor = page.getByRole("textbox").last();
  await editor.click();
  // This case measures selection/formatting. Send each fixture line as one real
  // input event so per-character protocol traffic cannot consume its timeout.
  await page.keyboard.insertText("First toolbar target");

  for (const line of [
    "Second paragraph keeps content below the selection.",
    "Third paragraph keeps the editor taller than the first line.",
    "Fourth paragraph makes a bottom-anchored toolbar obvious.",
    "Fifth paragraph gives the document enough vertical depth.",
    "Sixth paragraph should not influence the selected text toolbar.",
  ]) {
    await page.keyboard.press("Enter");
    await page.keyboard.insertText(line);
  }

  const selectedText = await page.evaluate(() => {
    const paragraph = Array.from(document.querySelectorAll(".ProseMirror p")).find(
      (element) => element.textContent === "First toolbar target",
    );
    const text = paragraph?.firstChild;

    if (!text?.textContent) {
      return null;
    }

    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, text.textContent.length);
    const rect = range.getBoundingClientRect();

    return {
      endX: rect.right + 1,
      height: rect.height,
      startX: rect.left + 2,
      top: rect.top,
      width: rect.width,
      x: rect.left,
      y: rect.top + rect.height / 2,
    };
  });

  expect(selectedText).not.toBeNull();

  await page.mouse.move(selectedText!.startX, selectedText!.y);
  await page.mouse.down();
  await page.mouse.move(selectedText!.endX, selectedText!.y, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("First toolbar target");

  const toolbar = page.getByRole("toolbar", { name: "Text formatting" });
  await expect(toolbar).toBeVisible();

  const toolbarBox = await toolbar.boundingBox();
  expect(toolbarBox).not.toBeNull();
  expect(toolbarBox!.y + toolbarBox!.height).toBeLessThanOrEqual(selectedText!.top - 4);
  expect(
    Math.abs(toolbarBox!.x + toolbarBox!.width / 2 - (selectedText!.x + selectedText!.width / 2)),
  ).toBeLessThan(180);

  await toolbar.getByRole("button", { name: "Bold" }).click();

  await expect(editor.locator("strong")).toHaveText("First toolbar target");
});

test("text selection closes slash commands and only shows the formatting toolbar", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New page" }).click();

  const editor = page.getByRole("textbox").last();
  await editor.click();
  await page.keyboard.type("Selection should own the toolbar");
  await editor.getByText("Selection should own the toolbar").hover();
  await page.getByRole("button", { name: "Add block below" }).click();
  await expect(page.getByRole("menu", { name: "Slash commands" })).toBeVisible();

  const selectedText = await page.evaluate(() => {
    const paragraph = Array.from(document.querySelectorAll(".ProseMirror p")).find(
      (element) => element.textContent === "Selection should own the toolbar",
    );
    const text = paragraph?.firstChild;

    if (!text?.textContent) {
      return null;
    }

    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, text.textContent.length);
    const rect = range.getBoundingClientRect();

    return {
      endX: rect.right - 2,
      startX: rect.left + 2,
      y: rect.top + rect.height / 2,
    };
  });

  expect(selectedText).not.toBeNull();

  await page.mouse.move(selectedText!.startX, selectedText!.y);
  await page.mouse.down();
  await page.mouse.move(selectedText!.endX, selectedText!.y, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByRole("menu", { name: "Slash commands" })).toHaveCount(0);
  await expect(page.getByRole("toolbar", { name: "Text formatting" })).toBeVisible();
});

test("slash commands open from editor input and filter typed query", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New page" }).click();

  const editor = page.getByRole("textbox").last();
  await editor.click();
  await page.keyboard.type("/he");

  const menu = page.getByRole("menu", { name: "Slash commands" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Heading 1" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Heading 2" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Todo list" })).toHaveCount(0);

  await page.keyboard.press("Escape");

  await expect(menu).toHaveCount(0);
});

test("slash command menu closes when clicking outside the editor", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New page" }).click();

  const editor = page.getByRole("textbox").last();
  await editor.click();
  await page.keyboard.type("/");

  await expect(page.getByRole("menu", { name: "Slash commands" })).toBeVisible();

  await page.locator(".folio-demo__topbar").click();

  await expect(page.getByRole("menu", { name: "Slash commands" })).toHaveCount(0);
});

test("slash command selection removes the typed query and applies the block", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New page" }).click();

  const editor = page.getByRole("textbox").last();
  await editor.click();
  await page.keyboard.type("/he");
  await page.getByRole("menuitem", { name: "Heading 1" }).click();

  await expect(page.getByRole("menu", { name: "Slash commands" })).toHaveCount(0);
  await expect(editor.locator("h1")).toHaveCount(1);
  await expect(editor).toHaveText("");
});

test("slash commands stay near the cursor and support editor keyboard selection", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New page" }).click();

  const editor = page.getByRole("textbox").last();
  await editor.click();
  await page.keyboard.type("Line one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Line two");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Line three");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Line four");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/he");

  const menu = page.getByRole("menu", { name: "Slash commands" });
  await expect(menu).toBeVisible();

  const editorBox = await editor.boundingBox();
  const menuBox = await menu.boundingBox();
  expect(editorBox).not.toBeNull();
  expect(menuBox).not.toBeNull();
  expect(menuBox!.y).toBeGreaterThan(editorBox!.y + 120);
  await expect(menu.getByRole("menuitem", { name: "Heading 1" })).toHaveAttribute(
    "aria-current",
    "true",
  );

  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Heading 2" })).toHaveAttribute(
    "aria-current",
    "true",
  );

  await page.keyboard.press("ArrowUp");
  await expect(menu.getByRole("menuitem", { name: "Heading 1" })).toHaveAttribute(
    "aria-current",
    "true",
  );

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("menu", { name: "Slash commands" })).toHaveCount(0);
  await expect(editor.locator("h2")).toHaveCount(1);
  await expect(editor).not.toContainText("/he");
});

test("slash command keyboard navigation scrolls the active item into view", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New page" }).click();

  const editor = page.getByRole("textbox").last();
  await editor.click();
  await page.keyboard.type("/");

  const menu = page.getByRole("menu", { name: "Slash commands" });
  await expect(menu).toBeVisible();

  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("ArrowDown");
  }

  const scrollState = await page.evaluate(() => {
    const menuElement = document.querySelector('[role="menu"][aria-label="Slash commands"]');
    const activeItem = menuElement?.querySelector('[role="menuitem"][data-active="true"]');

    if (!(menuElement instanceof HTMLElement) || !(activeItem instanceof HTMLElement)) {
      return null;
    }

    const menuRect = menuElement.getBoundingClientRect();
    const activeRect = activeItem.getBoundingClientRect();

    return {
      activeBottom: activeRect.bottom,
      activeTop: activeRect.top,
      menuBottom: menuRect.bottom,
      menuScrollTop: menuElement.scrollTop,
      menuTop: menuRect.top,
    };
  });

  expect(scrollState).not.toBeNull();
  expect(scrollState!.menuScrollTop).toBeGreaterThan(0);
  expect(scrollState!.activeTop).toBeGreaterThanOrEqual(scrollState!.menuTop);
  expect(scrollState!.activeBottom).toBeLessThanOrEqual(scrollState!.menuBottom);
});

test("slash menu keeps roving focus keyboard navigation when menu items are focused", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New page" }).click();

  const editor = page.getByRole("textbox").last();
  await editor.click();
  await page.keyboard.type("/he");

  const menu = page.getByRole("menu", { name: "Slash commands" });
  const heading1 = menu.getByRole("menuitem", { name: "Heading 1" });
  const heading2 = menu.getByRole("menuitem", { name: "Heading 2" });

  await heading1.focus();
  await expect(heading1).toBeFocused();

  await page.keyboard.press("ArrowDown");

  await expect(heading2).toBeFocused();
  await expect(heading2).toHaveAttribute("aria-current", "true");

  await page.keyboard.press("Escape");

  await expect(menu).toHaveCount(0);
});

test("block side controls appear on block focus or hover and open the command menu", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New page" }).click();

  await expect(page.getByRole("button", { name: "Add block below" })).toHaveCount(0);

  const editor = page.getByRole("textbox").last();
  await editor.click();
  await page.keyboard.type("A block with controls");

  await expect(page.getByRole("button", { name: "Add block below" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Drag block" })).toBeVisible();

  await editor.getByText("A block with controls").hover();

  await expect(page.getByRole("button", { name: "Add block below" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Drag block" })).toBeVisible();

  await page.getByRole("button", { name: "Add block below" }).click();

  await expect(page.getByRole("menu", { name: "Slash commands" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Text/ })).toBeVisible();
});

test("block command menu closes when clicking another editor line", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New page" }).click();

  const editor = page.getByRole("textbox").last();
  await editor.click();
  await page.keyboard.type("First command block");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second command block");

  await editor.getByText("First command block").hover();
  await page.getByRole("button", { name: "Add block below" }).click();
  await expect(page.getByRole("menu", { name: "Slash commands" })).toBeVisible();

  await editor.getByText("Second command block").click();

  await expect(page.getByRole("menu", { name: "Slash commands" })).toHaveCount(0);
});

test("block side controls remain reachable from editor keyboard focus", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New page" }).click();

  const editor = page.getByRole("textbox").last();
  await editor.click();
  await page.keyboard.type("Keyboard block");

  await expect(page.getByRole("button", { name: "Add block below" })).toBeVisible();

  await page.keyboard.press("Tab");

  await expect(page.getByRole("button", { name: "Add block below" })).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(page.getByRole("menu", { name: "Slash commands" })).toBeVisible();
});

test("block side controls stay visible when hovering their icons", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New page" }).click();

  const editor = page.getByRole("textbox").last();
  await editor.click();
  await page.keyboard.type("Hover controls");
  await page.locator(".folio-demo__topbar").click();

  await editor.getByText("Hover controls").hover();
  await expect(page.getByRole("button", { name: "Add block below" })).toBeVisible();

  await page.getByRole("button", { name: "Add block below" }).hover();
  await expect(page.getByRole("button", { name: "Add block below" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Drag block" })).toBeVisible();

  await page.getByRole("button", { name: "Drag block" }).hover();
  await expect(page.getByRole("button", { name: "Add block below" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Drag block" })).toBeVisible();
});

test("block side controls keep a clear gap before the first line content", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New page" }).click();

  const editor = page.getByRole("textbox").last();
  await editor.click();
  await page.keyboard.type("Spacing block");

  await editor.getByText("Spacing block").hover();

  const contentGap = await page.evaluate(() => {
    const controls = document.querySelector(".folio-block-side-controls");
    const block = Array.from(document.querySelectorAll(".ProseMirror p")).find((element) =>
      element.textContent?.includes("Spacing block"),
    );

    if (!(controls instanceof HTMLElement) || !(block instanceof HTMLElement)) {
      return Number.NEGATIVE_INFINITY;
    }

    const range = document.createRange();

    range.selectNodeContents(block.firstChild ?? block);

    const firstLineRect = range.getClientRects()[0] ?? block.getBoundingClientRect();
    const controlsRect = controls.getBoundingClientRect();

    range.detach();

    return firstLineRect.left - controlsRect.right;
  });

  expect(contentGap).toBeGreaterThanOrEqual(8);
  expect(contentGap).toBeLessThanOrEqual(16);
});

test("block side controls stay visible while crossing the content gap", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New page" }).click();

  const editor = page.getByRole("textbox").last();
  await editor.click();
  await page.keyboard.type("Bridge hover block");
  await page.locator(".folio-demo__topbar").click();

  await editor.getByText("Bridge hover block").hover();

  const hoverBridge = await page.evaluate(() => {
    const controls = document.querySelector(".folio-block-side-controls");
    const block = Array.from(document.querySelectorAll(".ProseMirror p")).find((element) =>
      element.textContent?.includes("Bridge hover block"),
    );

    if (!(controls instanceof HTMLElement) || !(block instanceof HTMLElement)) {
      return null;
    }

    const controlsRect = controls.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();

    return {
      x: (controlsRect.right + blockRect.left) / 2,
      y: blockRect.top + blockRect.height / 2,
    };
  });

  expect(hoverBridge).not.toBeNull();

  await page.mouse.move(hoverBridge!.x, hoverBridge!.y);
  await expect(page.getByRole("button", { name: "Add block below" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Drag block" })).toBeVisible();

  await page.getByRole("button", { name: "Drag block" }).hover();
  await expect(page.getByRole("button", { name: "Add block below" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Drag block" })).toBeVisible();
});

test("block side controls insert below the hovered block without converting it", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New page" }).click();

  const editor = page.getByRole("textbox").last();
  await editor.click();
  await page.keyboard.type("First block");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second block");

  await editor.getByText("First block").click();
  await editor.getByText("Second block").hover();
  await page.getByRole("button", { name: "Add block below" }).click();
  await page.getByRole("menuitem", { name: "Heading 1" }).click();

  await expect(editor.locator("h1")).toHaveText("");
  await expect(editor.locator("p", { hasText: "First block" })).toBeVisible();
  await expect(editor.locator("p", { hasText: "Second block" })).toBeVisible();
  await page.keyboard.type("Third block");
  await expect(editor.locator("h1")).toHaveText("Third block");
});

test("drag handle reorders top-level blocks", async ({ page }) => {
  const paragraphs = ["First drag block", "Second drag block", "Third drag block"];
  const editor = await openDragDocument(page, paragraphs);
  const source = editor.getByText(paragraphs[0], { exact: true });
  const { dataTransfer, handle, handleBox } = await beginBlockDrag(page, source);
  const dragSource = page.locator('[data-folio-drag-source="true"]');
  await expect(dragSource).toHaveText(paragraphs[0]);
  const preview = page.locator(".folio-block-drag-preview");
  await expect(preview).toBeAttached();
  await expect(preview).toHaveText(paragraphs[0]);

  // Moving across other blocks must not retarget the source handle mid-drag.
  const secondBlock = editor.getByText("Second drag block");
  await secondBlock.hover();
  const secondBlockBox = await secondBlock.boundingBox();
  expect(secondBlockBox).not.toBeNull();
  const nextHandleBox = await handle.boundingBox();
  expect(nextHandleBox).not.toBeNull();
  expect(nextHandleBox!.x).toBeCloseTo(handleBox.x, 0);
  expect(nextHandleBox!.y).toBeCloseTo(handleBox.y, 0);
  await expect(dragSource).toHaveText(paragraphs[0]);
  const dropPoint = {
    clientX: secondBlockBox!.x + secondBlockBox!.width / 2,
    clientY: secondBlockBox!.y + secondBlockBox!.height - 1,
    dataTransfer,
  };
  await secondBlock.dispatchEvent("dragover", dropPoint);
  const indicator = page.locator(".folio-block-drop-indicator");
  await expect(indicator).toBeVisible();
  await expect(indicator).toHaveAttribute("aria-hidden", "true");
  const indicatorBox = await indicator.boundingBox();
  expect(indicatorBox).not.toBeNull();
  expect(Math.abs(indicatorBox!.x - secondBlockBox!.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(indicatorBox!.width - secondBlockBox!.width)).toBeLessThanOrEqual(2);
  const indicatorColor = await indicator.evaluate((element) =>
    getComputedStyle(element)
      .backgroundColor.match(/[\d.]+/g)
      ?.map(Number),
  );
  expect(indicatorColor).toBeDefined();
  expect(indicatorColor![2]).toBeGreaterThan(indicatorColor![0]);
  await secondBlock.dispatchEvent("drop", dropPoint);
  await handle.dispatchEvent("dragend", { dataTransfer });
  await dataTransfer.dispose();

  await expect(editor.locator(":scope > p")).toHaveText([
    paragraphs[1],
    paragraphs[0],
    paragraphs[2],
  ]);
  await expect(indicator).toBeHidden();
  await expect(dragSource).toHaveCount(0);
  await expect(preview).toHaveCount(0);
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Z" : "Control+Z");
  await expect(editor.locator(":scope > p")).toHaveText(paragraphs);
});

test("block dragging accepts paragraph gaps and document edge targets", async ({ page }) => {
  const paragraphs = ["First boundary block", "Second boundary block", "Third boundary block"];
  const editor = await openDragDocument(page, paragraphs);
  const surface = page.getByTestId("folio-editor");

  const gapDrag = await beginBlockDrag(page, editor.getByText(paragraphs[0], { exact: true }));
  const secondBox = await editor.getByText(paragraphs[1], { exact: true }).boundingBox();
  const thirdBox = await editor.getByText(paragraphs[2], { exact: true }).boundingBox();
  expect(secondBox).not.toBeNull();
  expect(thirdBox).not.toBeNull();
  expect(thirdBox!.y).toBeGreaterThan(secondBox!.y + secondBox!.height);
  const gapPoint = {
    clientX: secondBox!.x + secondBox!.width / 2,
    clientY: (secondBox!.y + secondBox!.height + thirdBox!.y) / 2,
    dataTransfer: gapDrag.dataTransfer,
  };
  await surface.dispatchEvent("dragover", gapPoint);
  await expect(page.locator(".folio-block-drop-indicator")).toBeVisible();
  const gapIndicator = await page.locator(".folio-block-drop-indicator").boundingBox();
  expect(gapIndicator).not.toBeNull();
  expect(
    Math.abs(gapIndicator!.y + gapIndicator!.height / 2 - gapPoint.clientY),
  ).toBeLessThanOrEqual(2);
  await surface.dispatchEvent("drop", gapPoint);
  await gapDrag.handle.dispatchEvent("dragend", { dataTransfer: gapDrag.dataTransfer });
  await gapDrag.dataTransfer.dispose();
  await expect(editor.locator(":scope > p")).toHaveText([
    paragraphs[1],
    paragraphs[0],
    paragraphs[2],
  ]);

  const firstDrag = await beginBlockDrag(page, editor.getByText(paragraphs[2], { exact: true }));
  const firstBox = await editor.locator(":scope > p").first().boundingBox();
  expect(firstBox).not.toBeNull();
  const firstPoint = {
    clientX: firstBox!.x + firstBox!.width / 2,
    clientY: firstBox!.y - 8,
    dataTransfer: firstDrag.dataTransfer,
  };
  await surface.dispatchEvent("dragover", firstPoint);
  await expect(page.locator(".folio-block-drop-indicator")).toBeVisible();
  await surface.dispatchEvent("drop", firstPoint);
  await firstDrag.handle.dispatchEvent("dragend", { dataTransfer: firstDrag.dataTransfer });
  await firstDrag.dataTransfer.dispose();
  await expect(editor.locator(":scope > p")).toHaveText([
    paragraphs[2],
    paragraphs[1],
    paragraphs[0],
  ]);

  const lastDrag = await beginBlockDrag(page, editor.getByText(paragraphs[2], { exact: true }));
  const lastBox = await editor.locator(":scope > p").last().boundingBox();
  expect(lastBox).not.toBeNull();
  const lastPoint = {
    clientX: lastBox!.x + lastBox!.width / 2,
    clientY: lastBox!.y + lastBox!.height + 16,
    dataTransfer: lastDrag.dataTransfer,
  };
  await editor.dispatchEvent("dragover", lastPoint);
  await expect(page.locator(".folio-block-drop-indicator")).toBeVisible();
  await editor.dispatchEvent("drop", lastPoint);
  await lastDrag.handle.dispatchEvent("dragend", { dataTransfer: lastDrag.dataTransfer });
  await lastDrag.dataTransfer.dispose();
  await expect(editor.locator(":scope > p")).toHaveText([
    paragraphs[1],
    paragraphs[0],
    paragraphs[2],
  ]);
});

test("Escape cancels block dragging and ignores the remaining native drop", async ({ page }) => {
  const paragraphs = ["Keep first block", "Keep second block", "Keep third block"];
  const editor = await openDragDocument(page, paragraphs);
  const drag = await beginBlockDrag(page, editor.getByText(paragraphs[0], { exact: true }));
  const lastBox = await editor.locator(":scope > p").last().boundingBox();
  expect(lastBox).not.toBeNull();
  const dropPoint = {
    clientX: lastBox!.x + lastBox!.width / 2,
    clientY: lastBox!.y + lastBox!.height - 1,
    dataTransfer: drag.dataTransfer,
  };
  await editor.dispatchEvent("dragover", dropPoint);
  await expect(page.locator(".folio-block-drop-indicator")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".folio-block-drop-indicator")).toBeHidden();
  await expect(page.locator('[data-folio-drag-source="true"]')).toHaveCount(0);
  await expect(page.locator(".folio-block-drag-preview")).toHaveCount(0);
  await editor.dispatchEvent("dragover", dropPoint);
  await editor.dispatchEvent("drop", dropPoint);
  await drag.handle.dispatchEvent("dragend", { dataTransfer: drag.dataTransfer });
  await drag.dataTransfer.dispose();
  await expect(editor.locator(":scope > p")).toHaveText(paragraphs);

  const nextDrag = await beginBlockDrag(page, editor.getByText(paragraphs[0], { exact: true }));
  await editor.dispatchEvent("dragover", { ...dropPoint, dataTransfer: nextDrag.dataTransfer });
  await editor.dispatchEvent("drop", { ...dropPoint, dataTransfer: nextDrag.dataTransfer });
  await nextDrag.handle.dispatchEvent("dragend", { dataTransfer: nextDrag.dataTransfer });
  await nextDrag.dataTransfer.dispose();
  await expect(editor.locator(":scope > p")).toHaveText([
    paragraphs[1],
    paragraphs[2],
    paragraphs[0],
  ]);
});

test("block dragging auto-scrolls the viewport in both directions and stops on dragend", async ({
  page,
}) => {
  const paragraphs = Array.from(
    { length: 48 },
    (_, index) => `Viewport drag paragraph ${index + 1}`,
  );
  const editor = await openDragDocument(page, paragraphs);
  await page.evaluate(() => window.scrollTo(0, 0));
  const drag = await beginBlockDrag(page, editor.getByText(paragraphs[0], { exact: true }));
  const editorBox = await editor.boundingBox();
  expect(editorBox).not.toBeNull();
  const viewport = page.viewportSize()!;
  const clientX = editorBox!.x + editorBox!.width / 2;
  await editor.dispatchEvent("dragover", {
    clientX,
    clientY: viewport.height - 3,
    dataTransfer: drag.dataTransfer,
  });
  // Move the document's top above the viewport before targeting its upper edge;
  // otherwise that point legitimately belongs to the page toolbar, not the editor.
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(editorBox!.y + 120);
  const downScroll = await page.evaluate(() => window.scrollY);
  await editor.dispatchEvent("dragover", { clientX, clientY: 3, dataTransfer: drag.dataTransfer });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(downScroll - 40);
  await drag.handle.dispatchEvent("dragend", { dataTransfer: drag.dataTransfer });
  const stoppedScroll = await page.evaluate(() => window.scrollY);
  expect(await scrollAfterAnimationFrames(page)).toBe(stoppedScroll);
  await drag.dataTransfer.dispose();
  await expect(editor.locator(":scope > p")).toHaveText(paragraphs);
  await expect(page.locator(".folio-block-drop-indicator")).toBeHidden();
});

test("block dragging auto-scrolls a nested editor container without scrolling the page", async ({
  page,
}) => {
  const paragraphs = Array.from({ length: 48 }, (_, index) => `Nested drag paragraph ${index + 1}`);
  await page.setViewportSize({ width: 1100, height: 950 });
  const editor = await openDragDocument(page, paragraphs);
  const scrollSelector = ".folio-demo__editor-frame";
  const scrollContainer = page.locator(scrollSelector);
  await scrollContainer.evaluate((element) => {
    Object.assign((element as HTMLElement).style, {
      height: "340px",
      maxHeight: "340px",
      overflow: "auto",
      overscrollBehavior: "contain",
    });
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  const drag = await beginBlockDrag(page, editor.getByText(paragraphs[0], { exact: true }));
  const scrollBox = await scrollContainer.boundingBox();
  expect(scrollBox).not.toBeNull();
  const pageScroll = await page.evaluate(() => window.scrollY);
  await editor.dispatchEvent("dragover", {
    clientX: scrollBox!.x + scrollBox!.width / 2,
    clientY: scrollBox!.y + scrollBox!.height - 3,
    dataTransfer: drag.dataTransfer,
  });
  await expect
    .poll(() => scrollContainer.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(120);
  expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll);
  await drag.handle.dispatchEvent("dragend", { dataTransfer: drag.dataTransfer });
  const stoppedScroll = await scrollContainer.evaluate((element) => element.scrollTop);
  expect(await scrollAfterAnimationFrames(page, scrollSelector)).toBe(stoppedScroll);
  await drag.dataTransfer.dispose();
  await expect(editor.locator(":scope > p")).toHaveText(paragraphs);
  await expect(page.locator(".folio-block-drag-preview")).toHaveCount(0);
});

test("block side controls are vertically centered on the first line", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New page" }).click();

  const editor = page.getByRole("textbox").last();
  await editor.click();
  await page.keyboard.type(
    "This is a very long block that wraps onto multiple visual lines in the editor so the side controls must align with the first visible line instead of the entire paragraph height. ".repeat(
      3,
    ),
  );

  const centerDelta = await page.evaluate(() => {
    const controls = document.querySelector(".folio-block-side-controls");
    const block = document.querySelector(".ProseMirror p");

    if (!(controls instanceof HTMLElement) || !(block instanceof HTMLElement)) {
      return Number.POSITIVE_INFINITY;
    }

    const controlsRect = controls.getBoundingClientRect();
    const textWalker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const firstText = textWalker.nextNode();
    let firstLineRect = block.getBoundingClientRect();

    if (firstText) {
      const range = document.createRange();

      range.selectNodeContents(firstText);
      firstLineRect = range.getClientRects()[0] ?? firstLineRect;
      range.detach();
    }

    const controlsCenter = controlsRect.top + controlsRect.height / 2;
    const blockCenter = firstLineRect.top + firstLineRect.height / 2;

    return Math.abs(controlsCenter - blockCenter);
  });

  expect(centerDelta).toBeLessThanOrEqual(1);
});

test("toggle command renders without native button chrome", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New page" }).click();

  const editor = page.getByRole("textbox").last();
  await editor.click();
  await page.keyboard.type("/toggle");
  await page.getByRole("menuitem", { name: "Toggle" }).click();

  const toggleStyles = await page.evaluate(() => {
    const button = document.querySelector('.ProseMirror [data-type="details"] > button');

    if (!(button instanceof HTMLElement)) return null;

    const styles = getComputedStyle(button);

    return {
      appearance: styles.appearance,
      backgroundColor: styles.backgroundColor,
      borderStyle: styles.borderStyle,
      borderWidth: styles.borderWidth,
      display: styles.display,
    };
  });

  expect(toggleStyles).toMatchObject({
    appearance: "none",
    backgroundColor: "rgba(0, 0, 0, 0)",
    borderStyle: "none",
    borderWidth: "0px",
    display: "flex",
  });
});

test("toggle disclosure button is centered on the summary first line", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New page" }).click();

  const editor = page.getByRole("textbox").last();
  await editor.click();
  await page.keyboard.type("/toggle");
  await page.getByRole("menuitem", { name: "Toggle" }).click();

  const summary = page.locator('.ProseMirror [data-type="details"] summary');

  await summary.click();
  await page.keyboard.type("Toggle title");
  await expect(summary).toContainText(/\S/);

  const centerDelta = await page.evaluate(() => {
    const button = document.querySelector('.ProseMirror [data-type="details"] > button');
    const summary = document.querySelector('.ProseMirror [data-type="details"] summary');

    if (!(button instanceof HTMLElement) || !(summary instanceof HTMLElement)) {
      return Number.POSITIVE_INFINITY;
    }

    const textWalker = document.createTreeWalker(summary, NodeFilter.SHOW_TEXT);
    const firstText = textWalker.nextNode();

    if (!firstText?.textContent?.trim()) return Number.POSITIVE_INFINITY;

    const range = document.createRange();

    range.selectNodeContents(firstText);
    const firstLineRect = range.getClientRects()[0] ?? summary.getBoundingClientRect();
    range.detach();

    const buttonRect = button.getBoundingClientRect();
    const buttonCenter = buttonRect.top + buttonRect.height / 2;
    const summaryCenter = firstLineRect.top + firstLineRect.height / 2;

    return Math.abs(buttonCenter - summaryCenter);
  });

  expect(centerDelta).toBeLessThanOrEqual(1);
});

test("table controls add rows and columns in place", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New page" }).click();

  const editor = page.getByRole("textbox").last();
  await editor.click();
  await page.keyboard.type("/table");
  await page.getByRole("menuitem", { exact: true, name: "Table" }).click();
  await page.locator(".folio-demo__topbar").click();

  const table = editor.locator("table");
  await expect(table).toBeVisible();
  await table.hover();

  await expect(page.getByRole("button", { name: "Add table row" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add table column" })).toBeVisible();

  const initialShape = await page.evaluate(() => {
    const tableElement = document.querySelector(".ProseMirror table");

    return {
      cols: tableElement?.querySelector("tr")?.children.length ?? 0,
      rows: tableElement?.querySelectorAll("tr").length ?? 0,
    };
  });

  await page.getByRole("button", { name: "Add table row" }).click();
  await page.getByRole("button", { name: "Add table column" }).click();

  const nextShape = await page.evaluate(() => {
    const tableElement = document.querySelector(".ProseMirror table");

    return {
      cols: tableElement?.querySelector("tr")?.children.length ?? 0,
      rows: tableElement?.querySelectorAll("tr").length ?? 0,
    };
  });

  expect(nextShape.rows).toBe(initialShape.rows + 1);
  expect(nextShape.cols).toBe(initialShape.cols + 1);
});

test("table controls stay visible when hovering add buttons", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New page" }).click();

  const editor = page.getByRole("textbox").last();
  await editor.click();
  await page.keyboard.type("/table");
  await page.getByRole("menuitem", { exact: true, name: "Table" }).click();
  await page.locator(".folio-demo__topbar").click();

  const table = editor.locator("table");
  await expect(table).toBeVisible();
  await table.hover();

  const columnButton = page.getByRole("button", { name: "Add table column" });
  const rowButton = page.getByRole("button", { name: "Add table row" });

  await expect(columnButton).toBeVisible();
  await expect(rowButton).toBeVisible();

  const tableBox = await table.boundingBox();
  const columnBox = await columnButton.boundingBox();
  const rowBox = await rowButton.boundingBox();

  expect(tableBox).not.toBeNull();
  expect(columnBox).not.toBeNull();
  expect(rowBox).not.toBeNull();

  await page.mouse.move(tableBox!.x + tableBox!.width - 2, columnBox!.y + columnBox!.height / 2);
  await page.mouse.move(
    (tableBox!.x + tableBox!.width + columnBox!.x) / 2,
    columnBox!.y + columnBox!.height / 2,
  );
  await expect(columnButton).toBeVisible();
  await expect(rowButton).toBeVisible();

  await page.mouse.move(columnBox!.x + columnBox!.width / 2, columnBox!.y + columnBox!.height / 2);
  await page.mouse.move(rowBox!.x + rowBox!.width / 2, tableBox!.y + tableBox!.height - 2);
  await page.mouse.move(
    rowBox!.x + rowBox!.width / 2,
    (tableBox!.y + tableBox!.height + rowBox!.y) / 2,
  );
  await expect(columnButton).toBeVisible();
  await expect(rowButton).toBeVisible();
});
