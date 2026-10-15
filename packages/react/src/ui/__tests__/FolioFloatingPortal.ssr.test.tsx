// @vitest-environment node
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FolioFloatingPortal, FolioUIProvider, isFolioEditorUIElement } from "..";

describe("floating UI in Node SSR", () => {
  it("renders without browser globals or accessing refs", () => {
    const rootRef = {
      get current(): HTMLElement | null {
        throw new Error("SSR must not read host refs");
      },
    };
    expect(typeof window).toBe("undefined");
    expect(
      renderToString(
        <FolioUIProvider ownerId="server" rootRef={rootRef}>
          <FolioFloatingPortal coordinateSpace="viewport">
            <span>Server content</span>
          </FolioFloatingPortal>
        </FolioUIProvider>,
      ),
    ).toBe("<span>Server content</span>");
    expect(isFolioEditorUIElement(null, "server")).toBe(false);
    expect(isFolioEditorUIElement(new EventTarget(), "server")).toBe(false);
  });
});
