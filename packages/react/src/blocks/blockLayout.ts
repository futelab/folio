import type { Editor } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { Selection } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import { isFolioColumnWidth } from "@futelab/folio-core/browser";
import { BlockSelection, getSelectedBlocks } from "./blockSelection";

export interface LayoutBlockRange {
  from: number;
  to: number;
}
export interface LayoutDestination {
  parentPos: number | null;
  index: number;
}
export interface LayoutBlock extends LayoutBlockRange {
  node: ProseMirrorNode;
  pos: number;
  parentPos: number | null;
  index: number;
  depth: number;
}
export interface LayoutContainer {
  node: ProseMirrorNode;
  pos: number | null;
  depth: number;
  contentFrom: number;
  contentTo: number;
}

const lists = new Set(["bulletList", "orderedList", "taskList"]);
const items = new Set(["listItem", "taskItem"]);
const containers = new Set([
  "doc",
  "callout",
  "blockquote",
  "detailsContent",
  "column",
  ...lists,
  ...items,
]);
const structural = new Set([
  "column",
  "detailsSummary",
  "detailsContent",
  "tableRow",
  "tableCell",
  "tableHeader",
]);

function editable(editor: Editor | null): editor is Editor {
  return Boolean(editor && !editor.isDestroyed && editor.isEditable);
}

export function getBlockContainers(editor: Editor | null): LayoutContainer[] {
  if (!editor || editor.isDestroyed) return [];
  const doc = editor.state.doc;
  const output: LayoutContainer[] = [
    { node: doc, pos: null, depth: 0, contentFrom: 0, contentTo: doc.content.size },
  ];
  doc.descendants((node, pos) => {
    if (containers.has(node.type.name))
      output.push({
        node,
        pos,
        depth: doc.resolve(pos).depth + 1,
        contentFrom: pos + 1,
        contentTo: pos + node.nodeSize - 1,
      });
  });
  return output;
}

function movable(node: ProseMirrorNode, parent: ProseMirrorNode): boolean {
  return node.isBlock && !structural.has(node.type.name) && containers.has(parent.type.name);
}

/** Resolve an exact node start or the nearest movable ancestor of a text position. */
export function resolveLayoutBlock(editor: Editor | null, position: number): LayoutBlock | null {
  if (!editor || editor.isDestroyed) return null;
  try {
    const resolved = editor.state.doc.resolve(position);
    const after = resolved.nodeAfter;
    if (after && movable(after, resolved.parent))
      return {
        node: after,
        pos: position,
        from: position,
        to: position + after.nodeSize,
        parentPos: resolved.depth ? resolved.before(resolved.depth) : null,
        index: resolved.index(),
        depth: resolved.depth + 1,
      };
    for (let depth = resolved.depth; depth > 0; depth -= 1) {
      const node = resolved.node(depth),
        parent = resolved.node(depth - 1);
      if (!movable(node, parent)) continue;
      const pos = resolved.before(depth);
      return {
        node,
        pos,
        from: pos,
        to: pos + node.nodeSize,
        parentPos: depth > 1 ? resolved.before(depth - 1) : null,
        index: resolved.index(depth - 1),
        depth,
      };
    }
  } catch {
    /* Invalid or stale positions are not destinations. */
  }
  return null;
}

interface SourceRange extends LayoutBlockRange {
  parent: ProseMirrorNode;
  parentPos: number | null;
  fromIndex: number;
  toIndex: number;
  nodes: ProseMirrorNode[];
}

function sourceRange(doc: ProseMirrorNode, range: LayoutBlockRange): SourceRange | null {
  const { from, to } = range;
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from >= to ||
    from < 0 ||
    to > doc.content.size
  )
    return null;
  const start = doc.resolve(from),
    end = doc.resolve(to);
  if (
    !start.sameParent(end) ||
    !containers.has(start.parent.type.name) ||
    start.posAtIndex(start.index()) !== from ||
    end.posAtIndex(end.index()) !== to
  )
    return null;
  const nodes: ProseMirrorNode[] = [];
  for (let index = start.index(); index < end.index(); index += 1) {
    const node = start.parent.child(index);
    if (!movable(node, start.parent)) return null;
    nodes.push(node);
  }
  return {
    from,
    to,
    parent: start.parent,
    parentPos: start.depth ? start.before(start.depth) : null,
    fromIndex: start.index(),
    toIndex: end.index(),
    nodes,
  };
}

function contentStart(parentPos: number | null): number {
  return parentPos === null ? 0 : parentPos + 1;
}
function childOffset(parent: ProseMirrorNode, index: number): number {
  let offset = 0;
  for (let child = 0; child < index; child += 1) offset += parent.child(child).nodeSize;
  return offset;
}

function deletionFiller(editor: Editor, source: SourceRange): Fragment {
  const remaining: ProseMirrorNode[] = [];
  source.parent.forEach((node, _pos, index) => {
    if (index < source.fromIndex || index >= source.toIndex) remaining.push(node);
  });
  if (!remaining.length) {
    if (lists.has(source.parent.type.name)) {
      const item =
        editor.schema.nodes[
          source.parent.type.name === "taskList" ? "taskItem" : "listItem"
        ]?.createAndFill();
      if (!item) throw new RangeError("Cannot leave an empty list");
      return Fragment.from(item);
    }
    const paragraph = editor.schema.nodes.paragraph?.createAndFill();
    if (!paragraph) throw new RangeError("Cannot leave an empty block container");
    return Fragment.from(paragraph);
  }
  if (
    items.has(source.parent.type.name) &&
    source.fromIndex === 0 &&
    remaining[0]!.type.name !== "paragraph"
  ) {
    const paragraph = editor.schema.nodes.paragraph?.createAndFill();
    if (!paragraph) throw new RangeError("A list item requires a paragraph");
    return Fragment.from(paragraph);
  }
  return Fragment.empty;
}

function destinationContent(
  editor: Editor,
  source: SourceRange,
  target: ProseMirrorNode,
  index: number,
): Fragment | null {
  let nodes = source.nodes;
  if (lists.has(target.type.name)) {
    const itemType = editor.schema.nodes[target.type.name === "taskList" ? "taskItem" : "listItem"];
    if (!itemType) return null;
    nodes = nodes.map((node) => {
      if (items.has(node.type.name)) {
        if (node.type !== itemType)
          throw new RangeError("Moving across task/bullet kinds would discard item attributes");
        return node;
      }
      const content =
        node.type.name === "paragraph"
          ? Fragment.from(node)
          : Fragment.fromArray([editor.schema.nodes.paragraph!.create(), node]);
      return itemType.createChecked(null, content);
    });
  } else if (nodes.some((node) => items.has(node.type.name))) {
    if (!lists.has(source.parent.type.name)) return null;
    const attrs: Record<string, unknown> = { ...source.parent.attrs };
    for (const name of ["folioBlockId", "id", "data-toc-id"]) if (name in attrs) attrs[name] = null;
    if (source.parent.type.name === "orderedList")
      attrs.start = Number(attrs.start ?? 1) + source.fromIndex;
    nodes = [source.parent.type.createChecked(attrs, Fragment.fromArray(nodes))];
  }
  if (items.has(target.type.name) && index === 0 && nodes[0]?.type.name !== "paragraph")
    nodes = [editor.schema.nodes.paragraph!.create(), ...nodes];
  return Fragment.fromArray(nodes);
}

function moveTransaction(
  editor: Editor,
  range: LayoutBlockRange,
  destination: LayoutDestination,
): Transaction | null {
  const doc = editor.state.doc,
    source = sourceRange(doc, range);
  const target = destination.parentPos === null ? doc : doc.nodeAt(destination.parentPos);
  if (
    !source ||
    !target ||
    !containers.has(target.type.name) ||
    !Number.isInteger(destination.index) ||
    destination.index < 0 ||
    destination.index > target.childCount
  )
    return null;
  if (
    destination.parentPos !== null &&
    destination.parentPos >= source.from &&
    destination.parentPos < source.to
  )
    return null;
  const sameParent = source.parentPos === destination.parentPos;
  if (sameParent && destination.index >= source.fromIndex && destination.index <= source.toIndex)
    return null;
  const filler = deletionFiller(editor, source);
  if (!source.parent.canReplace(source.fromIndex, source.toIndex, filler)) return null;
  const transaction = editor.state.tr.replaceWith(source.from, source.to, filler);
  const mappedParentPos =
    destination.parentPos === null ? null : transaction.mapping.map(destination.parentPos, -1);
  const currentTarget =
    mappedParentPos === null ? transaction.doc : transaction.doc.nodeAt(mappedParentPos);
  if (!currentTarget || currentTarget.type !== target.type) return null;
  const index =
    sameParent && destination.index > source.toIndex
      ? destination.index - (source.toIndex - source.fromIndex) + filler.childCount
      : destination.index;
  const content = destinationContent(editor, source, currentTarget, index);
  if (!content || !currentTarget.canReplace(index, index, content)) return null;
  const position = contentStart(mappedParentPos) + childOffset(currentTarget, index);
  transaction.insert(position, content);
  transaction.doc.check();
  if (transaction.doc.eq(doc)) return null;
  if (mappedParentPos === null) {
    const last = position + content.size - content.lastChild!.nodeSize;
    transaction.setSelection(BlockSelection.create(transaction.doc, position, last));
  } else
    transaction.setSelection(
      Selection.near(transaction.doc.resolve(Math.min(position + 1, transaction.doc.content.size))),
    );
  return transaction;
}

function commit(editor: Editor, transaction: Transaction): boolean {
  if (!editable(editor) || !transaction.docChanged || transaction.doc.eq(editor.state.doc))
    return false;
  transaction.doc.check();
  const before = editor.state.doc;
  editor.view.dispatch(closeHistory(transaction));
  if (editor.state.doc === before) return false;
  editor.view.dispatch(closeHistory(editor.state.tr));
  return true;
}

export function canMoveBlockRange(
  editor: Editor | null,
  range: LayoutBlockRange,
  destination: LayoutDestination,
): boolean {
  if (!editable(editor)) return false;
  try {
    return Boolean(moveTransaction(editor, range, destination));
  } catch {
    return false;
  }
}
export function moveBlockRange(
  editor: Editor | null,
  range: LayoutBlockRange,
  destination: LayoutDestination,
): boolean {
  if (!editable(editor)) return false;
  try {
    const transaction = moveTransaction(editor, range, destination);
    return transaction ? commit(editor, transaction) : false;
  } catch {
    return false;
  }
}

function currentRange(editor: Editor): LayoutBlockRange | null {
  const selected = getSelectedBlocks(editor);
  if (selected.length)
    return { from: selected[0]!.pos, to: selected.at(-1)!.pos + selected.at(-1)!.node.nodeSize };
  return resolveLayoutBlock(editor, editor.state.selection.from);
}

/** Distributes selected blocks in document order; extra blocks stay in the last column. */
export function createColumns(
  editor: Editor | null,
  count = 2,
  widths?: readonly number[],
): boolean {
  if (![2, 3].includes(count)) return false;
  const weights = widths ?? Array.from({ length: count }, () => 1);
  if (
    !editable(editor) ||
    ![2, 3].includes(count) ||
    weights.length !== count ||
    !weights.every(isFolioColumnWidth)
  )
    return false;
  try {
    const range = currentRange(editor),
      columnsType = editor.schema.nodes.columns,
      columnType = editor.schema.nodes.column;
    if (!range || !columnsType || !columnType) return false;
    const source = sourceRange(editor.state.doc, range);
    if (!source || lists.has(source.parent.type.name)) return false;
    const grouped: ProseMirrorNode[][] = Array.from({ length: count }, () => []);
    source.nodes.forEach((node, index) => grouped[Math.min(index, count - 1)]!.push(node));
    const columns = grouped.map((children, index) =>
      columnType.createChecked(
        { width: weights[index] },
        Fragment.fromArray(children.length ? children : [editor.schema.nodes.paragraph!.create()]),
      ),
    );
    const layout = columnsType.createChecked(null, Fragment.fromArray(columns));
    if (!source.parent.canReplace(source.fromIndex, source.toIndex, Fragment.from(layout)))
      return false;
    const transaction = editor.state.tr.replaceWith(source.from, source.to, layout);
    transaction.setSelection(
      source.parentPos === null
        ? BlockSelection.create(transaction.doc, source.from)
        : Selection.near(transaction.doc.resolve(source.from + 3)),
    );
    return commit(editor, transaction);
  } catch {
    return false;
  }
}

function columnsPosition(editor: Editor, position?: number): number | null {
  if (position !== undefined)
    return editor.state.doc.nodeAt(position)?.type.name === "columns" ? position : null;
  const from = editor.state.selection.from;
  if (editor.state.doc.nodeAt(from)?.type.name === "columns") return from;
  const resolved = editor.state.doc.resolve(from);
  for (let depth = resolved.depth; depth > 0; depth -= 1)
    if (resolved.node(depth).type.name === "columns") return resolved.before(depth);
  return null;
}

/** Linked structural anchors must be removed explicitly before unwrapping their containers. */
export function removeColumns(editor: Editor | null, position?: number): boolean {
  if (!editable(editor)) return false;
  try {
    const pos = columnsPosition(editor, position);
    if (pos === null) return false;
    const layout = editor.state.doc.nodeAt(pos)!;
    const children: ProseMirrorNode[] = [];
    if (layout.attrs.folioBlockId) return false;
    let linkedColumn = false;
    layout.forEach((column) => {
      if (column.attrs.folioBlockId) linkedColumn = true;
      column.forEach((node) => children.push(node));
    });
    if (linkedColumn) return false;
    const resolved = editor.state.doc.resolve(pos),
      content = Fragment.fromArray(children);
    if (!resolved.parent.canReplace(resolved.index(), resolved.index() + 1, content)) return false;
    const transaction = editor.state.tr.replaceWith(pos, pos + layout.nodeSize, content);
    transaction.setSelection(
      resolved.depth === 0
        ? BlockSelection.create(
            transaction.doc,
            pos,
            pos + content.size - children.at(-1)!.nodeSize,
          )
        : Selection.near(transaction.doc.resolve(pos + 1)),
    );
    return commit(editor, transaction);
  } catch {
    return false;
  }
}

export function setColumnWidths(
  editor: Editor | null,
  position: number,
  widths: readonly number[],
): boolean {
  if (!editable(editor)) return false;
  try {
    const layout = editor.state.doc.nodeAt(position);
    if (
      layout?.type.name !== "columns" ||
      widths.length !== layout.childCount ||
      !widths.every(isFolioColumnWidth)
    )
      return false;
    const transaction = editor.state.tr;
    layout.forEach((column, offset, index) => {
      if (column.attrs.width !== widths[index])
        transaction.setNodeMarkup(position + 1 + offset, undefined, {
          ...column.attrs,
          width: widths[index],
        });
    });
    return commit(editor, transaction);
  } catch {
    return false;
  }
}
