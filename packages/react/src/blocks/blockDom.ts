import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { BlockSelection } from "./blockSelection";

export interface FolioBlockAnchor {
  element: HTMLElement;
  rect: DOMRect;
  alignment?: "start";
}

export const FOLIO_BLOCK_SELECTOR = [
  "p",
  "h1",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "hr",
  "table",
  "details",
  '[data-type="details"]',
  ".folio-callout",
  "[data-folio-callout]",
  ".folio-bookmark",
  ".folio-image",
  "[data-folio-image]",
  "[data-folio-toc]",
  ".folio-toc",
  ".folio-columns",
  "[data-folio-columns]",
].join(",");

function targetElement(target: EventTarget | Node | null): HTMLElement | null {
  if (target instanceof HTMLElement) return target;
  if (target instanceof Text && target.parentElement) return target.parentElement;
  if (target instanceof Element && target.parentElement) return target.parentElement;

  return null;
}

function canonicalBlockElement(block: HTMLElement, root: HTMLElement): HTMLElement {
  if (!block.matches("p, h1, h2, h3")) return block;
  const container = block.parentElement;
  if (!container || container === root) return block;
  const detailsBody = container.matches('[data-type="detailsContent"], details');
  if (!detailsBody && !container.matches(".folio-callout, [data-folio-callout], blockquote"))
    return block;
  // A one-paragraph callout/quote reads as one visual block. Keep its padding
  // and text on the same grip target; multiple body blocks remain independent.
  const children = Array.from(container.children).filter(
    (child) =>
      !child.matches(".ProseMirror-widget, .ProseMirror-gapcursor, [data-folio-block-anchor]") &&
      !(detailsBody && child.matches("summary, button")),
  );
  if (children.length !== 1 || children[0] !== block) return block;
  // A single-body toggle shares one target across its summary, arrow and body.
  // Keep multiple body blocks independent, as with callouts and quotes.
  return detailsBody
    ? (container.closest<HTMLElement>('details, [data-type="details"]') ?? block)
    : container;
}

export function findBlockElement(
  target: EventTarget | Node | null,
  root: HTMLElement | null,
): HTMLElement | null {
  const element = targetElement(target);
  if (!element || !root?.contains(element)) return null;

  // Table cells and atomic media are not independent draggable blocks. List
  // text belongs to its item, so dragging it retains check state and sublists.
  const protectedBlock = element.closest<HTMLElement>("table, .folio-bookmark, [data-folio-image]");
  if (protectedBlock && root.contains(protectedBlock)) return protectedBlock;
  const item = element.closest<HTMLElement>("li");
  if (item && root.contains(item)) return item;
  const summary = element.closest("summary");
  const details = summary?.closest<HTMLElement>("details, [data-type='details']");
  if (details && root.contains(details)) return details;

  let current: HTMLElement | null = element;
  let block: HTMLElement | null = null;
  let topLevel: HTMLElement | null = null;

  while (current && current !== root) {
    if (!block && current.matches(FOLIO_BLOCK_SELECTOR)) {
      block = current;
    }
    if (
      current.parentElement === root &&
      !current.matches(".ProseMirror-gapcursor, .ProseMirror-widget")
    )
      topLevel = current;

    current = current.parentElement;
  }

  const resolved = block ?? topLevel;
  return resolved ? canonicalBlockElement(resolved, root) : null;
}

export function getCurrentBlockElement(editor: Editor | null): HTMLElement | null {
  if (!editor || editor.isDestroyed) return null;

  const selection = editor.state.selection;

  if (!selection) return null;

  const node =
    selection instanceof NodeSelection || selection instanceof BlockSelection
      ? editor.view.nodeDOM(selection.from)
      : editor.view.domAtPos(selection.from).node;

  return findBlockElement(node, editor.view.dom);
}

function isHiddenNode(node: Node): boolean {
  const parent = node instanceof HTMLElement ? node : (node.parentElement ?? node.parentNode);

  return parent instanceof HTMLElement && Boolean(parent.closest("[hidden]"));
}

function getDetailsSummaryAnchor(element: HTMLElement): HTMLElement | null {
  if (!element.matches('[data-type="details"], details')) return null;

  return element.querySelector("summary");
}

function getFirstTextLineRect(element: HTMLElement): DOMRect | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();

  while (currentNode) {
    if (!isHiddenNode(currentNode) && currentNode.textContent?.trim()) {
      const range = document.createRange();

      range.selectNodeContents(currentNode);

      const rect = Array.from(range.getClientRects()).find(
        (candidate) => candidate.width > 0 && candidate.height > 0,
      );

      range.detach();

      if (rect) return rect;
    }

    currentNode = walker.nextNode();
  }

  return null;
}

export function getBlockAnchor(element: HTMLElement): FolioBlockAnchor {
  const image = element.matches("img.folio-image")
    ? element
    : element.matches("[data-folio-image]")
      ? element.querySelector<HTMLElement>("img")
      : null;
  if (image) {
    const imageRect = image.getBoundingClientRect();
    // A pending or failed image may have no layout while its caption is still
    // visible. Keep the figure actionable until the image has a visual area.
    const anchorElement = imageRect.height > 0 || image === element ? image : element;
    return {
      element: anchorElement,
      rect: anchorElement === image ? imageRect : anchorElement.getBoundingClientRect(),
      alignment: "start",
    };
  }
  const anchorElement = getDetailsSummaryAnchor(element) ?? element;
  const firstLineRect = getFirstTextLineRect(anchorElement);

  return {
    element: anchorElement,
    rect: firstLineRect ?? anchorElement.getBoundingClientRect(),
  };
}

export function focusBlockElement(editor: Editor | null, element: HTMLElement | null): boolean {
  if (!editor || !element || !editor.view.dom.contains(element)) return false;

  try {
    const position = editor.view.posAtDOM(element, 0);

    return editor.chain().focus().setTextSelection(position).run();
  } catch {
    editor.commands.focus();
    return false;
  }
}
