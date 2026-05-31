import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

test("demo presents a complete Notion-like editing workspace", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("folio-demo")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Pages" })).toBeVisible();
  await expect(page.getByRole("main", { name: "Editor" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Preview" })).toBeVisible();
  await expect(page.getByTestId("folio-editor")).toBeVisible();
  await expect(page.getByTestId("folio-reader")).toBeVisible();
  await expect(page.getByRole("menu", { name: "Slash commands" })).toHaveCount(0);
  await expect(page.getByText("Saved locally")).toBeVisible();
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
