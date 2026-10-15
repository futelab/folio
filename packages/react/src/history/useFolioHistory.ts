import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { TextSelection } from "@tiptap/pm/state";
import { assertSafeDocumentUrls, parseFolioDocument } from "@futelab/folio-core/browser";
import type { FolioExtension } from "@futelab/folio-core/browser";
import { assertRevisionSummary } from "./types";
import type { FolioHistoryOptions, FolioRevision, FolioRevisionSummary } from "./types";
export * from "./types";
export { createMemoryFolioHistoryAdapter } from "./memory";
export { compareFolioRevisions } from "./diff";
export type { FolioRevisionDiff } from "./diff";

export function useFolioHistory(
  editor: Editor | null,
  documentId: string | undefined,
  options?: FolioHistoryOptions,
  extensions?: FolioExtension[],
) {
  const [revisions, setRevisions] = useState<FolioRevisionSummary[]>([]);
  const [preview, setPreview] = useState<FolioRevision>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error>();
  const [, refreshEditable] = useState(0);
  const latest = useRef({ editor, documentId: documentId ?? "default", options, extensions });
  useEffect(() => {
    latest.current = { editor, documentId: documentId ?? "default", options, extensions };
  }, [editor, documentId, options, extensions]);
  const generation = useRef(0);
  const listRequest = useRef(0);
  const loadRequest = useRef(0);
  const pending = useRef(new Map<AbortController, "list" | "load" | "save">());
  const saveInProgress = useRef(false);
  const saved = useRef<string | undefined>(undefined);
  const previewScope = useRef<{ generation: number; editor: Editor | null } | undefined>(undefined);
  const adapter = options?.adapter;
  const capture = useCallback(() => ({ ...latest.current, generation: generation.current }), []);
  const current = useCallback(
    (scope: ReturnType<typeof capture>) =>
      generation.current === scope.generation &&
      latest.current.editor === scope.editor &&
      !scope.editor?.isDestroyed &&
      latest.current.documentId === scope.documentId &&
      latest.current.options?.adapter === scope.options?.adapter,
    [],
  );
  const updateBusy = useCallback(
    () => setBusy(Array.from(pending.current.values()).some((kind) => kind !== "list")),
    [],
  );
  const report = useCallback((cause: unknown) => {
    const next = cause instanceof Error ? cause : new Error(String(cause));
    if (next.name === "AbortError") return;
    setError(next);
    try {
      latest.current.options?.onError?.(next);
    } catch {
      /* Diagnostic callbacks cannot break lifecycle cleanup. */
    }
  }, []);
  const refresh = useCallback(async () => {
    const scope = capture();
    if (!scope.options) return;
    const token = ++listRequest.current;
    for (const [controller, kind] of pending.current)
      if (kind === "list") {
        controller.abort();
        pending.current.delete(controller);
      }
    const controller = new AbortController();
    pending.current.set(controller, "list");
    try {
      const list = await scope.options.adapter.list(scope.documentId, controller.signal);
      if (!current(scope) || controller.signal.aborted || token !== listRequest.current) return;
      if (!Array.isArray(list) || list.length > 10_000)
        throw new Error("The history adapter returned an invalid revision list.");
      const ids = new Set<string>();
      for (const revision of list) {
        assertRevisionSummary(revision, scope.documentId);
        if (ids.has(revision.id))
          throw new Error("The history adapter returned duplicate revision IDs.");
        ids.add(revision.id);
      }
      setRevisions(structuredClone(list));
    } catch (cause) {
      if (current(scope) && token === listRequest.current && !controller.signal.aborted)
        report(cause);
    } finally {
      pending.current.delete(controller);
    }
  }, [capture, current, report]);
  const save = useCallback(
    async (label?: string) => {
      const scope = capture();
      const active = scope.editor;
      if (
        !scope.options ||
        !active ||
        active.isDestroyed ||
        !active.isEditable ||
        saveInProgress.current
      )
        return false;
      saveInProgress.current = true;
      const controller = new AbortController();
      pending.current.set(controller, "save");
      updateBusy();
      setError(undefined);
      try {
        const document = structuredClone(
          parseFolioDocument(active.getJSON(), { extensions: scope.extensions }),
        );
        assertSafeDocumentUrls(document);
        const fingerprint = JSON.stringify(document);
        const summary = await scope.options.adapter.create(
          scope.documentId,
          {
            document,
            label,
            author: scope.options.author ? structuredClone(scope.options.author) : undefined,
          },
          controller.signal,
        );
        if (
          !current(scope) ||
          controller.signal.aborted ||
          active.isDestroyed ||
          !active.isEditable
        )
          return false;
        assertRevisionSummary(summary, scope.documentId);
        saved.current = fingerprint;
        await refresh();
        return current(scope) && !controller.signal.aborted;
      } catch (cause) {
        if (current(scope) && !controller.signal.aborted) report(cause);
        return false;
      } finally {
        pending.current.delete(controller);
        if (current(scope)) {
          saveInProgress.current = Array.from(pending.current.values()).includes("save");
          updateBusy();
        }
      }
    },
    [capture, current, refresh, report, updateBusy],
  );
  const load = useCallback(
    async (revisionId: string) => {
      const scope = capture();
      if (!scope.options) return;
      const token = ++loadRequest.current;
      for (const [controller, kind] of pending.current)
        if (kind === "load") {
          controller.abort();
          pending.current.delete(controller);
        }
      const controller = new AbortController();
      pending.current.set(controller, "load");
      updateBusy();
      setError(undefined);
      try {
        const revision = await scope.options.adapter.load(
          scope.documentId,
          revisionId,
          controller.signal,
        );
        if (!current(scope) || controller.signal.aborted || token !== loadRequest.current) return;
        assertRevisionSummary(revision, scope.documentId);
        if (revision.id !== revisionId)
          throw new Error("The history adapter returned another revision.");
        const document = parseFolioDocument(revision.document, { extensions: scope.extensions });
        assertSafeDocumentUrls(document);
        previewScope.current = { generation: scope.generation, editor: scope.editor };
        setPreview(structuredClone({ ...revision, document }));
      } catch (cause) {
        if (current(scope) && token === loadRequest.current && !controller.signal.aborted)
          report(cause);
      } finally {
        pending.current.delete(controller);
        if (current(scope)) updateBusy();
      }
    },
    [capture, current, report, updateBusy],
  );
  const clearPreview = useCallback(() => {
    loadRequest.current += 1;
    for (const [controller, kind] of pending.current)
      if (kind === "load") {
        controller.abort();
        pending.current.delete(controller);
      }
    previewScope.current = undefined;
    setPreview(undefined);
    updateBusy();
  }, [updateBusy]);
  const restore = useCallback(async () => {
    const scope = capture();
    const active = scope.editor;
    if (
      !preview ||
      !scope.options ||
      preview.documentId !== scope.documentId ||
      previewScope.current?.generation !== scope.generation ||
      previewScope.current.editor !== active ||
      !active ||
      active.isDestroyed ||
      !active.isEditable
    )
      return false;
    try {
      const document = parseFolioDocument(preview.document, { extensions: scope.extensions });
      assertSafeDocumentUrls(document);
      const node = active.schema.nodeFromJSON(document);
      node.check();
      const before = active.state.doc;
      const transaction = closeHistory(active.state.tr).replaceWith(
        0,
        before.content.size,
        node.content,
      );
      transaction.setSelection(TextSelection.near(transaction.doc.resolve(0)));
      active.view.dispatch(transaction.scrollIntoView());
      if (!node.eq(before) && active.state.doc === before) return false;
      active.view.dispatch(closeHistory(active.state.tr));
      active.view.focus();
      // A failed checkpoint is exposed through error/onError. The local restore
      // has already succeeded and is still independently undoable.
      await save("Restore " + (preview.label ?? preview.id));
      return current(scope);
    } catch (cause) {
      if (current(scope)) report(cause);
      return false;
    }
  }, [capture, current, preview, report, save]);
  useEffect(() => {
    const requests = pending.current;
    const epoch = ++generation.current;
    listRequest.current += 1;
    loadRequest.current += 1;
    saveInProgress.current = false;
    saved.current = undefined;
    previewScope.current = undefined;
    queueMicrotask(() => {
      if (generation.current !== epoch) return;
      setRevisions([]);
      setPreview(undefined);
      setError(undefined);
      setBusy(false);
      void refresh();
    });
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = adapter?.subscribe?.(documentId ?? "default", () => {
        void refresh();
      });
    } catch (cause) {
      queueMicrotask(() => {
        if (generation.current === epoch) report(cause);
      });
    }
    const cancelWrites = () => {
      for (const [controller, kind] of requests) {
        if (kind !== "save") continue;
        controller.abort();
        requests.delete(controller);
      }
      saveInProgress.current = false;
      updateBusy();
    };
    const onEditorChange = () => {
      if (editor?.isDestroyed) return;
      if (!editor?.isEditable) {
        cancelWrites();
      }
      refreshEditable((value) => value + 1);
    };
    editor?.on("transaction", onEditorChange);
    const onDestroy = () => {
      for (const controller of requests.keys()) controller.abort();
      requests.clear();
      saveInProgress.current = false;
      setBusy(false);
      refreshEditable((value) => value + 1);
    };
    editor?.on("destroy", onDestroy);
    // React can commit a replacement while useEditor still returns the previous
    // non-null instance. Tiptap's unmounted view is a proxy that throws on .dom.
    const editorDOM = editor && !editor.isDestroyed ? editor.view.dom : undefined;
    const Observer = editorDOM?.ownerDocument.defaultView?.MutationObserver;
    const observer = Observer
      ? new Observer((records) => {
          if (editor?.isDestroyed) return;
          // Also notice a read-only transition followed by editable=true before the
          // queued observer callback, even when setEditable(..., false) emits no event.
          if (!editor?.isEditable || records.some((record) => record.oldValue === "false"))
            cancelWrites();
          onEditorChange();
        })
      : undefined;
    if (editorDOM && observer)
      observer.observe(editorDOM, {
        attributes: true,
        attributeFilter: ["contenteditable"],
        attributeOldValue: true,
      });
    return () => {
      generation.current += 1;
      listRequest.current += 1;
      loadRequest.current += 1;
      for (const controller of requests.keys()) controller.abort();
      requests.clear();
      try {
        unsubscribe?.();
      } catch {
        /* Cleanup must still remove editor listeners. */
      }
      editor?.off("transaction", onEditorChange);
      editor?.off("destroy", onDestroy);
      observer?.disconnect();
    };
  }, [adapter, documentId, editor, refresh, report, updateBusy]);
  const interval = options?.autoSaveIntervalMs ?? 30_000;
  useEffect(() => {
    if (!adapter || !editor || editor.isDestroyed || !Number.isFinite(interval) || interval <= 0)
      return;
    const timer = setInterval(
      () => {
        if (
          !editor.isDestroyed &&
          editor.isEditable &&
          !saveInProgress.current &&
          JSON.stringify(editor.getJSON()) !== saved.current
        )
          void save();
      },
      Math.max(1000, interval),
    );
    return () => clearInterval(timer);
  }, [adapter, editor, interval, save]);
  const canRestore = Boolean(
    preview &&
    editor &&
    !editor.isDestroyed &&
    editor.isEditable &&
    preview.documentId === (documentId ?? "default"),
  );
  return {
    revisions,
    preview,
    busy,
    error,
    refresh,
    save,
    load,
    restore,
    canRestore,
    clearPreview,
  };
}
export type FolioHistoryController = ReturnType<typeof useFolioHistory>;
