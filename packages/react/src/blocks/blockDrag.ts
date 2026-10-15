import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { TextSelection } from "@tiptap/pm/state";

export interface BlockPosition {
  node: ProseMirrorNode;
  pos: number;
  element: HTMLElement;
}

export interface BlockDropTarget {
  block: BlockPosition;
  placement: "before" | "after";
  top: number;
  left: number;
  width: number;
}

// Read model positions instead of counting DOM children: ProseMirror decorations
// and node-view wrappers need not correspond one-to-one with document children.
export function getTopLevelBlocks(editor: Editor | null): BlockPosition[] {
  if (!editor || editor.isDestroyed) return [];
  const root = editor.view.dom;
  const blocks: BlockPosition[] = [];
  editor.state.doc.forEach((node, pos) => {
    const dom = editor.view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return;
    let element: HTMLElement = dom;
    while (element.parentElement && element.parentElement !== root) {
      element = element.parentElement;
    }
    if (element.parentElement === root) blocks.push({ node, pos, element });
  });
  return blocks;
}

export function getTopLevelBlockPosition(
  editor: Editor | null,
  block: HTMLElement | null,
): BlockPosition | null {
  if (!block) return null;
  return (
    getTopLevelBlocks(editor).find(({ element }) => element === block || element.contains(block)) ??
    null
  );
}

export function getDocumentInsertPosition(
  source: Pick<BlockPosition, "pos" | "node">,
  target: Pick<BlockPosition, "pos" | "node">,
  placement: "before" | "after",
): number | null {
  const position = placement === "after" ? target.pos + target.node.nodeSize : target.pos;
  const sourceEnd = source.pos + source.node.nodeSize;
  if (position >= source.pos && position <= sourceEnd) return null;
  return position > source.pos ? position - source.node.nodeSize : position;
}

export function getBlockDropTarget(
  blocks: BlockPosition[],
  source: BlockPosition,
  clientY: number,
): BlockDropTarget | null {
  if (!blocks.length) return null;
  // Full block bounds are intentional: a table or a multiline paragraph is
  // moved as a whole, regardless of the text line currently under the pointer.
  let low = 0;
  let high = blocks.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (blocks[middle]!.element.getBoundingClientRect().bottom < clientY) low = middle + 1;
    else high = middle;
  }
  const block = blocks[low]!;
  const rect = block.element.getBoundingClientRect();
  const placement = clientY > rect.top + rect.height / 2 ? "after" : "before";
  if (getDocumentInsertPosition(source, block, placement) === null) return null;
  const boundary = low + (placement === "after" ? 1 : 0);
  const before = blocks[boundary - 1]?.element.getBoundingClientRect();
  const after = blocks[boundary]?.element.getBoundingClientRect();
  const top = before && after ? (before.bottom + after.top) / 2 : (after?.top ?? before!.bottom);
  return { block, placement, top, left: rect.left, width: rect.width };
}

export function moveBlock(
  editor: Editor | null,
  sourceBlock: HTMLElement | null,
  targetBlock: HTMLElement | null,
  placement: "before" | "after",
  scrollIntoView = true,
): boolean {
  if (!editor?.isEditable || editor.isDestroyed) return false;
  const source = getTopLevelBlockPosition(editor, sourceBlock);
  const target = getTopLevelBlockPosition(editor, targetBlock);
  if (!source || !target) return false;
  const position = getDocumentInsertPosition(source, target, placement);
  if (position === null) return false;
  const transaction = closeHistory(editor.state.tr)
    .delete(source.pos, source.pos + source.node.nodeSize)
    .insert(position, source.node);
  transaction.setSelection(
    TextSelection.near(
      transaction.doc.resolve(Math.min(position + 1, transaction.doc.content.size)),
    ),
  );
  editor.view.dispatch(scrollIntoView ? transaction.scrollIntoView() : transaction);
  // Separate subsequent typing from this move as well as the preceding edit.
  editor.view.dispatch(closeHistory(editor.state.tr));
  editor.view.dom.focus({ preventScroll: !scrollIntoView });
  return true;
}

export function getEdgeScrollSpeed(pointer: number, start: number, end: number): number {
  const edge = Math.min(64, (end - start) / 4);
  if (edge <= 0 || pointer < start - 24 || pointer > end + 24) return 0;
  const direction = pointer < start + edge ? -1 : pointer > end - edge ? 1 : 0;
  if (!direction) return 0;
  const distance = direction < 0 ? pointer - start : end - pointer;
  return direction * Math.ceil(18 * Math.min(1, Math.max(0, 1 - distance / edge)));
}

export function scrollBlockDrag(root: HTMLElement, clientY: number): boolean {
  const ownerWindow = root.ownerDocument.defaultView;
  if (!ownerWindow) return false;
  let visibleTop = 0;
  let visibleBottom = ownerWindow.innerHeight;
  const containers: HTMLElement[] = [];
  for (let element: HTMLElement | null = root; element; element = element.parentElement) {
    const style = ownerWindow.getComputedStyle(element);
    if (!/(auto|scroll|overlay)/.test(style.overflowY)) continue;
    const rect = element.getBoundingClientRect();
    visibleTop = Math.max(visibleTop, rect.top + element.clientTop);
    visibleBottom = Math.min(visibleBottom, rect.bottom - element.clientTop);
    if (element.scrollHeight > element.clientHeight) containers.push(element);
  }
  const speed = getEdgeScrollSpeed(clientY, visibleTop, visibleBottom);
  if (!speed) return false;
  for (const element of containers) {
    const before = element.scrollTop;
    element.scrollTop += speed;
    if (element.scrollTop !== before) return true;
  }
  const before = ownerWindow.scrollY;
  ownerWindow.scrollBy({ top: speed, behavior: "instant" });
  return ownerWindow.scrollY !== before;
}
