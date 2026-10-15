import { Editor, Node, type JSONContent } from "@tiptap/core";
import { createDefaultTiptapExtensions } from "@futelab/folio-core/browser";
import type { FolioDocument, FolioExtension } from "@futelab/folio-core/browser";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  compareFolioRevisions,
  createMemoryFolioHistoryAdapter,
  useFolioHistory,
  type FolioHistoryAdapter,
  type FolioHistoryOptions,
  type FolioRevision,
  type FolioRevisionSummary,
} from "./useFolioHistory";

const paragraph = (text: string): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});
const doc = (...text: string[]): FolioDocument => ({ type: "doc", content: text.map(paragraph) });
const revision = (
  id: string,
  documentId = "a",
  document = doc(id),
  createdAt = 1,
): FolioRevision => ({ id, documentId, document, createdAt, label: id });
const editors: Editor[] = [];
beforeAll(() => {
  if (!Range.prototype.getBoundingClientRect)
    Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 20, 20);
  if (!Range.prototype.getClientRects)
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function createEditor(content = doc("Current"), extensions?: FolioExtension[], editable = true) {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({
    element,
    content,
    editable,
    extensions: createDefaultTiptapExtensions({ folioExtensions: extensions }),
  });
  editors.push(editor);
  return editor;
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}
function adapter(overrides: Partial<FolioHistoryAdapter> = {}): FolioHistoryAdapter {
  return {
    list: vi.fn(async () => []),
    load: vi.fn(async (documentId, id) => revision(id, documentId)),
    create: vi.fn(async (documentId, input) => ({
      id: "created",
      documentId,
      createdAt: 2,
      label: input.label,
    })),
    ...overrides,
  };
}
async function mount(
  editor: Editor,
  options: FolioHistoryOptions,
  id = "a",
  extensions?: FolioExtension[],
) {
  const view = renderHook(
    (props: {
      editor: Editor;
      options: FolioHistoryOptions;
      id: string;
      extensions?: FolioExtension[];
    }) => useFolioHistory(props.editor, props.id, props.options, props.extensions),
    { initialProps: { editor, options, id, extensions } },
  );
  await act(async () => {});
  return view;
}

describe("memory history adapter", () => {
  it("clones initial documents, writes, reads and metadata at every boundary", async () => {
    const initial = revision("initial");
    initial.author = { id: "u", name: "Author" };
    const storage = createMemoryFolioHistoryAdapter({ initial: [initial] });
    initial.document.content![0]!.content![0]!.text = "Mutated source";
    expect((await storage.load("a", "initial")).document).toEqual(doc("initial"));
    const loaded = await storage.load("a", "initial");
    loaded.document.content![0]!.content![0]!.text = "Mutated read";
    const list = await storage.list("a");
    list[0]!.author!.name = "Changed";
    expect((await storage.list("a"))[0]!.author!.name).toBe("Author");
    const input = { document: doc("Saved") };
    const saved = await storage.create("a", input);
    input.document.content![0]!.content![0]!.text = "Changed write";
    expect((await storage.load("a", saved.id)).document).toEqual(doc("Saved"));
  });
  it("applies retention to initial data per document and orders same-millisecond writes newest first", async () => {
    const storage = createMemoryFolioHistoryAdapter({
      maxRevisions: 2,
      initial: [
        revision("old", "a", doc("old"), 1),
        revision("new", "a", doc("new"), 3),
        revision("middle", "a", doc("middle"), 2),
        revision("other", "b"),
      ],
    });
    expect((await storage.list("a")).map((item) => item.id)).toEqual(["new", "middle"]);
    expect(await storage.list("b")).toHaveLength(1);
    vi.spyOn(Date, "now").mockReturnValue(100);
    const one = await storage.create("a", { document: doc("one") });
    const two = await storage.create("a", { document: doc("two") });
    expect((await storage.list("a")).map((item) => item.id)).toEqual([two.id, one.id]);
  });
  it("isolates listener exceptions and supports unsubscribe and aborted operations", async () => {
    const storage = createMemoryFolioHistoryAdapter();
    const listener = vi.fn();
    storage.subscribe!("a", () => {
      throw new Error("Subscriber failed");
    });
    const off = storage.subscribe!("a", listener);
    await storage.create("a", { document: doc("one") });
    off();
    await storage.create("a", { document: doc("two") });
    expect(listener).toHaveBeenCalledOnce();
    const controller = new AbortController();
    controller.abort();
    await expect(storage.list("a", controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(
      storage.create("a", { document: doc("No write") }, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(await storage.list("a")).toHaveLength(2);
  });
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 10_001])(
    "rejects unbounded or invalid retention %s",
    (maxRevisions) => {
      expect(() => createMemoryFolioHistoryAdapter({ maxRevisions })).toThrow(RangeError);
    },
  );
});

describe("history async and editor boundaries", () => {
  it.each(["destroy", "unmount"] as const)(
    "never accesses the unavailable view when a non-null editor was already %s",
    async (operation) => {
      const editor = createEditor();
      editor[operation]();
      expect(editor.isDestroyed).toBe(true);
      const unavailableView = vi.spyOn(editor, "view", "get");
      const view = await mount(editor, { adapter: adapter(), autoSaveIntervalMs: 0 });
      expect(unavailableView).not.toHaveBeenCalled();
      expect(view.result.current.canRestore).toBe(false);
      await act(async () => {
        expect(await view.result.current.save()).toBe(false);
        expect(await view.result.current.restore()).toBe(false);
      });
      view.unmount();
    },
  );
  it("guards the old non-null editor during an unmount and replacement commit", async () => {
    const old = createEditor();
    const options = { adapter: adapter(), autoSaveIntervalMs: 0 };
    const view = await mount(old, options);
    act(() => {
      old.unmount();
    });
    const unavailableView = vi.spyOn(old, "view", "get");
    // Reproduce useEditor's intermediate render: a new document identity with
    // the previous Editor object whose view has already been removed.
    view.rerender({ editor: old, options, id: "b", extensions: undefined });
    await act(async () => {});
    expect(unavailableView).not.toHaveBeenCalled();
    const replacement = createEditor(doc("Replacement"));
    view.rerender({ editor: replacement, options, id: "b", extensions: undefined });
    await act(async () => {});
    await act(async () => {
      expect(await view.result.current.save()).toBe(true);
    });
    expect(replacement.getText()).toBe("Replacement");
  });
  it("prevents older list responses from overwriting a newer refresh", async () => {
    const first = deferred<FolioRevisionSummary[]>(),
      second = deferred<FolioRevisionSummary[]>();
    const list = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = await mount(createEditor(), { adapter: adapter({ list }), autoSaveIntervalMs: 0 });
    let refresh!: Promise<void>;
    act(() => {
      refresh = view.result.current.refresh();
    });
    await act(async () => {
      second.resolve([revision("new")]);
      await refresh;
    });
    await act(async () => {
      first.resolve([revision("old")]);
      await first.promise;
    });
    expect(view.result.current.revisions.map((item) => item.id)).toEqual(["new"]);
    expect(list.mock.calls[0]![1].aborted).toBe(true);
  });
  it("keeps the newest load and clearing a preview cancels pending loads", async () => {
    const one = deferred<FolioRevision>(),
      two = deferred<FolioRevision>(),
      three = deferred<FolioRevision>();
    const load = vi
      .fn()
      .mockReturnValueOnce(one.promise)
      .mockReturnValueOnce(two.promise)
      .mockReturnValueOnce(three.promise);
    const view = await mount(createEditor(), { adapter: adapter({ load }), autoSaveIntervalMs: 0 });
    let first!: Promise<void>, second!: Promise<void>;
    act(() => {
      first = view.result.current.load("one");
      second = view.result.current.load("two");
    });
    await act(async () => {
      two.resolve(revision("two"));
      await second;
      one.resolve(revision("one"));
      await first;
    });
    expect(view.result.current.preview?.id).toBe("two");
    let last!: Promise<void>;
    act(() => {
      last = view.result.current.load("three");
      view.result.current.clearPreview();
    });
    await act(async () => {
      three.resolve(revision("three"));
      await last;
    });
    expect(view.result.current.preview).toBeUndefined();
    expect(view.result.current.busy).toBe(false);
  });
  it("isolates loads and saves across a document switch and aborts their signals", async () => {
    const loaded = deferred<FolioRevision>(),
      saved = deferred<FolioRevisionSummary>();
    const storage = adapter({
      load: vi.fn(() => loaded.promise),
      create: vi.fn(() => saved.promise),
    });
    const options = { adapter: storage, autoSaveIntervalMs: 0 };
    const editor = createEditor();
    const view = await mount(editor, options);
    let load!: Promise<void>, save!: Promise<boolean>;
    act(() => {
      load = view.result.current.load("old");
      save = view.result.current.save();
    });
    view.rerender({ editor, options, id: "b", extensions: undefined });
    await act(async () => {
      loaded.resolve(revision("old"));
      saved.resolve(revision("created"));
      await load;
      expect(await save).toBe(false);
    });
    expect(view.result.current.preview).toBeUndefined();
    expect(view.result.current.error).toBeUndefined();
    expect(editor.getText()).toBe("Current");
    expect(vi.mocked(storage.load).mock.calls[0]![2]!.aborted).toBe(true);
    expect(vi.mocked(storage.create).mock.calls[0]![2]!.aborted).toBe(true);
  });
  it("keeps load and save lifecycles independent while coalescing concurrent saves", async () => {
    const saved = deferred<FolioRevisionSummary>();
    const create = vi.fn<FolioHistoryAdapter["create"]>(() => saved.promise);
    const view = await mount(createEditor(), {
      adapter: adapter({ create }),
      autoSaveIntervalMs: 0,
    });
    let save!: Promise<boolean>;
    act(() => {
      save = view.result.current.save();
    });
    await act(async () => {
      expect(await view.result.current.save()).toBe(false);
      await view.result.current.load("loaded");
    });
    expect(view.result.current.preview?.id).toBe("loaded");
    expect(view.result.current.busy).toBe(true);
    await act(async () => {
      saved.resolve(revision("created"));
      expect(await save).toBe(true);
    });
    expect(create).toHaveBeenCalledOnce();
    expect(view.result.current.busy).toBe(false);
  });
  it("does not let an adapter mutate live editor attributes through a saved snapshot", async () => {
    const editor = createEditor({
      type: "doc",
      content: [{ ...paragraph("Current"), attrs: { folioBlockId: "original-id" } }],
    });
    const storage = adapter({
      create: async (id, input) => {
        input.document.content![0]!.attrs!.folioBlockId = "changed-by-adapter";
        return revision("created", id);
      },
    });
    const view = await mount(editor, { adapter: storage, autoSaveIntervalMs: 0 });
    await act(async () => {
      await view.result.current.save();
    });
    expect(editor.getJSON().content![0]!.attrs!.folioBlockId).toBe("original-id");
  });
  it("loads and clones custom-schema revisions and restores in one isolated undo step", async () => {
    const Badge = Node.create({
      name: "historyBadge",
      group: "block",
      atom: true,
      addAttributes: () => ({ label: { default: "Badge" } }),
      renderHTML: ({ node }) => ["div", { "data-history-badge": "" }, node.attrs.label],
    });
    const extensions = [{ name: "custom-history", tiptapExtensions: [Badge] }];
    const historical = revision("saved", "a", {
      type: "doc",
      content: [
        { type: "historyBadge", attrs: { label: "Restored badge" } },
        paragraph("Saved end"),
      ],
    });
    const storage = createMemoryFolioHistoryAdapter({ initial: [historical] });
    const editor = createEditor(doc("Current"), extensions);
    const view = await mount(editor, { adapter: storage, autoSaveIntervalMs: 0 }, "a", extensions);
    act(() => {
      editor.commands.insertContent("typed ");
    });
    await act(async () => {
      await view.result.current.load("saved");
    });
    await act(async () => {
      expect(await view.result.current.restore()).toBe(true);
    });
    expect(editor.getJSON().content![0]!.type).toBe("historyBadge");
    expect((await storage.list("a"))[0]!.label).toBe("Restore saved");
    act(() => {
      editor.commands.undo();
    });
    expect(editor.getText()).toBe("typed Current");
    act(() => {
      editor.commands.undo();
    });
    expect(editor.getText()).toBe("Current");
  });
  it("permits preview in read-only mode but prevents saving or restoring", async () => {
    const storage = adapter();
    const editor = createEditor(doc("Read only"), undefined, false);
    const view = await mount(editor, { adapter: storage, autoSaveIntervalMs: 0 });
    await act(async () => {
      await view.result.current.load("saved");
    });
    expect(view.result.current.preview?.id).toBe("saved");
    expect(view.result.current.canRestore).toBe(false);
    await act(async () => {
      expect(await view.result.current.save()).toBe(false);
      expect(await view.result.current.restore()).toBe(false);
    });
    expect(storage.create).not.toHaveBeenCalled();
    expect(editor.getText()).toBe("Read only");
  });
  it("aborts pending saves when read-only toggles without update events", async () => {
    const saved = deferred<FolioRevisionSummary>();
    const create = vi.fn<FolioHistoryAdapter["create"]>(() => saved.promise);
    const editor = createEditor();
    const view = await mount(editor, { adapter: adapter({ create }), autoSaveIntervalMs: 0 });
    let result!: Promise<boolean>;
    act(() => {
      result = view.result.current.save();
      editor.setEditable(false, false);
      editor.setEditable(true, false);
    });
    await act(async () => {});
    expect(create.mock.calls[0]![2]!.aborted).toBe(true);
    expect(view.result.current.busy).toBe(false);
    await act(async () => {
      saved.resolve(revision("created"));
      expect(await result).toBe(false);
    });
    expect(view.result.current.busy).toBe(false);
  });
  it("releases an aborted save immediately and keeps a newer pending save busy", async () => {
    const old = deferred<FolioRevisionSummary>(),
      fresh = deferred<FolioRevisionSummary>();
    const create = vi
      .fn<FolioHistoryAdapter["create"]>()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(fresh.promise);
    const editor = createEditor();
    const view = await mount(editor, { adapter: adapter({ create }), autoSaveIntervalMs: 0 });
    let first!: Promise<boolean>, second!: Promise<boolean>;
    act(() => {
      first = view.result.current.save();
      editor.setEditable(false, false);
    });
    await act(async () => {});
    expect(view.result.current.busy).toBe(false);
    act(() => {
      editor.setEditable(true, false);
    });
    await act(async () => {});
    act(() => {
      second = view.result.current.save();
    });
    await act(async () => {
      old.resolve(revision("old"));
      expect(await first).toBe(false);
    });
    expect(view.result.current.busy).toBe(true);
    await act(async () => {
      fresh.resolve(revision("fresh"));
      expect(await second).toBe(true);
    });
    expect(view.result.current.busy).toBe(false);
  });
  it.each(["wrong-document", "unknown-schema", "unsafe-url"])(
    "rejects %s historical content without changing the editor",
    async (kind) => {
      const invalid =
        kind === "wrong-document"
          ? revision("saved", "other")
          : kind === "unknown-schema"
            ? revision("saved", "a", { type: "doc", content: [{ type: "unregistered" }] })
            : revision("saved", "a", {
                type: "doc",
                content: [{ type: "bookmark", attrs: { url: "javascript:evil()" } }],
              });
      const onError = vi.fn();
      const editor = createEditor();
      const view = await mount(editor, {
        adapter: adapter({ load: async () => invalid }),
        autoSaveIntervalMs: 0,
        onError,
      });
      await act(async () => {
        await view.result.current.load("saved");
      });
      expect(view.result.current.preview).toBeUndefined();
      expect(onError).toHaveBeenCalledOnce();
      expect(editor.getText()).toBe("Current");
    },
  );
  it("ignores a late adapter failure after unmount", async () => {
    const late = deferred<FolioRevision>();
    const onError = vi.fn();
    const view = await mount(createEditor(), {
      adapter: adapter({ load: () => late.promise }),
      autoSaveIntervalMs: 0,
      onError,
    });
    let request!: Promise<void>;
    act(() => {
      request = view.result.current.load("saved");
    });
    view.unmount();
    await act(async () => {
      late.reject(new Error("Old request failed"));
      await request;
    });
    expect(onError).not.toHaveBeenCalled();
  });
  it("clones loaded adapter values and ignores completions after direct editor destruction", async () => {
    const shared = revision("saved");
    const editor = createEditor();
    const late = deferred<FolioRevision>();
    const load = vi.fn().mockResolvedValueOnce(shared).mockReturnValueOnce(late.promise);
    const view = await mount(editor, { adapter: adapter({ load }), autoSaveIntervalMs: 0 });
    await act(async () => {
      await view.result.current.load("saved");
    });
    shared.document.content![0]!.content![0]!.text = "Externally mutated";
    expect(view.result.current.preview!.document).toEqual(doc("saved"));
    let request!: Promise<void>;
    act(() => {
      request = view.result.current.load("late");
      editor.destroy();
    });
    await act(async () => {
      late.resolve(revision("late"));
      await request;
    });
    expect(view.result.current.preview?.id).toBe("saved");
  });
  it("reports checkpoint failure while keeping the completed restore independently undoable", async () => {
    const onError = vi.fn();
    const storage = adapter({
      create: async () => {
        throw new Error("Checkpoint unavailable");
      },
    });
    const editor = createEditor();
    const view = await mount(editor, { adapter: storage, autoSaveIntervalMs: 0, onError });
    await act(async () => {
      await view.result.current.load("saved");
    });
    await act(async () => {
      expect(await view.result.current.restore()).toBe(true);
    });
    expect(editor.getText()).toBe("saved");
    expect(onError).toHaveBeenCalledOnce();
    act(() => {
      editor.commands.undo();
    });
    expect(editor.getText()).toBe("Current");
  });
  it("does not create duplicate automatic checkpoints while a save is pending or unchanged", async () => {
    const first = deferred<FolioRevisionSummary>();
    const create = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockImplementation(async (id: string) => revision("new", id));
    const editor = createEditor();
    const storage = adapter({ create });
    const view = await mount(editor, { adapter: storage, autoSaveIntervalMs: 0 });
    vi.useFakeTimers();
    // Recreate the interval under fake timers without changing the adapter scope.
    view.rerender({
      editor,
      options: { adapter: storage, autoSaveIntervalMs: 1000 },
      id: "a",
      extensions: undefined,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(create).toHaveBeenCalledOnce();
    await act(async () => {
      first.resolve(revision("created"));
      await first.promise;
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(create).toHaveBeenCalledOnce();
    act(() => {
      editor.commands.insertContent("Edited ");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe("revision block diff", () => {
  it("compares edit hunks without pairing unrelated additions and removals across stable blocks", () => {
    expect(compareFolioRevisions(doc("A", "X"), doc("Y", "A"))).toEqual({
      added: 1,
      removed: 1,
      changed: 0,
      unchanged: 1,
    });
    expect(compareFolioRevisions(doc("A", "B"), doc("A", "C"))).toEqual({
      added: 0,
      removed: 0,
      changed: 1,
      unchanged: 1,
    });
    expect(compareFolioRevisions(doc(), doc("A", "B"))).toEqual({
      added: 2,
      removed: 0,
      changed: 0,
      unchanged: 0,
    });
  });
  it("ignores JSON object key order and counts nested content as one changed top-level block", () => {
    const before: FolioDocument = {
      type: "doc",
      content: [
        {
          type: "callout",
          attrs: { tone: "info", folioBlockId: "id" },
          content: [paragraph("Same")],
        },
      ],
    };
    const reordered: FolioDocument = {
      type: "doc",
      content: [
        {
          content: [paragraph("Same")],
          attrs: { folioBlockId: "id", tone: "info" },
          type: "callout",
        },
      ],
    };
    expect(compareFolioRevisions(before, reordered).unchanged).toBe(1);
    reordered.content![0]!.content = [paragraph("Changed")];
    expect(compareFolioRevisions(before, reordered).changed).toBe(1);
  });
  it("bounds large comparisons, preserves repeated unchanged blocks, and marks approximate results", () => {
    const repeated = Array.from({ length: 1200 }, () => "Repeated");
    expect(
      compareFolioRevisions(
        doc("Before", ...repeated, "Old end"),
        doc("After", ...repeated, "New end"),
      ),
    ).toEqual({ added: 0, removed: 0, changed: 2, unchanged: 1200, approximate: true });
    expect(compareFolioRevisions(doc(...repeated), doc(...repeated))).toEqual({
      added: 0,
      removed: 0,
      changed: 0,
      unchanged: 1200,
    });
  });
});
