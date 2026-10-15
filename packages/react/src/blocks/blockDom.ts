import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";

export interface FolioBlockAnchor {
  element: HTMLElement;
  rect: DOMRect;
}

export const FOLIO_BLOCK_SELECTOR = [
  "p",
  "h1",
  "h2",
  "h3",
  "ul",
  "ol",
  "blockquote",
  "pre",
  "hr",
  "table",
  "details",
  '[data-type="details"]',
  ".folio-callout",
  ".folio-bookmark",
  ".folio-image",
  "[data-folio-image]",
  "[data-folio-toc]",
  ".folio-toc",
].join(",");

function targetElement(target: EventTarget | Node | null): HTMLElement | null {
  if (target instanceof HTMLElement) return target;
  if (target instanceof Text && target.parentElement) return target.parentElement;
  if (target instanceof Element && target.parentElement) return target.parentElement;

  return null;
}

export function findBlockElement(
  target: EventTarget | Node | null,
  root: HTMLElement | null,
): HTMLElement | null {
  const element = targetElement(target);
  if (!element || !root?.contains(element)) return null;

  let current: HTMLElement | null = element;
  let block: HTMLElement | null = null;
  let topLevel: HTMLElement | null = null;

  while (current && current !== root) {
    if (current.matches(FOLIO_BLOCK_SELECTOR)) {
      block = current;
    }
    if (
      current.parentElement === root &&
      !current.matches(".ProseMirror-gapcursor, .ProseMirror-widget")
    )
      topLevel = current;

    current = current.parentElement;
  }

  return block ?? topLevel;
}

export function getCurrentBlockElement(editor: Editor | null): HTMLElement | null {
  const selection = editor?.state.selection;

  if (!editor || !selection) return null;

  const node =
    selection instanceof NodeSelection
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
