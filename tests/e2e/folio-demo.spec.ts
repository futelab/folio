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
  await page.keyboard.type("Toggle title");

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
