import { readFile } from "node:fs/promises";
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

for (const captioned of [true, false]) {
  test(`${captioned ? "captioned" : "uncaptioned"} image controls follow the visual top through loading, resize, and portals`, async ({
    page,
    isMobile,
  }) => {
    let releaseImage = () => {};
    const pendingImage = new Promise<void>((resolve) => {
      releaseImage = resolve;
    });
    await page.route("**/anchor-image.svg", async (route) => {
      await pendingImage;
      await route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#dce8f4"/></svg>',
      });
    });
    await page.route("**/missing-anchor-image.png", (route) =>
      route.fulfill({ status: 404, body: "" }),
    );
    const editor = page.getByTestId("folio-editor").locator(".ProseMirror");
    const image = editor.locator("img").first();
    const blocks = editor.locator(captioned ? ":scope > figure[data-folio-image]" : ":scope > img");
    const controls = page.getByTestId("folio-block-side-controls");
    const grip = controls.getByRole("button", { name: "Drag block", exact: true });
    const caption = "Image description stays attached";
    async function importImage(src: string, alt = "Anchor illustration") {
      await page.getByLabel("Import document file", { exact: true }).setInputFiles({
        name: "image-anchor.json",
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({
            type: "doc",
            content: [
              {
                type: "image",
                attrs: { src, alt, caption: captioned ? caption : null },
              },
              { type: "paragraph", content: [{ type: "text", text: "After illustration" }] },
            ],
          }),
        ),
      });
      await expect(blocks).toHaveCount(1);
      await expect(image).toHaveAttribute("src", src);
    }
    async function frame() {
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      );
    }
    async function expectTopAnchor(traverse = false) {
      const figureFallback = captioned && (await image.boundingBox())!.height <= 0;
      await (figureFallback ? blocks.first() : image).evaluate((element) =>
        element.scrollIntoView({ block: "center" }),
      );
      await frame();
      const visual = (await image.boundingBox())!;
      const anchor = figureFallback ? (await blocks.first().boundingBox())! : visual;
      const y = anchor.y + Math.min(24, anchor.height) / 2;
      if (figureFallback) {
        if (isMobile) await blocks.first().locator("figcaption").tap();
        else await blocks.first().locator("figcaption").hover();
      } else if (isMobile)
        await image.tap({
          position: { x: Math.min(20, visual.width / 2), y: Math.min(12, visual.height / 2) },
        });
      else await page.mouse.move(anchor.x + anchor.width / 2, y);
      await expect(
        grip,
        JSON.stringify(
          await image.evaluate((element: HTMLImageElement) => ({
            complete: element.complete,
            width: element.getBoundingClientRect().width,
            height: element.getBoundingClientRect().height,
          })),
        ),
      ).toBeVisible();
      await frame();
      let box = (await grip.boundingBox())!;
      expect(Math.abs(box.y + box.height / 2 - y)).toBeLessThanOrEqual(1);
      if (captioned) {
        const description = blocks.first().locator("figcaption");
        if (isMobile) await description.tap();
        else await description.hover();
        await frame();
        box = (await grip.boundingBox())!;
        const currentVisual = (await image.boundingBox())!;
        const currentAnchor =
          currentVisual.height <= 0 ? (await blocks.first().boundingBox())! : currentVisual;
        expect(
          Math.abs(
            box.y + box.height / 2 - currentAnchor.y - Math.min(24, currentAnchor.height) / 2,
          ),
        ).toBeLessThanOrEqual(1);
      }
      if (traverse && !isMobile) {
        const visual = figureFallback
          ? (await blocks.first().boundingBox())!
          : (await image.boundingBox())!;
        const y = box.y + box.height / 2;
        for (const x of [
          visual.x + 1,
          visual.x - 2,
          visual.x - 4,
          visual.x - 6,
          box.x + box.width / 2,
        ]) {
          await page.mouse.move(x, y);
          await frame();
          const next = (await grip.boundingBox())!;
          expect(Math.abs(next.x - box.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(next.y - box.y)).toBeLessThanOrEqual(1);
        }
      }
      return box;
    }
    try {
      await importImage("/anchor-image.svg", "");
      expect(await image.evaluate((element: HTMLImageElement) => element.complete)).toBe(false);
      expect((await image.boundingBox())!.height).toBe(0);
      // A visible caption keeps the image atom operable before it has dimensions.
      if (captioned) await expectTopAnchor();
      else await expect(grip).not.toBeVisible();
      // An unresolved image has no browser layout until intrinsic dimensions or
      // a host placeholder reserve space. Give this loading fixture visible room
      // without fixing its eventual natural size or responsive dimensions.
      await image.evaluate((element) => {
        element.style.minWidth = "32px";
        element.style.minHeight = "32px";
      });
      await expectTopAnchor();
      releaseImage();
      await expect
        .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
        .toBe(640);
      await expectTopAnchor();
      const loadedHeight = (await image.boundingBox())!.height;
      const viewport = page.viewportSize()!;
      await page.setViewportSize({ width: isMobile ? 340 : 850, height: viewport.height });
      await expect
        .poll(async () => Math.abs((await image.boundingBox())!.height - loadedHeight))
        .toBeGreaterThan(5);
      await expectTopAnchor();

      for (const portal of [false, true]) {
        if (portal) {
          await page.getByText("Feature laboratory", { exact: true }).click();
          await page.getByLabel("Mount floating UI outside the editor", { exact: true }).check();
        }
        let box = await expectTopAnchor(true);
        if (isMobile) await grip.tap();
        else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.getByRole("menuitem", { name: "Duplicate blocks", exact: true }).click();
        await expect(blocks).toHaveCount(2);
        if (captioned) await expect(blocks.locator("figcaption")).toHaveText([caption, caption]);
        await page
          .getByRole("toolbar", { name: "Document actions", exact: true })
          .getByRole("button", { name: "Undo", exact: true })
          .click();
        await expect(blocks).toHaveCount(1);
        box = await expectTopAnchor(true);
        const original = (await grip.elementHandle())!;
        const transfer = await page.evaluateHandle(() => new DataTransfer());
        await original.dispatchEvent("dragstart", {
          clientX: box.x + box.width / 2,
          clientY: box.y + box.height / 2,
          dataTransfer: transfer,
        });
        const source = editor.locator('[data-folio-drag-source="true"]');
        await expect(source).toHaveCount(1);
        expect(await source.evaluate((element) => element.tagName)).toBe(
          captioned ? "FIGURE" : "IMG",
        );
        if (captioned) await expect(source.locator("figcaption")).toHaveText(caption);
        await original.dispatchEvent("dragend", { dataTransfer: transfer });
        await transfer.dispose();
      }
      await importImage("/missing-anchor-image.png", "");
      await expect
        .poll(() => image.evaluate((element: HTMLImageElement) => element.complete))
        .toBe(true);
      expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(0);
      if (captioned || (await image.boundingBox())!.height > 0) await expectTopAnchor(true);
      else await expect(grip).not.toBeVisible();
    } finally {
      releaseImage();
    }
  });
}

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

test("callout padding and text keep the same block controls, menu, and drag target", async ({
  page,
}) => {
  await page.getByLabel("Import document file", { exact: true }).setInputFiles({
    name: "callout-controls.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        type: "doc",
        content: [
          {
            type: "callout",
            attrs: { tone: "info" },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Stable callout" }] }],
          },
          { type: "paragraph", content: [{ type: "text", text: "After callout" }] },
        ],
      }),
    ),
  });
  const editor = page.getByTestId("folio-editor").locator(".ProseMirror");
  const callout = editor.locator(":scope > [data-folio-callout]");
  await expect(callout).toHaveText("Stable callout");
  await page.locator(".folio-demo__topbar").click();
  await callout.scrollIntoViewIfNeeded();
  const points = await callout.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const paragraph = element.querySelector("p")!;
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const text = range.getClientRects()[0];
    const y = text.top + text.height / 2;
    return [
      { x: box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft) / 2, y },
      { x: text.left + 4, y },
      { x: box.right - parseFloat(style.paddingRight) / 2, y },
    ];
  });
  const controls = page.getByTestId("folio-block-side-controls");
  const buttons = controls.locator("button");
  let initialPositions: { x: number; y: number }[] | undefined;
  for (const point of points) {
    await page.mouse.move(point.x, point.y);
    await expect(controls).toBeVisible();
    // Position updates are scheduled on animation frames, including after a
    // hover changes the DOM element under the pointer inside the same callout.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const positions = await buttons.evaluateAll((elements) =>
      elements.map((element) => {
        const { x, y } = element.getBoundingClientRect();
        return { x, y };
      }),
    );
    expect(positions).toHaveLength(2);
    if (initialPositions) {
      for (let index = 0; index < positions.length; index += 1) {
        expect(Math.abs(positions[index].x - initialPositions[index].x)).toBeLessThanOrEqual(1);
        expect(Math.abs(positions[index].y - initialPositions[index].y)).toBeLessThanOrEqual(1);
      }
    } else initialPositions = positions;
  }

  // Text hover must target the wrapper, rather than duplicating its paragraph.
  await page.mouse.move(points[1].x, points[1].y);
  const handle = controls.getByRole("button", { name: "Drag block", exact: true });
  await handle.click();
  await page.getByRole("menuitem", { name: "Duplicate blocks", exact: true }).click();
  await expect(callout).toHaveCount(2);
  await expect(callout.nth(0).locator(":scope > p")).toHaveText(["Stable callout"]);
  await expect(callout.nth(1).locator(":scope > p")).toHaveText(["Stable callout"]);
  await page
    .getByRole("toolbar", { name: "Document actions", exact: true })
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect(callout).toHaveCount(1);

  await callout.locator("p").hover();
  await expect(handle).toBeVisible();
  const dragSourceHandle = (await handle.elementHandle())!;
  const handleBox = (await handle.boundingBox())!;
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await dragSourceHandle.dispatchEvent("dragstart", {
    clientX: handleBox.x + handleBox.width / 2,
    clientY: handleBox.y + handleBox.height / 2,
    dataTransfer: transfer,
  });
  await expect(editor.locator("[data-folio-drag-source]")).toHaveAttribute(
    "data-folio-callout",
    "",
  );
  const destination = editor.locator(":scope > p", { hasText: "After callout" });
  const box = (await destination.boundingBox())!;
  const drop = {
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height - 1,
    dataTransfer: transfer,
  };
  await destination.dispatchEvent("dragover", drop);
  await expect(page.locator(".folio-block-drop-indicator")).toBeVisible();
  await destination.dispatchEvent("drop", drop);
  await dragSourceHandle.dispatchEvent("dragend", { dataTransfer: transfer });
  await transfer.dispose();
  await expect(editor.locator(":scope > :first-child")).toHaveText("After callout");
  // Tiptap may append an empty trailing paragraph after the moved wrapper.
  await expect(editor.locator(":scope > *").nth(1)).toHaveAttribute("data-folio-callout", "");
  await expect(callout.locator(":scope > p")).toHaveText(["Stable callout"]);
});

test("long-document search keeps Enter in the search field and scrolls each active match into view", async ({
  page,
}) => {
  const paragraphs = Array.from({ length: 75 }, (_, index) =>
    [10, 35, 65].includes(index)
      ? `Paragraph ${index}: faraway-needle is the searchable phrase.`
      : `Paragraph ${index}: surrounding content keeps the three results far apart.`,
  );
  await page.getByLabel("Import document file", { exact: true }).setInputFiles({
    name: "long-search-document.json",
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
  const before = await editor.textContent();
  await page
    .getByRole("toolbar", { name: "Document actions", exact: true })
    .getByRole("button", { name: "Find and replace", exact: true })
    .click();
  const search = page.getByRole("search", { name: "Find and replace", exact: true });
  const input = search.getByRole("searchbox", { name: "Find in document", exact: true });
  await input.fill("faraway-needle");
  await expect(search.locator("output")).toHaveText("1 of 3");
  for (const current of [2, 3]) {
    // Send consecutive keystrokes to the actual focused element. Locator.press
    // would refocus the field and conceal focus stolen by the editor view.
    await page.keyboard.press("Enter");
    await expect(input).toBeFocused();
    await expect(search.locator("output")).toHaveText(`${current} of 3`);
    await expect(editor.locator('[data-folio-search-match="active"]')).toBeInViewport({ ratio: 1 });
    await expect(search).toBeInViewport({ ratio: 1 });
    await expect(page.locator(".folio-editor__bubble-toolbar")).toHaveCount(0);
    expect(await editor.textContent()).toBe(before);
    await expect(editor.locator(":scope > p")).toHaveCount(paragraphs.length);
  }
});

for (const columnCount of [2, 3]) {
  test(`${columnCount}-column block controls stay in their gutter for empty and populated columns`, async ({
    page,
    isMobile,
  }) => {
    // This flow traverses every column and gap, then exercises the same nested
    // actions in inline and portal layouts. WebKit can need over 30s in total.
    test.setTimeout(60_000);
    const root = page.getByTestId("folio-editor");
    const editor = root.locator(".ProseMirror");
    const actions = page.getByRole("toolbar", { name: "Document actions", exact: true });
    const texts = Array.from({ length: columnCount }, (_, index) => `Column ${index + 1} text`);
    await editor.fill(texts[0]);
    await actions.getByRole("button", { name: `${columnCount} columns`, exact: true }).click();
    const layout = editor.locator(":scope > [data-folio-columns]");
    const columns = layout.locator(":scope > [data-folio-column]");
    await expect(columns).toHaveCount(columnCount);
    await expect(columns.first()).toHaveText(texts[0]);
    await expect(columns.nth(1)).toHaveText("");
    const controls = page.getByTestId("folio-block-side-controls");
    const grip = controls.getByRole("button", { name: "Drag block", exact: true });

    async function animationFrame() {
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      );
    }

    async function moveToGrip(index: number) {
      const paragraph = columns.nth(index).locator(":scope > p").first();
      await paragraph.scrollIntoViewIfNeeded();
      if (isMobile) await paragraph.tap();
      else {
        const box = (await paragraph.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      }
      await expect(grip).toBeVisible();
      await animationFrame();
      const initial = (await grip.boundingBox())!;
      if (!isMobile) {
        const body = (await paragraph.boundingBox())!;
        const y = initial.y + initial.height / 2;
        // Move through the actual empty gutter, one frame per point. A locator
        // click would jump straight to the button and hide a retargeting bug.
        for (const x of [
          body.x + 1,
          body.x - 2,
          body.x - 4,
          body.x - 6,
          initial.x + initial.width / 2,
        ]) {
          await page.mouse.move(x, y);
          await animationFrame();
          await expect(grip).toBeVisible();
          const current = (await grip.boundingBox())!;
          expect(Math.abs(current.x - initial.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(current.y - initial.y)).toBeLessThanOrEqual(1);
        }
      }
      return initial;
    }

    async function clickGrip(index: number) {
      const box = await moveToGrip(index);
      if (isMobile) await grip.tap();
      else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page.getByRole("menu", { name: "Block actions", exact: true })).toBeVisible();
    }

    async function expectGutterControls(requestedGap: number) {
      for (let index = 0; index < columnCount; index += 1) {
        const gripBox = await moveToGrip(index);
        const geometry = await controls.evaluate((element) => {
          const editor = element.ownerDocument.querySelector('[data-testid="folio-editor"]')!;
          const layout = editor.querySelector<HTMLElement>("[data-folio-columns]")!;
          const rect = (target: Element) => {
            const box = target.getBoundingClientRect();
            return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
          };
          return {
            controls: rect(element),
            columns: Array.from(layout.children).map(rect),
            paragraphs: Array.from(layout.querySelectorAll("p")).map(rect),
            stacked: getComputedStyle(layout).flexDirection === "column",
          };
        });
        const body = geometry.paragraphs[index];
        // The entire two-button toolbar must stay outside its own paragraph.
        expect(geometry.controls.right).toBeLessThanOrEqual(body.left - 1);
        for (const other of geometry.paragraphs) {
          const xOverlap =
            Math.min(geometry.controls.right, other.right) -
            Math.max(geometry.controls.left, other.left);
          const yOverlap =
            Math.min(geometry.controls.bottom, other.bottom) -
            Math.max(geometry.controls.top, other.top);
          expect(xOverlap > 0 && yOverlap > 0).toBe(false);
        }
        if (index > 0) {
          const previous = geometry.columns[index - 1];
          const current = geometry.columns[index];
          if (geometry.stacked) {
            // A horizontal editing gutter must not inflate stacked row spacing.
            expect(current.top - previous.bottom).toBeCloseTo(requestedGap, 0);
          } else {
            expect(geometry.controls.left).toBeGreaterThanOrEqual(previous.right + 1);
            if (requestedGap >= 100)
              expect(current.left - previous.right).toBeCloseTo(requestedGap, 0);
          }
        }
        // A real click must reach the grip, rather than a neighbouring column.
        if (isMobile) await grip.tap();
        else await page.mouse.click(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
        await expect(page.getByRole("menu", { name: "Block actions", exact: true })).toBeVisible();
        await page.keyboard.press("Escape");
      }
    }

    // Initially all columns after the first contain an empty editable paragraph.
    await expectGutterControls(20);
    for (let index = 1; index < columnCount; index += 1) {
      // A real pointer interaction clears the block selection left by the grip
      // menu before typing. fill() only changes DOM selection on editable p's.
      await columns.nth(index).locator(":scope > p").click();
      await page.keyboard.insertText(texts[index]);
      await expect(columns.nth(index)).toHaveText(texts[index]);
    }
    await expect(columns.locator(":scope > p")).toHaveText(texts);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const snapshot = JSON.parse(await readFile((await (await downloadPromise).path())!, "utf8"));
    expect(snapshot.document.content[0]).toMatchObject({
      type: "columns",
      content: texts.map((text) => ({
        type: "column",
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
      })),
    });
    for (const gap of [2, 100]) {
      await root.evaluate(
        (element, value) => element.style.setProperty("--folio-columns-gap", `${value}px`),
        gap,
      );
      await expectGutterControls(gap);
    }

    async function expectNestedTargets() {
      const index = columnCount - 1;
      await clickGrip(index);
      await page.getByRole("menuitem", { name: "Duplicate blocks", exact: true }).click();
      await expect(columns).toHaveCount(columnCount);
      await expect(columns.nth(index).locator(":scope > p")).toHaveText([
        texts[index],
        texts[index],
      ]);
      for (let other = 0; other < index; other += 1)
        await expect(columns.nth(other)).toHaveText(texts[other]);
      await actions.getByRole("button", { name: "Undo", exact: true }).click();
      await expect(columns.locator(":scope > p")).toHaveText(texts);

      // The demo's mobile outer gutter clips the plus button. Touch coverage
      // exercises the visible grip; desktop verifies both buttons' targets.
      if (!isMobile) {
        await moveToGrip(index);
        const paragraphsBeforeAdd = await editor.locator(":scope > p").count();
        const add = controls.getByRole("button", { name: "Add block below", exact: true });
        const box = (await add.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
        await animationFrame();
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await expect(page.getByRole("menu", { name: "Slash commands", exact: true })).toBeVisible();
        // The plus contract inserts after the enclosing top-level block without
        // changing its nested column contents.
        await expect(columns.locator(":scope > p")).toHaveText(texts);
        await expect(editor.locator(":scope > p")).toHaveCount(paragraphsBeforeAdd + 1);
        await page.keyboard.press("Escape");
        await actions.getByRole("button", { name: "Undo", exact: true }).click();
        await expect(columns.locator(":scope > p")).toHaveText(texts);
      }

      const box = await moveToGrip(index);
      const original = (await grip.elementHandle())!;
      const transfer = await page.evaluateHandle(() => new DataTransfer());
      await original.dispatchEvent("dragstart", {
        clientX: box.x + box.width / 2,
        clientY: box.y + box.height / 2,
        dataTransfer: transfer,
      });
      await expect(editor.locator('[data-folio-drag-source="true"]')).toHaveCount(1);
      await expect(
        columns.nth(index).locator(':scope > p[data-folio-drag-source="true"]'),
      ).toHaveText(texts[index]);
      expect(await transfer.evaluate((data) => data.getData("text/plain"))).toBe(texts[index]);
      await original.dispatchEvent("dragend", { dataTransfer: transfer });
      await transfer.dispose();
      await expect(editor.locator("[data-folio-drag-source]")).toHaveCount(0);
    }

    await expectNestedTargets();
    await page.getByText("Feature laboratory", { exact: true }).click();
    await page.getByLabel("Mount floating UI outside the editor", { exact: true }).check();
    await moveToGrip(columnCount - 1);
    expect(await controls.evaluate((element) => Boolean(element.closest(".folio-ui-portal")))).toBe(
      true,
    );
    await expectNestedTargets();
    // The bridge must not pin the old column when entering a sibling's text.
    const firstGrip = await moveToGrip(0);
    const firstParagraph = (await columns.first().locator("p").boundingBox())!;
    expect(firstGrip.x + firstGrip.width).toBeLessThanOrEqual(firstParagraph.x - 1);
    expect(firstGrip.x + firstGrip.width).toBeGreaterThan(firstParagraph.x - 50);
    expect(
      Math.abs(firstGrip.y + firstGrip.height / 2 - firstParagraph.y - firstParagraph.height / 2),
    ).toBeLessThanOrEqual(3);

    await expect(columns.locator(":scope > p")).toHaveText(texts);
    await columns.last().locator("p").click();
    await actions.getByRole("button", { name: "Remove columns", exact: true }).click();
    await expect(layout).toHaveCount(0);
    const restored = editor.locator(":scope > p").filter({ hasText: /^Column \d text$/ });
    await expect(restored).toHaveText(texts);
    if (isMobile) await restored.last().tap();
    else await restored.last().hover();
    await expect(grip).toBeVisible();
    const outerControls = (await controls.boundingBox())!;
    const restoredBox = (await restored.last().boundingBox())!;
    expect(outerControls.x + outerControls.width).toBeLessThanOrEqual(restoredBox.x - 1);
    await actions.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(columns).toHaveCount(columnCount);
    await expect(columns.locator(":scope > p")).toHaveText(texts);
    await expectGutterControls(100);
    await actions.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(layout).toHaveCount(0);
    await expect(restored).toHaveText(texts);
  });
}

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
