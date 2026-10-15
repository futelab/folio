import { Extension, MappablePosition } from "@tiptap/core";
import {
  createMappablePosition as createCollaborativePosition,
  getUpdatedPosition as updateCollaborativePosition,
} from "@tiptap/extension-collaboration";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import type { FolioCommentAnchor, FolioCommentsOptions, FolioCommentThread } from "./types";
import { equalFolioCommentAnchors } from "./store";

interface MappedCommentAnchor {
  anchor: FolioCommentAnchor;
  start: MappablePosition;
  end: MappablePosition;
}
export interface FolioCommentsState {
  threads: readonly FolioCommentThread[];
  anchors: Map<string, MappedCommentAnchor>;
  decorations: DecorationSet;
}
export const folioCommentsPluginKey = new PluginKey<FolioCommentsState>("folioComments");

function position(value: number, state: EditorState): MappablePosition {
  const sync = ySyncPluginKey.getState(state);
  return sync?.binding.mapping.size
    ? createCollaborativePosition(value, state)
    : new MappablePosition(value);
}
function record(anchor: FolioCommentAnchor, state: EditorState): MappedCommentAnchor {
  const from = Math.max(0, Math.min(anchor.from, state.doc.content.size));
  const to = Math.max(from, Math.min(anchor.to, state.doc.content.size));
  const safe = { ...anchor, from, to, orphaned: Boolean(anchor.orphaned) || from === to };
  return { anchor: safe, start: position(from, state), end: position(to, state) };
}
function mapRecord(
  current: MappedCommentAnchor,
  transaction: Transaction,
  state: EditorState,
  blocks: Map<string, { from: number; to: number }>,
): MappedCommentAnchor {
  const { anchor } = current;
  if (anchor.kind === "block" && anchor.blockId) {
    const block = blocks.get(anchor.blockId);
    return block
      ? record({ ...anchor, ...block, orphaned: false }, state)
      : record({ ...anchor, from: 0, to: 0, orphaned: true }, state);
  }
  const collaborative = Boolean(ySyncPluginKey.getState(state));
  const start = collaborative
    ? updateCollaborativePosition(current.start, transaction, state)
    : null;
  const end = collaborative ? updateCollaborativePosition(current.end, transaction, state) : null;
  const a = transaction.mapping.mapResult(anchor.from, 1);
  const b = transaction.mapping.mapResult(anchor.to, -1);
  let from = start?.position.position ?? a.pos;
  let to = end?.position.position ?? b.pos;
  // Reordering a whole block deletes/reinserts it; stable block identity retains
  // an internal text range even though the ordinary StepMap reports deletion.
  if (!collaborative && anchor.blockId && a.deleted && b.deleted) {
    const before = transaction.before;
    let oldPosition: number | undefined;
    before.descendants((node, pos) => {
      if (node.attrs.folioBlockId === anchor.blockId) oldPosition = pos;
    });
    const moved = blocks.get(anchor.blockId);
    if (
      moved &&
      oldPosition !== undefined &&
      transaction.doc.nodeAt(moved.from)?.eq(before.nodeAt(oldPosition)!)
    ) {
      from = moved.from + anchor.from - oldPosition;
      to = moved.from + anchor.to - oldPosition;
    }
  }
  const next = { ...anchor, from, to, orphaned: Boolean(anchor.orphaned) || from >= to };
  const result = record(next, state);
  if (start && end) {
    result.start = start.position;
    result.end = end.position;
  }
  return result;
}
function build(
  threads: readonly FolioCommentThread[],
  state: EditorState,
  previous?: FolioCommentsState,
  transaction?: Transaction,
): FolioCommentsState {
  const anchors = new Map<string, MappedCommentAnchor>();
  const decorations: Decoration[] = [];
  const previousThreads = new Map(previous?.threads.map((thread) => [thread.id, thread]));
  const blocks = new Map<string, { from: number; to: number }>();
  if (threads.length)
    state.doc.descendants((node, pos) => {
      if (typeof node.attrs.folioBlockId === "string")
        blocks.set(node.attrs.folioBlockId, { from: pos, to: pos + node.nodeSize });
    });
  for (const thread of threads) {
    const old = previous?.anchors.get(thread.id);
    const source = previousThreads.get(thread.id);
    const unchanged = old && source && equalFolioCommentAnchors(source.anchor, thread.anchor);
    const mapped = unchanged
      ? transaction?.docChanged
        ? mapRecord(old, transaction, state, blocks)
        : old
      : record(thread.anchor, state);
    anchors.set(thread.id, mapped);
    if (thread.resolved || mapped.anchor.orphaned) continue;
    const attributes = {
      class: "folio-comment-highlight",
      "data-folio-comment-id": thread.id,
      style: "background-color:var(--folio-comment-highlight, #fef08a88);",
    };
    const { from, to, kind } = mapped.anchor;
    if (kind === "block") {
      const node = state.doc.nodeAt(from);
      if (node && from + node.nodeSize === to)
        decorations.push(Decoration.node(from, to, attributes));
    } else decorations.push(Decoration.inline(from, to, attributes));
  }
  return { threads, anchors, decorations: DecorationSet.create(state.doc, decorations) };
}

export function createFolioCommentsExtension(
  options: Pick<FolioCommentsOptions, "store" | "onError">,
) {
  const { store } = options;
  return Extension.create({
    name: "folioComments",
    addProseMirrorPlugins() {
      return [
        new Plugin<FolioCommentsState>({
          key: folioCommentsPluginKey,
          state: {
            init: (_config, state) => build(store.getSnapshot(), state),
            apply: (transaction, current, _old, state) =>
              transaction.docChanged || transaction.getMeta(folioCommentsPluginKey)
                ? build(store.getSnapshot(), state, current, transaction)
                : current,
          },
          props: {
            decorations: (state) => folioCommentsPluginKey.getState(state)?.decorations ?? null,
          },
          view: (view) => {
            let disposed = false;
            let pending = false;
            let revision = 0;
            const report = (cause: unknown) => {
              if (!disposed)
                options.onError?.(cause instanceof Error ? cause : new Error(String(cause)));
            };
            const unsubscribe = store.subscribe(() => {
              if (disposed || pending) return;
              pending = true;
              queueMicrotask(() => {
                pending = false;
                if (!disposed && !view.isDestroyed)
                  view.dispatch(view.state.tr.setMeta(folioCommentsPluginKey, true));
              });
            });
            return {
              update: () => {
                const version = ++revision;
                const state = folioCommentsPluginKey.getState(view.state);
                if (!state || !store.updateAnchor) return;
                const changes = state.threads.flatMap((thread) => {
                  const anchor = state.anchors.get(thread.id)?.anchor;
                  return anchor && !equalFolioCommentAnchors(thread.anchor, anchor)
                    ? [{ id: thread.id, anchor }]
                    : [];
                });
                if (!changes.length) return;
                queueMicrotask(() => {
                  if (disposed || version !== revision) return;
                  for (const change of changes)
                    try {
                      Promise.resolve(store.updateAnchor!(change.id, change.anchor)).catch(report);
                    } catch (cause) {
                      report(cause);
                    }
                });
              },
              destroy: () => {
                disposed = true;
                unsubscribe();
              },
            };
          },
        }),
      ];
    },
  });
}
