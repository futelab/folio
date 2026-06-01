import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

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
  await expect(page.getByText("Type '/' for commands")).toBeVisible();

  const editor = page.getByTestId("folio-editor");
  await expect(editor).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
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
  await page.keyboard.type("First toolbar target");

  for (const line of [
    "Second paragraph keeps content below the selection.",
    "Third paragraph keeps the editor taller than the first line.",
    "Fourth paragraph makes a bottom-anchored toolbar obvious.",
    "Fifth paragraph gives the document enough vertical depth.",
    "Sixth paragraph should not influence the selected text toolbar.",
  ]) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(line);
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
      endX: rect.right - 2,
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

  const toolbar = page.getByRole("toolbar", { name: "Text formatting" });
  await expect(toolbar).toBeVisible();

  const toolbarBox = await toolbar.boundingBox();
  expect(toolbarBox).not.toBeNull();
  expect(toolbarBox!.y + toolbarBox!.height).toBeLessThanOrEqual(
    selectedText!.top - 4,
  );
  expect(
    Math.abs(
      toolbarBox!.x +
        toolbarBox!.width / 2 -
        (selectedText!.x + selectedText!.width / 2),
    ),
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

test("slash command menu closes when clicking outside the editor", async ({
  page,
}) => {
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

test("slash commands stay near the cursor and support editor keyboard selection", async ({ page }) => {
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
    "aria-selected",
    "true",
  );

  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Heading 2" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.keyboard.press("ArrowUp");
  await expect(menu.getByRole("menuitem", { name: "Heading 1" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("menu", { name: "Slash commands" })).toHaveCount(0);
  await expect(editor.locator("h2")).toHaveCount(1);
  await expect(editor).not.toContainText("/he");
});

test("slash command keyboard navigation scrolls the active item into view", async ({
  page,
}) => {
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
  await expect(heading2).toHaveAttribute("aria-selected", "true");

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

test("block command menu closes when clicking another editor line", async ({
  page,
}) => {
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

test("block side controls remain reachable from editor keyboard focus", async ({
  page,
}) => {
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

test("block side controls stay visible when hovering their icons", async ({
  page,
}) => {
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

test("block side controls keep a clear gap before the first line content", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New page" }).click();

  const editor = page.getByRole("textbox").last();
  await editor.click();
  await page.keyboard.type("Spacing block");

  await editor.getByText("Spacing block").hover();

  const contentGap = await page.evaluate(() => {
    const controls = document.querySelector(".folio-block-side-controls");
    const block = Array.from(document.querySelectorAll(".ProseMirror p")).find(
      (element) => element.textContent?.includes("Spacing block"),
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

test("block side controls stay visible while crossing the content gap", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New page" }).click();

  const editor = page.getByRole("textbox").last();
  await editor.click();
  await page.keyboard.type("Bridge hover block");
  await page.locator(".folio-demo__topbar").click();

  await editor.getByText("Bridge hover block").hover();

  const hoverBridge = await page.evaluate(() => {
    const controls = document.querySelector(".folio-block-side-controls");
    const block = Array.from(document.querySelectorAll(".ProseMirror p")).find(
      (element) => element.textContent?.includes("Bridge hover block"),
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

test("block side controls target the hovered block when opening commands", async ({
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

  await expect(editor.locator("h1")).toHaveText("Second block");
  await expect(editor.locator("p", { hasText: "First block" })).toBeVisible();
});

test("block side controls are vertically centered on the first line", async ({
  page,
}) => {
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
    const button = document.querySelector(
      '.ProseMirror [data-type="details"] > button',
    );

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

test("toggle disclosure button is centered on the summary first line", async ({
  page,
}) => {
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
    const button = document.querySelector(
      '.ProseMirror [data-type="details"] > button',
    );
    const summary = document.querySelector(
      '.ProseMirror [data-type="details"] summary',
    );

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
