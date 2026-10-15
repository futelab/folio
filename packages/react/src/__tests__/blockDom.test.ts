import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { createDefaultTiptapExtensions } from "@futelab/folio-core/browser";
import { findBlockElement, getBlockAnchor, getCurrentBlockElement } from "../blocks/blockDom";
import { getLayoutBlockPosition } from "../blocks/blockDrag";
const editors: Editor[] = [];
beforeEach(() => vi.spyOn(window, "scrollBy").mockImplementation(() => {}));
afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function fixture(html: string) {
  const root = document.createElement("div");
  root.className = "ProseMirror";
  root.innerHTML = html;
  document.body.append(root);
  return root;
}
describe("nested hover block identity", () => {
  it.each(["aside", "blockquote"])(
    "keeps a single paragraph's padding and text on the same %s target",
    (tag) => {
      const root = fixture(
        `<${tag} class="${tag === "aside" ? "folio-callout" : ""}"><p><strong>Nested text</strong></p></${tag}>`,
      );
      const container = root.firstElementChild;
      for (const target of [
        container,
        root.querySelector("p"),
        root.querySelector("strong"),
        root.querySelector("strong")!.firstChild,
      ])
        expect(findBlockElement(target, root)).toBe(container);
    },
  );
  it.each(["h1", "h2", "h3"])(
    "canonicalizes a single %s despite ProseMirror anchor widgets",
    (tag) => {
      const root = fixture(
        `<aside data-folio-callout><span class="ProseMirror-widget" data-folio-block-anchor></span><${tag}><em>Heading</em></${tag}><div class="ProseMirror-gapcursor"></div></aside>`,
      );
      expect(findBlockElement(root.querySelector("em"), root)).toBe(root.querySelector("aside"));
      expect(findBlockElement(root.querySelector("[data-folio-block-anchor]"), root)).toBe(
        root.querySelector("aside"),
      );
    },
  );
  it("picks the nearest block within a multiple-block compound container", () => {
    const root = fixture(
      '<aside class="folio-callout"><p><strong>Nested text</strong></p><p>Second block</p></aside>',
    );
    expect(findBlockElement(root.querySelector("strong"), root)).toBe(root.querySelector("p"));
    expect(findBlockElement(root.querySelector("aside"), root)).toBe(root.querySelector("aside"));
  });
  it("does not collapse nested containers, lists, or multiple quote paragraphs into their outer container", () => {
    const root = fixture(
      '<aside class="folio-callout"><blockquote><p><strong>Quote</strong></p></blockquote></aside><blockquote><p>First</p><p><em>Second</em></p></blockquote><aside class="folio-callout"><ul><li><p>Item</p></li></ul></aside>',
    );
    expect(findBlockElement(root.querySelector("strong"), root)).toBe(
      root.querySelector("blockquote"),
    );
    expect(findBlockElement(root.querySelector("em"), root)).toBe(
      root.querySelector("em")!.parentElement,
    );
    expect(findBlockElement(root.querySelector("li p"), root)).toBe(root.querySelector("li"));
  });
  it.each(["callout", "blockquote"])(
    "uses one %s model target for hover, caret, node selection, dragging and actions",
    (type) => {
      const root = document.createElement("div");
      document.body.append(root);
      const editor = new Editor({
        element: root,
        extensions: createDefaultTiptapExtensions(),
        content: {
          type: "doc",
          content: [
            {
              type,
              content: [
                { type: "paragraph", content: [{ type: "text", text: "One visual block" }] },
              ],
            },
          ],
        },
      });
      editors.push(editor);
      const container = editor.view.dom.firstElementChild as HTMLElement;
      const paragraph = container.querySelector("p")!;
      editor.commands.setTextSelection(3);
      expect(getCurrentBlockElement(editor)).toBe(container);
      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 1)));
      expect(getCurrentBlockElement(editor)).toBe(container);
      for (const target of [container, paragraph, paragraph.firstChild]) {
        const resolved = findBlockElement(target, editor.view.dom);
        expect(resolved).toBe(container);
        expect(getLayoutBlockPosition(editor, resolved)).toMatchObject({
          pos: 0,
          node: editor.state.doc.firstChild,
        });
      }
    },
  );
  it("uses list items so check state and nested lists stay attached", () => {
    const root = fixture(
      "<ul><li><p><strong>Item</strong></p><ul><li><p>Nested</p></li></ul></li></ul>",
    );
    expect(findBlockElement(root.querySelector("strong"), root)).toBe(root.querySelector("li"));
    expect(findBlockElement(root.querySelector("ul ul p"), root)).toBe(
      root.querySelector("ul ul li"),
    );
  });
  it.each(["p", "h2"])("keeps a single toggle body %s on the summary's model target", (tag) => {
    const root = fixture(
      `<div data-type="details"><button></button><div><summary>Title</summary><div data-type="detailsContent"><span class="ProseMirror-widget"></span><${tag}><strong>Body</strong></${tag}></div></div></div>`,
    );
    const details = root.firstElementChild;
    for (const target of [
      details,
      root.querySelector("button"),
      root.querySelector("summary"),
      root.querySelector('[data-type="detailsContent"]'),
      root.querySelector("strong"),
      root.querySelector("strong")!.firstChild,
    ])
      expect(findBlockElement(target, root)).toBe(details);
  });
  it("preserves independent paragraphs and nested lists in a multi-block toggle", () => {
    const root = fixture(
      '<div data-type="details"><button></button><div><summary>Title</summary><div data-type="detailsContent"><p><strong>First</strong></p><p>Second</p><ul><li><p>Nested list</p></li></ul></div></div></div>',
    );
    expect(findBlockElement(root.querySelector("strong"), root)).toBe(root.querySelector("p"));
    expect(findBlockElement(root.querySelector("li p"), root)).toBe(root.querySelector("li"));
    expect(findBlockElement(root.querySelector("summary"), root)).toBe(root.firstElementChild);
  });
  it("resolves toggle body hover and both caret and node selections to the whole single-body toggle", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const editor = new Editor({
      element: root,
      extensions: createDefaultTiptapExtensions(),
      content: {
        type: "doc",
        content: [
          {
            type: "details",
            attrs: { open: true },
            content: [
              { type: "detailsSummary", content: [{ type: "text", text: "Title" }] },
              {
                type: "detailsContent",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Body" }] }],
              },
            ],
          },
        ],
      },
    });
    editors.push(editor);
    const details = editor.view.dom.querySelector<HTMLElement>('[data-type="details"]')!;
    const paragraph = details.querySelector("p")!;
    let paragraphPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "paragraph") paragraphPos = pos;
    });
    editor.commands.setTextSelection(paragraphPos + 1);
    expect(getCurrentBlockElement(editor)).toBe(details);
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, paragraphPos)),
    );
    expect(getCurrentBlockElement(editor)).toBe(details);
    expect(
      getLayoutBlockPosition(editor, findBlockElement(paragraph, editor.view.dom)),
    ).toMatchObject({
      pos: 0,
      node: editor.state.doc.firstChild,
    });
  });
  it("keeps tables, atomic media and toggle summaries whole", () => {
    const root = fixture(
      '<table><tbody><tr><td><p>Cell</p></td></tr></tbody></table><figure data-folio-image><img src="/a.png"><figcaption>Caption</figcaption></figure><details><summary>Title</summary><p>Body</p></details>',
    );
    expect(findBlockElement(root.querySelector("td p"), root)).toBe(root.querySelector("table"));
    expect(findBlockElement(root.querySelector("figcaption"), root)).toBe(
      root.querySelector("figure"),
    );
    expect(findBlockElement(root.querySelector("summary"), root)).toBe(
      root.querySelector("details"),
    );
    expect(findBlockElement(root.querySelector("details p"), root)).toBe(
      root.querySelector("details"),
    );
  });
});

describe("media block anchors", () => {
  it("keeps a visible caption's figure actionable while the image has no height", () => {
    const root = fixture(
      '<figure data-folio-image><img class="folio-image" alt=""><figcaption>Still visible</figcaption></figure>',
    );
    const figure = root.querySelector("figure")!;
    const image = root.querySelector("img")!;
    vi.spyOn(image, "getBoundingClientRect").mockReturnValue(new DOMRect(120, 240, 0, 0));
    const rect = new DOMRect(120, 240, 600, 32);
    vi.spyOn(figure, "getBoundingClientRect").mockReturnValue(rect);
    expect(getBlockAnchor(figure)).toEqual({ element: figure, rect, alignment: "start" });
  });
  it.each([true, false])(
    "anchors captioned=%s media to the image without measuring caption text",
    (captioned) => {
      const root = fixture(
        captioned
          ? '<figure data-folio-image><img class="folio-image"><figcaption>Caption at the bottom</figcaption></figure>'
          : '<img class="folio-image">',
      );
      const block = root.firstElementChild as HTMLElement;
      const image = root.querySelector("img")!;
      const rect = new DOMRect(120, 240, 600, 400);
      vi.spyOn(image, "getBoundingClientRect").mockReturnValue(rect);
      const textMeasurement = vi.spyOn(document, "createRange");
      expect(getBlockAnchor(block)).toEqual({ element: image, rect, alignment: "start" });
      expect(textMeasurement).not.toHaveBeenCalled();
    },
  );
});
