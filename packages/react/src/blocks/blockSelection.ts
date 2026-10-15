import type { Editor, JSONContent } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import type { Attrs, Node as ProseMirrorNode, NodeType } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { NodeSelection, Plugin, PluginKey, Selection } from "@tiptap/pm/state";
import type { SelectionBookmark, Transaction } from "@tiptap/pm/state";
import type { Mappable } from "@tiptap/pm/transform";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface SelectedBlock {
  node: ProseMirrorNode;
  pos: number;
  index: number;
}

export interface BlockSelectionRange {
  anchorBlock: number;
  headBlock: number;
  from: number;
  to: number;
}

export type BlockSelectionAction =
  | { type: "set"; anchorBlock: number; headBlock?: number }
  | { type: "clear" };

interface SharedBlockSelection {
  selectionClass?: typeof FolioBlockSelection;
  pluginKey?: PluginKey<BlockSelectionRange | null>;
}

// ESM/CJS and independently bundled package subpaths can share ProseMirror's
// Selection registry. Keep one class and key for each actual Selection base.
const registrySymbol = Symbol.for("@futelab/folio/block-selection-registry");
const scope = globalThis as unknown as Record<symbol, unknown>;
const registries = (scope[registrySymbol] ??= new WeakMap()) as WeakMap<
  object,
  SharedBlockSelection
>;
const shared = registries.get(Selection) ?? {};
registries.set(Selection, shared);
export const blockSelectionPluginKey = (shared.pluginKey ??=
  new PluginKey<BlockSelectionRange | null>("folioBlockSelection"));

function documentBlocks(doc: ProseMirrorNode): SelectedBlock[] {
  const blocks: SelectedBlock[] = [];
  doc.forEach((node, pos, index) => blocks.push({ node, pos, index }));
  return blocks;
}

function selectionRange(selection: Selection): BlockSelectionRange | null {
  return selection instanceof BlockSelection
    ? {
        anchorBlock: selection.anchorBlock,
        headBlock: selection.headBlock,
        from: selection.from,
        to: selection.to,
      }
    : null;
}

function nearSelection(doc: ProseMirrorNode, position: number): Selection {
  return Selection.near(doc.resolve(Math.min(doc.content.size, Math.max(0, position))));
}

function resolveRange(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  backward: boolean,
): Selection {
  if (from >= to) return nearSelection(doc, from);
  const blocks = documentBlocks(doc).filter(
    ({ node, pos }) => pos < to && pos + node.nodeSize > from,
  );
  if (!blocks.length) return nearSelection(doc, from);
  const first = blocks[0]!.pos;
  const last = blocks.at(-1)!.pos;
  return BlockSelection.create(doc, backward ? last : first, backward ? first : last);
}

class BlockSelectionBookmark implements SelectionBookmark {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly backward: boolean,
  ) {}

  map(mapping: Mappable): BlockSelectionBookmark {
    return new BlockSelectionBookmark(
      mapping.map(this.from, 1),
      mapping.map(this.to, -1),
      this.backward,
    );
  }

  resolve(doc: ProseMirrorNode): Selection {
    return resolveRange(doc, this.from, this.to, this.backward);
  }
}

/** A continuous range of whole top-level blocks, distinct from text selection. */
class FolioBlockSelection extends Selection {
  readonly visible = false;

  private constructor(
    doc: ProseMirrorNode,
    readonly anchorBlock: number,
    readonly headBlock: number,
    anchorEnd: number,
    headEnd: number,
  ) {
    const backward = anchorBlock > headBlock;
    super(
      doc.resolve(backward ? anchorEnd : anchorBlock),
      doc.resolve(backward ? headBlock : headEnd),
    );
  }

  static create(
    doc: ProseMirrorNode,
    anchorBlock: number,
    headBlock = anchorBlock,
  ): BlockSelection {
    const blocks = documentBlocks(doc);
    const anchor = blocks.find(({ pos }) => pos === anchorBlock);
    const head = blocks.find(({ pos }) => pos === headBlock);
    if (!anchor || !head)
      throw new RangeError("Block selection endpoints must be top-level block starts");
    return new BlockSelection(
      doc,
      anchorBlock,
      headBlock,
      anchor.pos + anchor.node.nodeSize,
      head.pos + head.node.nodeSize,
    );
  }

  eq(other: Selection): boolean {
    return (
      other instanceof BlockSelection &&
      other.anchorBlock === this.anchorBlock &&
      other.headBlock === this.headBlock
    );
  }

  map(doc: ProseMirrorNode, mapping: Mappable): Selection {
    return resolveRange(
      doc,
      mapping.map(this.from, 1),
      mapping.map(this.to, -1),
      this.anchorBlock > this.headBlock,
    );
  }

  content(): Slice {
    return new Slice(this.$from.doc.slice(this.from, this.to).content, 0, 0);
  }

  toJSON() {
    return { type: "folio-block", anchorBlock: this.anchorBlock, headBlock: this.headBlock };
  }

  static fromJSON(
    doc: ProseMirrorNode,
    value: { anchorBlock?: unknown; headBlock?: unknown },
  ): BlockSelection {
    if (!Number.isInteger(value.anchorBlock) || !Number.isInteger(value.headBlock))
      throw new RangeError("Invalid block selection JSON");
    return BlockSelection.create(doc, value.anchorBlock as number, value.headBlock as number);
  }

  getBookmark(): SelectionBookmark {
    return new BlockSelectionBookmark(this.from, this.to, this.anchorBlock > this.headBlock);
  }
}

if (!shared.selectionClass) {
  Selection.jsonID("folio-block", FolioBlockSelection);
  shared.selectionClass = FolioBlockSelection;
}
export const BlockSelection = shared.selectionClass;
export type BlockSelection = FolioBlockSelection;

export function createBlockSelectionPlugin(): Plugin<BlockSelectionRange | null> {
  return new Plugin<BlockSelectionRange | null>({
    key: blockSelectionPluginKey,
    state: {
      init: (_config, state) => selectionRange(state.selection),
      apply: (transaction) => selectionRange(transaction.selection),
    },
    props: {
      decorations(state) {
        if (!(state.selection instanceof BlockSelection)) return null;
        return DecorationSet.create(
          state.doc,
          documentBlocks(state.doc)
            .filter(({ pos }) => pos >= state.selection.from && pos < state.selection.to)
            .map(({ node, pos }) =>
              Decoration.node(pos, pos + node.nodeSize, {
                class: "folio-block-selected",
                "data-folio-block-selected": "true",
              }),
            ),
        );
      },
    },
    appendTransaction(transactions, _oldState, state) {
      for (let index = transactions.length - 1; index >= 0; index -= 1) {
        const transaction = transactions[index]!;
        const action = transaction.getMeta(blockSelectionPluginKey) as
          | BlockSelectionAction
          | undefined;
        if (!action) continue;
        let next: Selection;
        try {
          next =
            action.type === "set"
              ? BlockSelection.create(transaction.doc, action.anchorBlock, action.headBlock)
              : transaction.selection instanceof BlockSelection
                ? nearSelection(transaction.doc, transaction.selection.from)
                : transaction.selection;
          for (const following of transactions.slice(index + 1))
            next = next.map(following.doc, following.mapping);
        } catch {
          return null;
        }
        return state.selection.eq(next)
          ? null
          : state.tr.setSelection(next).setMeta("addToHistory", false);
      }
      return null;
    },
  });
}

export function getSelectedBlocks(editor: Editor | null): SelectedBlock[] {
  if (!editor || editor.isDestroyed) return [];
  const selection = editor.state.selection;
  if (selection instanceof NodeSelection) {
    const excluded = new Set([
      "column",
      "detailsContent",
      "detailsSummary",
      "tableRow",
      "tableCell",
      "tableHeader",
    ]);
    const parents = new Set([
      "doc",
      "callout",
      "blockquote",
      "detailsContent",
      "column",
      "listItem",
      "taskItem",
      "bulletList",
      "orderedList",
      "taskList",
    ]);
    return selection.node.isBlock &&
      !excluded.has(selection.node.type.name) &&
      parents.has(selection.$from.parent.type.name)
      ? [{ node: selection.node, pos: selection.from, index: selection.$from.index() }]
      : [];
  }
  if (!(selection instanceof BlockSelection)) return [];
  const { from, to } = selection;
  return documentBlocks(editor.state.doc).filter(({ pos }) => pos >= from && pos < to);
}

/** Endpoint positions are inclusive top-level block starts, not child indexes. */
export function setBlockSelection(
  editor: Editor | null,
  anchorBlock: number,
  headBlock = anchorBlock,
): boolean {
  if (!editor || editor.isDestroyed) return false;
  try {
    const selection = BlockSelection.create(editor.state.doc, anchorBlock, headBlock);
    if (!editor.state.selection.eq(selection))
      editor.view.dispatch(
        editor.state.tr
          .setSelection(selection)
          .setMeta(blockSelectionPluginKey, {
            type: "set",
            anchorBlock,
            headBlock,
          } satisfies BlockSelectionAction)
          .setMeta("addToHistory", false),
      );
    return true;
  } catch {
    return false;
  }
}

export function clearBlockSelection(editor: Editor | null): boolean {
  if (!editor || editor.isDestroyed || !(editor.state.selection instanceof BlockSelection))
    return false;
  editor.view.dispatch(
    editor.state.tr
      .setSelection(nearSelection(editor.state.doc, editor.state.selection.from))
      .setMeta(blockSelectionPluginKey, { type: "clear" } satisfies BlockSelectionAction)
      .setMeta("addToHistory", false),
  );
  return true;
}

export function getSelectedBlocksContent(editor: Editor | null): Slice | null {
  if (!editor || !getSelectedBlocks(editor).length) return null;
  return editor.state.selection.content();
}

export function copySelectedBlocks(editor: Editor | null): JSONContent[] {
  return JSON.parse(
    JSON.stringify(getSelectedBlocks(editor).map(({ node }) => node.toJSON())),
  ) as JSONContent[];
}

let generatedId = 0;
function freshId(used: Set<string>): string {
  let id: string;
  do {
    id = `folio-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${++generatedId}-${Math.random().toString(36).slice(2)}`}`;
  } while (used.has(id));
  used.add(id);
  return id;
}

/** Rebase copied anchors while leaving reference identities such as mention.id intact. */
export function cloneBlocksWithFreshIds(
  content: readonly JSONContent[],
  doc?: ProseMirrorNode,
): JSONContent[] {
  const cloned = JSON.parse(JSON.stringify(content)) as JSONContent[];
  const used = new Set<string>();
  doc?.descendants((node) => {
    for (const key of [
      "folioBlockId",
      ...(node.type.name === "heading" ? ["id", "data-toc-id"] : []),
    ]) {
      const value: unknown = node.attrs[key];
      if (typeof value === "string" && value) used.add(value);
    }
  });
  const links = new Map<string, string>();
  const visit = (node: JSONContent) => {
    const attrs = node.attrs;
    if (attrs) {
      if (typeof attrs.folioBlockId === "string" && attrs.folioBlockId) {
        const id = freshId(used);
        links.set(`#folio-block-${attrs.folioBlockId}`, `#folio-block-${id}`);
        attrs.folioBlockId = id;
      }
      if (node.type === "heading") {
        const ids = new Map<string, string>();
        for (const key of ["id", "data-toc-id"]) {
          const previous: unknown = attrs[key];
          if (typeof previous !== "string" || !previous) continue;
          const id = ids.get(previous) ?? freshId(used);
          ids.set(previous, id);
          links.set(`#${previous}`, `#${id}`);
          attrs[key] = id;
        }
      }
    }
    node.content?.forEach(visit);
  };
  cloned.forEach(visit);
  const updateLinks = (node: JSONContent) => {
    if (node.attrs)
      for (const name of ["href", "url"]) {
        const value: unknown = node.attrs[name];
        if (typeof value === "string" && links.has(value)) node.attrs[name] = links.get(value);
      }
    node.marks?.forEach((mark) => {
      if (
        mark.type === "link" &&
        typeof mark.attrs?.href === "string" &&
        links.has(mark.attrs.href)
      )
        mark.attrs.href = links.get(mark.attrs.href);
    });
    node.content?.forEach(updateLinks);
  };
  cloned.forEach(updateLinks);
  return cloned;
}

function commit(editor: Editor, transaction: Transaction): boolean {
  if (
    !editor.isEditable ||
    editor.isDestroyed ||
    !transaction.docChanged ||
    transaction.doc.eq(editor.state.doc)
  )
    return false;
  transaction.doc.check();
  const ids = new Set<string>();
  let duplicate = false;
  transaction.doc.descendants((node) => {
    const id: unknown = node.attrs.folioBlockId;
    if (typeof id === "string" && id) {
      if (ids.has(id)) duplicate = true;
      ids.add(id);
    }
  });
  if (duplicate) return false;
  const before = editor.state.doc;
  const selectedNode =
    transaction.selection instanceof NodeSelection ? transaction.selection.node : null;
  let selectedPosition = transaction.selection.from;
  let retainNodeSelection = Boolean(selectedNode);
  const observe = (event: { transaction: Transaction; appendedTransactions: Transaction[] }) => {
    if (event.transaction !== transaction) return;
    for (const appended of event.appendedTransactions) {
      if (appended.selectionSet) retainNodeSelection = false;
      selectedPosition = appended.mapping.map(selectedPosition, 1);
    }
  };
  editor.on("transaction", observe);
  try {
    editor.view.dispatch(closeHistory(transaction));
  } finally {
    editor.off("transaction", observe);
  }
  if (editor.state.doc === before) return false;
  const boundary = closeHistory(editor.state.tr);
  // Attribute-only appended transactions (such as generated heading anchors)
  // map NodeSelection to text. Keep the menu on the surviving nested block.
  if (retainNodeSelection && editor.state.doc.nodeAt(selectedPosition)?.type === selectedNode?.type)
    boundary.setSelection(NodeSelection.create(editor.state.doc, selectedPosition));
  editor.view.dispatch(boundary.setMeta("addToHistory", false));
  return true;
}

function writableSelection(editor: Editor | null): editor is Editor {
  return Boolean(
    editor && !editor.isDestroyed && editor.isEditable && getSelectedBlocks(editor).length,
  );
}

export function deleteSelectedBlocks(editor: Editor | null): boolean {
  if (!writableSelection(editor)) return false;
  try {
    const { from, to, $from } = editor.state.selection;
    const blocks = getSelectedBlocks(editor);
    const first = blocks[0]!.index,
      end = blocks.at(-1)!.index + 1;
    const parent = $from.parent;
    let replacement = Fragment.empty;
    if (!parent.canReplace(first, end, replacement)) {
      replacement =
        parent
          .contentMatchAt(first)
          .fillBefore(parent.content.cut(editor.state.selection.$to.parentOffset), true) ??
        Fragment.empty;
    }
    if (!parent.canReplace(first, end, replacement)) return false;
    const transaction = editor.state.tr.replaceWith(from, to, replacement);
    transaction.setSelection(nearSelection(transaction.doc, from));
    return commit(editor, transaction);
  } catch {
    return false;
  }
}

export function duplicateSelectedBlocks(editor: Editor | null): boolean {
  if (!writableSelection(editor)) return false;
  try {
    const selection = editor.state.selection;
    const { to } = selection;
    const nodes = cloneBlocksWithFreshIds(copySelectedBlocks(editor), editor.state.doc).map(
      (node) => editor.schema.nodeFromJSON(node),
    );
    const content = Fragment.fromArray(nodes);
    const index = getSelectedBlocks(editor).at(-1)!.index + 1;
    if (!selection.$from.parent.canReplace(index, index, content)) return false;
    const transaction = editor.state.tr.insert(to, content);
    transaction.setSelection(
      selection instanceof NodeSelection
        ? NodeSelection.create(transaction.doc, to)
        : resolveRange(transaction.doc, to, to + content.size, false),
    );
    return commit(editor, transaction);
  } catch {
    return false;
  }
}

/** Target is a boundary in the original document, before removing the range. */
export function moveSelectedBlocks(editor: Editor | null, targetPosition: number): boolean {
  if (!writableSelection(editor) || !(editor.state.selection instanceof BlockSelection))
    return false;
  try {
    const selection = editor.state.selection as BlockSelection;
    const { from, to } = selection;
    const doc = editor.state.doc;
    if (
      (targetPosition >= from && targetPosition <= to) ||
      ![...documentBlocks(doc).map(({ pos }) => pos), doc.content.size].includes(targetPosition)
    )
      return false;
    const blocks = getSelectedBlocks(editor);
    if (!doc.canReplace(blocks[0]!.index, blocks.at(-1)!.index + 1, Fragment.empty)) return false;
    const content = selection.content().content;
    const position = targetPosition > to ? targetPosition - (to - from) : targetPosition;
    const transaction = editor.state.tr.delete(from, to).insert(position, content);
    transaction.setSelection(
      resolveRange(
        transaction.doc,
        position,
        position + content.size,
        selection.anchorBlock > selection.headBlock,
      ),
    );
    return commit(editor, transaction);
  } catch {
    return false;
  }
}

const textTypes = new Set(["paragraph", "heading", "codeBlock"]);
const listTypes = new Set(["bulletList", "orderedList", "taskList"]);

function convertedAttrs(node: ProseMirrorNode, target: NodeType, overrides: Attrs = {}): Attrs {
  const specs = target.spec.attrs ?? {};
  if (Object.keys(overrides).some((name) => !(name in specs)))
    throw new RangeError("Unsupported target attribute");
  const attrs: Record<string, unknown> = {};
  const generatedHeading =
    node.type.name === "heading" && node.attrs.id && node.attrs.id === node.attrs["data-toc-id"];
  for (const [name, value] of Object.entries(node.attrs)) {
    if (name in specs) attrs[name] = value;
    else if (
      value !== null &&
      value !== undefined &&
      value !== node.type.spec.attrs?.[name]?.default &&
      !(node.type.name === "heading" && name === "level") &&
      !(node.type.name === "codeBlock" && name === "language") &&
      !(node.type.name === "orderedList" && name === "start") &&
      !(node.type.name === "taskItem" && name === "checked") &&
      !(generatedHeading && (name === "id" || name === "data-toc-id"))
    ) {
      throw new RangeError("Conversion would discard an attribute");
    }
  }
  return { ...attrs, ...overrides };
}

function conversion(editor: Editor, type: string, attrs: Attrs = {}): Fragment | null {
  const target = editor.schema.nodes[type];
  const selected = getSelectedBlocks(editor);
  if (
    !target ||
    !selected.length ||
    ![...textTypes, ...listTypes, "blockquote", "callout"].includes(type)
  )
    return null;
  if (type === "heading" && attrs.level !== undefined && ![1, 2, 3].includes(attrs.level))
    return null;
  if (textTypes.has(type)) {
    if (selected.some(({ node }) => !textTypes.has(node.type.name))) return null;
    return Fragment.fromArray(
      selected.map(({ node }) =>
        target.createChecked(convertedAttrs(node, target, attrs), node.content, node.marks),
      ),
    );
  }
  if (type === "blockquote" || type === "callout") {
    if (Object.keys(attrs).some((name) => !(name in (target.spec.attrs ?? {})))) return null;
    if (
      selected.every(
        ({ node }) =>
          node.type === target &&
          Object.entries(attrs).every(([name, value]) => node.attrs[name] === value),
      )
    )
      return Fragment.fromArray(selected.map(({ node }) => node));
    return Fragment.from(
      target.createChecked(attrs, Fragment.fromArray(selected.map(({ node }) => node))),
    );
  }
  const itemType = editor.schema.nodes[type === "taskList" ? "taskItem" : "listItem"];
  const paragraphType = editor.schema.nodes.paragraph;
  if (!itemType || !paragraphType) return null;
  const output: ProseMirrorNode[] = [];
  let pending: ProseMirrorNode[] = [];
  const flush = () => {
    if (pending.length) output.push(target.createChecked(attrs, Fragment.fromArray(pending)));
    pending = [];
  };
  for (const { node } of selected) {
    if (textTypes.has(node.type.name)) {
      const paragraph = paragraphType.createChecked(
        convertedAttrs(node, paragraphType),
        node.content,
        node.marks,
      );
      pending.push(itemType.createChecked(null, paragraph));
    } else if (listTypes.has(node.type.name)) {
      flush();
      const items: ProseMirrorNode[] = [];
      node.forEach((item) =>
        items.push(
          itemType.createChecked(convertedAttrs(item, itemType), item.content, item.marks),
        ),
      );
      output.push(
        target.createChecked(convertedAttrs(node, target, attrs), Fragment.fromArray(items)),
      );
    } else return null;
  }
  flush();
  return Fragment.fromArray(output);
}

export function canConvertSelectedBlocks(
  editor: Editor | null,
  type: string,
  attrs: Attrs = {},
): boolean {
  if (!writableSelection(editor)) return false;
  try {
    const content = conversion(editor, type, attrs);
    const blocks = getSelectedBlocks(editor);
    return Boolean(
      content &&
      !content.eq(editor.state.selection.content().content) &&
      editor.state.selection.$from.parent.canReplace(
        blocks[0]!.index,
        blocks.at(-1)!.index + 1,
        content,
      ),
    );
  } catch {
    return false;
  }
}

export function convertSelectedBlocks(
  editor: Editor | null,
  type: string,
  attrs: Attrs = {},
): boolean {
  if (!writableSelection(editor)) return false;
  try {
    const content = conversion(editor, type, attrs);
    const blocks = getSelectedBlocks(editor);
    if (
      !content ||
      !editor.state.selection.$from.parent.canReplace(
        blocks[0]!.index,
        blocks.at(-1)!.index + 1,
        content,
      )
    )
      return false;
    const selection = editor.state.selection;
    const { from, to } = selection;
    const transaction = editor.state.tr.replaceWith(from, to, content);
    transaction.setSelection(
      selection instanceof NodeSelection
        ? content.childCount === 1 && NodeSelection.isSelectable(content.firstChild!)
          ? NodeSelection.create(transaction.doc, from)
          : nearSelection(transaction.doc, from + 1)
        : resolveRange(transaction.doc, from, from + content.size, false),
    );
    return commit(editor, transaction);
  } catch {
    return false;
  }
}
