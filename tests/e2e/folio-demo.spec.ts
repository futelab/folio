import { expect, test } from "@playwright/test";

test("demo presents a complete Notion-like editing workspace", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("folio-demo")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Pages" })).toBeVisible();
  await expect(page.getByRole("main", { name: "Editor" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Preview" })).toBeVisible();
  await expect(page.getByTestId("folio-editor")).toBeVisible();
  await expect(page.getByTestId("folio-reader")).toBeVisible();
  await expect(page.getByRole("menu", { name: "Slash commands" })).toBeVisible();
  await expect(page.getByText("Saved locally")).toBeVisible();
});
