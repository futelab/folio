import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New page" }).click();
});

test("media dialogs validate URLs, save captions, and edit existing images", async ({ page }) => {
  await page.route("**/editor-image.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="#dce8f4"/></svg>',
    }),
  );
  const actions = page.getByRole("toolbar", { name: "Document actions" });
  await actions.getByRole("button", { name: "Image", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Image", exact: true });
  await dialog.getByLabel("URL", { exact: true }).fill("javascript:alert(1)");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByLabel("URL", { exact: true }).fill("/editor-image.svg");
  await dialog.getByLabel("Alternative text").fill("Diagram");
  await dialog.getByLabel("Caption", { exact: true }).fill("First caption");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const image = page.locator(".ProseMirror img");
  await expect(image).toHaveAttribute("alt", "Diagram");
  await expect(page.locator(".ProseMirror figcaption")).toHaveText("First caption");
  await page.locator(".ProseMirror [data-folio-image]").hover();
  await actions.getByRole("button", { name: "Edit selected media" }).click();
  await page.getByRole("dialog").getByLabel("Caption", { exact: true }).fill("Revised caption");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(image).toHaveCount(1);
  await expect(page.locator(".ProseMirror figcaption")).toHaveText("Revised caption");
});

test("block insertion and keyboard movement preserve existing content", async ({ page }) => {
  const editor = page.locator(".ProseMirror");
  await editor.fill("Original paragraph");
  await page
    .getByRole("toolbar", { name: "Document actions" })
    .getByRole("button", { name: "Insert block", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Heading 1", exact: true }).click();
  await page.keyboard.type("New heading");
  await expect(editor.locator("p").first()).toHaveText("Original paragraph");
  await expect(editor.locator("h1")).toHaveText("New heading");
  await page.keyboard.press("Alt+Shift+ArrowUp");
  await expect(editor.locator(":scope > :first-child")).toHaveText("New heading");
});

test("table edge controls append after populated rows and columns", async ({ page }) => {
  const editor = page.locator(".ProseMirror");
  await editor.fill("/table");
  await page.getByRole("menuitem", { name: "Table", exact: true }).click();
  const table = editor.locator("table");
  const rows = table.locator("tr");
  await rows.nth(0).locator("th,td").nth(0).locator("p").fill("H1");
  await rows.nth(1).locator("th,td").nth(0).locator("p").fill("A1");
  await rows.nth(2).locator("th,td").nth(0).locator("p").fill("B1");
  await table.hover();
  await page.getByRole("button", { name: "Add table row", exact: true }).click();
  await page.getByRole("button", { name: "Add table column", exact: true }).click();
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(1).locator("th,td").first()).toHaveText("A1");
  await expect(rows.nth(2).locator("th,td").first()).toHaveText("B1");
  await expect(rows.nth(3).locator("th,td")).toHaveCount(4);
  await expect(rows.nth(3)).toHaveText("");
  await rows.nth(2).locator("td").first().click();
  await page.getByRole("button", { name: "Delete row", exact: true }).click();
  await expect(rows).toHaveCount(3);
  await expect(table).not.toContainText("B1");
  await page.getByRole("button", { name: "Delete table", exact: true }).click();
  await expect(table).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add table row", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add table column", exact: true })).toHaveCount(0);
});

test("composition Enter does not execute the active slash command", async ({ page }) => {
  const editor = page.locator(".ProseMirror");
  await editor.fill("/heading");
  await expect(page.getByRole("menu")).toBeVisible();
  await editor.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true });
  await expect(editor.locator("h1")).toHaveCount(0);
  await expect(editor).toContainText("/heading");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
});
