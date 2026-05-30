import { expect, type Page, test } from "@playwright/test";

const story = (page: Page) => page.frameLocator("#storybook-preview-iframe");

test("slash menu renders Notion-like command list", async ({ page }) => {
  await page.goto("/?path=/story/folio-editor--with-slash-menu");

  const preview = story(page);

  await expect(
    preview.getByRole("menu", { name: "Slash commands" }),
  ).toBeVisible();
  await expect(
    preview.getByRole("menuitem", { name: "Heading 1" }),
  ).toBeVisible();
  await expect(
    preview.getByRole("menuitem", { name: "Callout" }),
  ).toBeVisible();
});

test("reader renders document content without editor controls", async ({ page }) => {
  await page.goto("/?path=/story/folio-reader--basic");

  const preview = story(page);

  await expect(preview.getByTestId("folio-reader")).toBeVisible();
  await expect(preview.getByText("Folio document")).toBeVisible();
  await expect(preview.getByTestId("folio-editor")).toHaveCount(0);
});
