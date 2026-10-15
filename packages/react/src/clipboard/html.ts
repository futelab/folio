import type { Schema } from "@tiptap/pm/model";
import { defaultFolioDocumentLimits, sanitizeFolioUrl } from "@futelab/folio-core/browser";
import { FolioClipboardError } from "./types";

const inertTags = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "base",
  "meta",
  "link",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "template",
  "svg",
  "math",
]);
const neutralTags = new Set([
  "div",
  "span",
  "section",
  "article",
  "main",
  "header",
  "footer",
  "font",
  "center",
  "html",
  "body",
  "o:p",
]);

/** Parse in an unattached template: scripts and resource-bearing elements remain inert. */
export function cleanClipboardHTML(html: string, ownerDocument: Document, schema: Schema) {
  if (html.length > defaultFolioDocumentLimits.maxTextLength * 4)
    throw new FolioClipboardError("size-limit", "Clipboard HTML exceeds the size limit.");
  const template = ownerDocument.createElement("template");
  template.innerHTML = html;
  const selectors = [...Object.values(schema.nodes), ...Object.values(schema.marks)].flatMap(
    (type) => type.spec.parseDOM?.flatMap((rule) => (rule.tag ? [rule.tag] : [])) ?? [],
  );
  let downgraded = false;
  let unsafe = false;
  let count = 0;
  const pending: Array<{ node: ChildNode; depth: number }> = Array.from(
    template.content.childNodes,
    (node) => ({ node, depth: 1 }),
  );
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (
      ++count > defaultFolioDocumentLimits.maxNodes ||
      depth > defaultFolioDocumentLimits.maxDepth
    )
      throw new FolioClipboardError("size-limit", "Clipboard HTML is too complex.");
    if (node.nodeType !== 1) continue;
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    if (inertTags.has(tag)) {
      element.remove();
      if (!["style", "meta", "link"].includes(tag)) downgraded = true;
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (
        name.startsWith("on") ||
        ["srcdoc", "formaction", "autofocus", "contenteditable"].includes(name)
      ) {
        element.removeAttribute(attribute.name);
        unsafe = true;
      } else if (["href", "src", "data-url", "poster", "xlink:href"].includes(name)) {
        const value = sanitizeFolioUrl(attribute.value, {
          kind: name === "src" || name === "poster" ? "image" : "link",
        });
        if (value) element.setAttribute(attribute.name, value);
        else {
          element.removeAttribute(attribute.name);
          unsafe = true;
        }
      } else if (name === "srcset" || name === "background") {
        // These alternate resource URLs are outside the Folio schema and URL policy.
        element.removeAttribute(attribute.name);
      } else if (
        name === "style" &&
        /(?:url\s*\(|expression\s*\(|@import|behavior\s*:)/i.test(attribute.value)
      ) {
        element.removeAttribute(attribute.name);
        unsafe = true;
      }
    }
    const declaredType = element.getAttribute("data-type");
    const unsupportedType =
      declaredType && !schema.nodes[declaredType] && !schema.marks[declaredType];
    const known =
      !unsupportedType &&
      (neutralTags.has(tag) ||
        selectors.some((selector) => {
          try {
            return element.matches(selector);
          } catch {
            return false;
          }
        }));
    if (!known) {
      downgraded = true;
      if (!element.textContent?.trim() && !element.children.length) {
        element.replaceWith(ownerDocument.createTextNode(`[Unsupported content: ${tag}]`));
        continue;
      }
    }
    // Word's spans, mso styles, classes, and namespaces are interpreted only by
    // registered schema parse rules. Unsupported wrappers retain their children.
    for (const child of Array.from(element.childNodes))
      pending.push({ node: child, depth: depth + 1 });
  }
  return { content: template.content, html: template.innerHTML, downgraded, unsafe };
}
