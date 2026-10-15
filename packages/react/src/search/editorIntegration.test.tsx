import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { createPortal } from "react-dom";
import { beforeAll, describe, expect, it } from "vitest";
import { FolioEditor } from "../FolioEditor";
import type { FolioDocument } from "@futelab/folio-core/browser";

beforeAll(() => {
  if (!Range.prototype.getBoundingClientRect)
    Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 20, 20);
  if (!Range.prototype.getClientRects)
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

describe("editor control integration", () => {
  it.each([false, true])(
    "leaves block-move shortcuts to custom toolbar inputs (portal=%s)",
    async (portal) => {
      let editor: Editor | undefined;
      render(
        <FolioEditor
          defaultValue={{
            type: "doc",
            content: ["First", "Second"].map((text) => ({
              type: "paragraph",
              content: [{ type: "text", text }],
            })),
          }}
          components={{
            toolbar: (props) => {
              editor = props.editor;
              const control = <input aria-label="Host control" />;
              return portal ? createPortal(control, document.body) : control;
            },
          }}
        />,
      );
      await waitFor(() => expect(editor).toBeDefined());
      act(() => {
        editor!.commands.setTextSelection(1);
      });
      const control = screen.getByRole("textbox", { name: "Host control" });
      const allowed = fireEvent.keyDown(control, {
        key: "ArrowDown",
        altKey: true,
        shiftKey: true,
      });
      expect(editor!.getText()).toBe("First\n\nSecond");
      expect(allowed).toBe(true);
    },
  );

  it("closes find and clears its query and decorations after switching documents", async () => {
    const value = (text: string): FolioDocument => ({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    });
    const view = render(<FolioEditor documentId="first" value={value("First match")} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "f", ctrlKey: true });
    fireEvent.change(screen.getByRole("searchbox", { name: "Find in document" }), {
      target: { value: "match" },
    });
    await waitFor(() => expect(view.container.querySelector(".folio-search-match")).not.toBeNull());
    view.rerender(<FolioEditor documentId="second" value={value("Second match")} />);
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveTextContent("Second match"));
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    expect(view.container.querySelector(".folio-search-match")).toBeNull();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "f", ctrlKey: true });
    expect(screen.getByRole("searchbox", { name: "Find in document" })).toHaveValue("");
  });
});
