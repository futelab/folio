import type { Editor } from "@tiptap/core";

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
  "table",
  "details",
  '[data-type="details"]',
  ".folio-callout",
  ".folio-bookmark",
  ".folio-image",
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

  while (current && current !== root) {
    if (current.matches(FOLIO_BLOCK_SELECTOR)) {
      block = current;
    }

    current = current.parentElement;
  }

  return block;
}

export function getCurrentBlockElement(editor: Editor | null): HTMLElement | null {
  const selection = editor?.state.selection;

  if (!editor || !selection) return null;

  const node = editor.view.domAtPos(selection.from).node;

  return findBlockElement(node, editor.view.dom);
}

export function getBlockAnchor(element: HTMLElement): FolioBlockAnchor {
  return {
    element,
    rect: element.getBoundingClientRect(),
  };
}

export function focusBlockElement(
  editor: Editor | null,
  element: HTMLElement | null,
): boolean {
  if (!editor || !element || !editor.view.dom.contains(element)) return false;

  try {
    const position = editor.view.posAtDOM(element, 0);

    return editor.chain().focus().setTextSelection(position).run();
  } catch {
    editor.commands.focus();
    return false;
  }
}
