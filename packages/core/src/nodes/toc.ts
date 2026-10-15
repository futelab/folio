import { mergeAttributes, Node } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { createFolioMessages } from "../i18n";

export interface FolioTableOfContentsMessages {
  label: string;
  empty: string;
  more: string;
}

export interface FolioTableOfContentsOptions {
  messages: FolioTableOfContentsMessages;
  /** Maximum visible headings per directory, capped at 500. */
  maxEntries: number;
}

interface HeadingEntry {
  position: number;
  level: number;
  text: string;
  id: string;
}
const maximumTocEntries = 500;
const outlines = new WeakMap<ProseMirrorNode, { headings: HeadingEntry[]; total: number }>();

function outline(document: ProseMirrorNode) {
  const cached = outlines.get(document);
  if (cached) return cached;
  const result: { headings: HeadingEntry[]; total: number } = { headings: [], total: 0 };
  document.descendants((node, position) => {
    if (node.type.name !== "heading") return;
    const text = node.textContent.trim();
    if (!text) return false;
    result.total += 1;
    if (result.headings.length < maximumTocEntries) {
      const id = node.attrs.id || node.attrs["data-toc-id"];
      result.headings.push({
        position,
        level: Math.max(1, Math.min(3, Number(node.attrs.level) || 1)),
        text,
        id: typeof id === "string" && id ? id : `folio-heading-${position}`,
      });
    }
    return false;
  });
  outlines.set(document, result);
  return result;
}

export const FolioTableOfContentsNode = Node.create<FolioTableOfContentsOptions>({
  name: "tableOfContents",

  addOptions() {
    return { messages: createFolioMessages().ui.tableOfContents, maxEntries: 100 };
  },

  group: "block",

  atom: true,

  selectable: true,

  addNodeView() {
    const messages = this.options.messages;
    const maxEntries =
      Number.isSafeInteger(this.options.maxEntries) && this.options.maxEntries > 0
        ? Math.min(this.options.maxEntries, maximumTocEntries)
        : 100;
    return ({ editor, view, node }) => {
      // DOM access belongs exclusively to the mounted editor's NodeView, never schema/SSR creation.
      const ownerDocument = view.dom.ownerDocument;
      const dom = ownerDocument.createElement("nav");
      dom.className = "folio-toc";
      dom.setAttribute("data-folio-toc", "");
      dom.setAttribute("aria-label", messages.label);
      dom.contentEditable = "false";
      let destroyed = false;
      let previousDocument: ProseMirrorNode | undefined;
      const render = () => {
        if (destroyed || previousDocument === editor.state.doc) return;
        previousDocument = editor.state.doc;
        const { headings, total } = outline(previousDocument);
        const title = ownerDocument.createElement("span");
        title.className = "folio-toc__title";
        title.textContent = messages.label;
        const children: HTMLElement[] = [title];
        for (const heading of headings.slice(0, maxEntries)) {
          const link = ownerDocument.createElement("a");
          link.className = `folio-toc__item folio-toc__item--level-${heading.level}`;
          link.setAttribute("href", `#${heading.id}`);
          link.setAttribute("data-folio-heading-pos", String(heading.position));
          link.textContent = heading.text;
          children.push(link);
        }
        if (!total || total > maxEntries) {
          const note = ownerDocument.createElement("span");
          note.className = total ? "folio-toc__more" : "folio-toc__empty";
          note.textContent = total
            ? messages.more.replace("{count}", String(total - maxEntries))
            : messages.empty;
          children.push(note);
        }
        dom.replaceChildren(...children);
      };
      const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
        if (transaction.docChanged) render();
      };
      const onClick = (event: MouseEvent) => {
        const target = event.target as globalThis.Node | null;
        const element = target?.nodeType === 1 ? (target as Element) : target?.parentElement;
        const link = element?.closest<HTMLAnchorElement>("a[data-folio-heading-pos]");
        if (!link || !dom.contains(link)) return;
        event.preventDefault();
        event.stopPropagation();
        if (destroyed || editor.isDestroyed) return;
        const position = Number(link.getAttribute("data-folio-heading-pos"));
        if (
          !Number.isSafeInteger(position) ||
          view.state.doc.nodeAt(position)?.type.name !== "heading"
        )
          return;
        view.dispatch(
          view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(position + 1))),
        );
        view.focus();
        const headingDOM = view.nodeDOM(position) as HTMLElement | null;
        headingDOM?.scrollIntoView?.({ block: "start", inline: "nearest" });
      };
      dom.addEventListener("click", onClick);
      editor.on("transaction", onTransaction);
      render();
      return {
        dom,
        update: (next) => {
          if (next.type !== node.type) return false;
          render();
          return true;
        },
        stopEvent: (event) => !!event.target && dom.contains(event.target as globalThis.Node),
        // An atomic view has no contentDOM; its own derived UI mutations are never document edits.
        ignoreMutation: () => true,
        destroy: () => {
          destroyed = true;
          editor.off("transaction", onTransaction);
          dom.removeEventListener("click", onClick);
        },
      };
    };
  },

  parseHTML() {
    return [{ tag: "nav[data-folio-toc]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "nav",
      mergeAttributes(HTMLAttributes, {
        "data-folio-toc": "",
        class: "folio-toc",
      }),
      "Table of contents",
    ];
  },
});
