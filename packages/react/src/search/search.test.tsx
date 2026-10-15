import "@testing-library/jest-dom/vitest";
import { useEffect } from "react";
import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { FolioDocument } from "@futelab/folio-core/browser";
import { useFolioEditor, type UseFolioEditorOptions } from "../useFolioEditor";
import { SearchPanel } from "./SearchPanel";
import {
  useFolioSearch,
  type FolioSearchController,
  type FolioSearchOptions,
} from "./useFolioSearch";

beforeAll(() => {
  if (!Range.prototype.getBoundingClientRect)
    Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 20, 20);
  if (!Range.prototype.getClientRects)
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});
afterEach(() => vi.restoreAllMocks());
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const doc = (text: string): FolioDocument => ({ type: "doc", content: [paragraph(text)] });

async function mountSearch(
  initial: UseFolioEditorOptions,
  searchOptions: FolioSearchOptions = {},
  panel = false,
) {
  const reference: { editor: Editor | null; search: FolioSearchController | null } = {
    editor: null,
    search: null,
  };
  const onClose = vi.fn();
  function Harness(props: UseFolioEditorOptions) {
    const editor = useFolioEditor(props);
    const search = useFolioSearch(editor, searchOptions);
    useEffect(() => {
      reference.editor = editor;
      reference.search = search;
    }, [editor, search]);
    return (
      <>
        <EditorContent editor={editor} />
        {panel && <SearchPanel onClose={onClose} search={search} />}
      </>
    );
  }
  const view = render(<Harness {...initial} />);
  await waitFor(() => expect(reference.editor).not.toBeNull());
  await act(async () => {});
  return {
    editor: () => reference.editor!,
    search: () => reference.search!,
    onClose,
    rerender: (options: UseFolioEditorOptions) => view.rerender(<Harness {...options} />),
    unmount: view.unmount,
  };
}

describe("document find and replace", () => {
  it("counts literal matches and highlights them through decorations without changing document JSON", async () => {
    const mounted = await mountSearch({ defaultValue: doc("a.b a?b a.b") });
    const before = mounted.editor().getJSON();
    act(() => {
      mounted.search().setQuery("a.b");
    });
    expect(mounted.search().matches).toHaveLength(2);
    expect(mounted.search().currentIndex).toBe(0);
    expect(mounted.editor().view.dom.querySelectorAll(".folio-search-match")).toHaveLength(2);
    expect(mounted.editor().view.dom.querySelectorAll(".folio-search-match--active")).toHaveLength(
      1,
    );
    expect(mounted.editor().getJSON()).toEqual(before);
    act(() => {
      mounted.search().setQuery("");
    });
    expect(mounted.editor().view.dom.querySelector(".folio-search-match")).toBeNull();
  });

  it("matches across inline marks but never across blocks, hard breaks or inline atoms", async () => {
    const value: FolioDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "ab", marks: [{ type: "bold" }] },
            { type: "text", text: "cd" },
          ],
        },
        paragraph("ab"),
        paragraph("cd"),
        {
          type: "paragraph",
          content: [
            { type: "text", text: "ab" },
            { type: "hardBreak" },
            { type: "text", text: "cd" },
          ],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "ab" },
            { type: "mention", attrs: { id: "x", label: "X" } },
            { type: "text", text: "cd" },
          ],
        },
      ],
    };
    const mounted = await mountSearch({ defaultValue: value });
    act(() => {
      mounted.search().setQuery("abcd");
    });
    expect(mounted.search().matches).toEqual([{ from: 1, to: 5 }]);
    act(() => {
      mounted.search().setQuery("bc");
    });
    expect(mounted.search().matches).toEqual([{ from: 2, to: 4 }]);
  });

  it("supports case-sensitive and Unicode whole-word searches", async () => {
    const mounted = await mountSearch({ defaultValue: doc("cat scatter cat_ cat2 CAT 𐐀cat") });
    act(() => {
      mounted.search().setQuery("cat");
    });
    expect(mounted.search().matches).toHaveLength(6);
    act(() => {
      mounted.search().setWholeWord(true);
    });
    expect(mounted.search().matches).toHaveLength(2);
    act(() => {
      mounted.search().setCaseSensitive(true);
    });
    expect(mounted.search().matches).toHaveLength(1);
  });

  it("navigates with wraparound and follows explicit selection changes", async () => {
    const mounted = await mountSearch({ defaultValue: doc("one one one") });
    act(() => {
      mounted.search().setQuery("one");
    });
    act(() => {
      mounted.search().previous();
    });
    expect(mounted.search().currentIndex).toBe(2);
    expect(mounted.editor().state.selection.from).toBe(9);
    act(() => {
      mounted.search().next();
    });
    expect(mounted.search().currentIndex).toBe(0);
    act(() => {
      mounted.editor().commands.setTextSelection(6);
    });
    expect(mounted.search().currentIndex).toBe(1);
  });

  it("updates counts after edits and new controlled documents while retaining the search query", async () => {
    const mounted = await mountSearch({ defaultValue: doc("cat cat"), documentId: "a" });
    act(() => {
      mounted.search().setQuery("cat");
    });
    act(() => {
      mounted.editor().commands.setTextSelection(8);
      mounted.editor().commands.insertContent(" cat");
    });
    expect(mounted.search().matches).toHaveLength(3);
    mounted.rerender({ value: doc("cat changed"), documentId: "b" });
    await waitFor(() => expect(mounted.editor().getText()).toBe("cat changed"));
    await waitFor(() => expect(mounted.search().matches).toHaveLength(1));
    expect(mounted.search().query).toBe("cat");
  });

  it("replaces current matches, advances, and retains inline formatting", async () => {
    const mounted = await mountSearch({
      defaultValue: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "cat", marks: [{ type: "bold" }] },
              { type: "text", text: " cat" },
            ],
          },
        ],
      },
    });
    act(() => {
      mounted.search().setQuery("cat");
    });
    act(() => {
      expect(mounted.search().replaceCurrent("dog")).toBe(true);
    });
    expect(mounted.editor().getText()).toBe("dog cat");
    expect(mounted.search().matches).toHaveLength(1);
    expect(mounted.editor().getJSON().content![0]!.content![0]!.marks).toContainEqual({
      type: "bold",
    });
    act(() => {
      mounted.search().replaceCurrent("dog");
    });
    expect(mounted.editor().getText()).toBe("dog dog");
    expect(mounted.search().currentIndex).toBe(-1);
  });

  it("replaces all in one undo step, isolated from earlier typing", async () => {
    const mounted = await mountSearch({ defaultValue: doc("cat cat") });
    act(() => {
      mounted.editor().commands.insertContent("prefix ");
      mounted.search().setQuery("cat");
    });
    act(() => {
      expect(mounted.search().replaceAll("dog")).toBe(2);
    });
    expect(mounted.editor().getText()).toBe("prefix dog dog");
    act(() => {
      mounted.editor().commands.undo();
    });
    expect(mounted.editor().getText()).toBe("prefix cat cat");
    act(() => {
      mounted.editor().commands.undo();
    });
    expect(mounted.editor().getText()).toBe("cat cat");
  });

  it("bounds decorations and refuses a misleading partial replace-all", async () => {
    const onError = vi.fn();
    const mounted = await mountSearch(
      { defaultValue: doc("cat cat cat") },
      { maxMatches: 2, onError },
    );
    act(() => {
      mounted.search().setQuery("cat");
    });
    expect(mounted.search().matches).toHaveLength(2);
    expect(mounted.search().truncated).toBe(true);
    expect(mounted.search().canReplaceAll).toBe(false);
    act(() => {
      expect(mounted.search().replaceAll("dog")).toBe(0);
    });
    expect(mounted.editor().getText()).toBe("cat cat cat");
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized queries and replacements before changing the document", async () => {
    const onError = vi.fn();
    const mounted = await mountSearch({ defaultValue: doc("cat cat") }, { onError });
    act(() => {
      mounted.search().setQuery("cat");
    });
    act(() => {
      mounted.search().setQuery("x".repeat(4097));
    });
    expect(mounted.search().query).toBe("cat");
    act(() => {
      expect(mounted.search().replaceAll("x".repeat(1_000_001))).toBe(0);
    });
    expect(mounted.editor().getText()).toBe("cat cat");
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("allows read-only search and navigation but blocks all replacement paths", async () => {
    const mounted = await mountSearch({ value: doc("cat cat"), editable: false });
    act(() => {
      mounted.search().setQuery("cat");
      mounted.search().next();
    });
    expect(mounted.search().matches).toHaveLength(2);
    expect(mounted.search().currentIndex).toBe(1);
    expect(mounted.search().canReplace).toBe(false);
    act(() => {
      expect(mounted.search().replaceCurrent("dog")).toBe(false);
      expect(mounted.search().replaceAll("dog")).toBe(0);
    });
    expect(mounted.editor().getText()).toBe("cat cat");
  });

  it("updates writable controls when the same editor becomes read-only", async () => {
    const initial = { defaultValue: doc("cat") };
    const mounted = await mountSearch(initial);
    act(() => {
      mounted.search().setQuery("cat");
    });
    expect(mounted.search().canReplace).toBe(true);
    const editor = mounted.editor();
    mounted.rerender({ ...initial, editable: false });
    await waitFor(() => expect(mounted.search().editable).toBe(false));
    expect(mounted.editor()).toBe(editor);
    expect(mounted.search().canReplace).toBe(false);
  });
});

describe("SearchPanel", () => {
  it("keeps repeated Enter navigation in the find input and explicitly scrolls the active match", async () => {
    const mounted = await mountSearch({ defaultValue: doc("cat cat cat") }, {}, true);
    const input = screen.getByRole("searchbox", { name: "Find in document" });
    fireEvent.change(input, { target: { value: "cat" } });
    const original = mounted.editor().getJSON();
    const focus = vi.spyOn(mounted.editor().view, "focus");
    const targets: { active: boolean; insideEditor: boolean }[] = [];
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (
      this: Element,
    ) {
      targets.push({
        active: this.matches('[data-folio-search-match="active"]'),
        insideEditor: mounted.editor().view.dom.contains(this),
      });
    });
    input.focus();
    for (let index = 0; index < 2; index += 1) {
      fireEvent.keyDown(document.activeElement!, { key: "Enter" });
      expect(input).toHaveFocus();
      expect(mounted.search().currentIndex).toBe(index + 1);
    }
    expect(mounted.editor().getJSON()).toEqual(original);
    expect(focus).not.toHaveBeenCalled();
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(scroll).toHaveBeenLastCalledWith({ block: "center", inline: "nearest" });
    expect(targets).toEqual([
      { active: true, insideEditor: true },
      { active: true, insideEditor: true },
    ]);
  });

  it("keeps the navigation button focused without relying on editor focus", async () => {
    const mounted = await mountSearch({ defaultValue: doc("cat cat cat") }, {}, true);
    fireEvent.change(screen.getByRole("searchbox", { name: "Find in document" }), {
      target: { value: "cat" },
    });
    const next = screen.getByRole("button", { name: "Next match" });
    next.focus();
    fireEvent.click(next);
    expect(next).toHaveFocus();
    expect(mounted.search().currentIndex).toBe(1);
  });

  it("scrolls to the next active match after replacement without taking the replacement input focus", async () => {
    const mounted = await mountSearch(
      { defaultValue: { type: "doc", content: [paragraph("cat"), paragraph("cat")] } },
      {},
      true,
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Find in document" }), {
      target: { value: "cat" },
    });
    const replacement = screen.getByRole("textbox", { name: "Replace with" });
    replacement.focus();
    const targets: Element[] = [];
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element) {
      targets.push(this);
    });
    act(() => {
      expect(mounted.search().replaceCurrent("dog")).toBe(true);
    });
    expect(replacement).toHaveFocus();
    const active = mounted.editor().view.dom.querySelector('[data-folio-search-match="active"]');
    expect(targets).toEqual([active]);
    expect(active?.parentElement).toBe(mounted.editor().view.dom.querySelectorAll("p")[1]);
    expect(mounted.editor().getText()).toBe("dog\n\ncat");
  });

  it("scrolls to the replacement when replace-all leaves no remaining matches and preserves input focus", async () => {
    const mounted = await mountSearch({ defaultValue: doc("cat cat") }, {}, true);
    fireEvent.change(screen.getByRole("searchbox", { name: "Find in document" }), {
      target: { value: "cat" },
    });
    const replacement = screen.getByRole("textbox", { name: "Replace with" });
    replacement.focus();
    const targets: Element[] = [];
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (
      this: Element,
    ) {
      targets.push(this);
    });
    act(() => {
      expect(mounted.search().replaceAll("dog")).toBe(2);
    });
    expect(mounted.search().matches).toHaveLength(0);
    expect(replacement).toHaveFocus();
    expect(scroll).toHaveBeenCalledWith({ block: "center", inline: "nearest" });
    expect(targets.at(-1)).toBe(mounted.editor().view.dom.querySelector("p"));
    expect(targets.at(-1)).toHaveTextContent("dog dog");
  });

  it("shows counts, uses keyboard navigation, preserves IME confirmation and closes on Escape", async () => {
    const mounted = await mountSearch({ defaultValue: doc("cat cat") }, {}, true);
    const input = screen.getByRole("searchbox", { name: "Find in document" });
    fireEvent.change(input, { target: { value: "cat" } });
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    const before = mounted.editor().state.selection.from;
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(mounted.editor().state.selection.from).toBe(before);
    fireEvent.keyDown(input, { key: "Escape", isComposing: true });
    expect(mounted.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(mounted.onClose).toHaveBeenCalledOnce();
  });

  it("disables replacement UI in read-only mode while keeping search usable", async () => {
    await mountSearch({ value: doc("cat"), editable: false }, {}, true);
    const input = screen.getByRole("searchbox", { name: "Find in document" });
    expect(input).toBeEnabled();
    fireEvent.change(input, { target: { value: "cat" } });
    expect(screen.getByText("1 of 1")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Replace with" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Replace$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Replace all$/ })).toBeDisabled();
  });
});
