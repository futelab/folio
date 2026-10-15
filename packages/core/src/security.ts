export interface FolioUrlOptions {
  kind: "link" | "image";
  allowDataImage?: boolean;
}

const linkProtocols = new Set(["http:", "https:", "mailto:", "tel:"]);
const imageProtocols = new Set(["http:", "https:"]);
// oxlint-disable-next-line no-control-regex -- Reject control characters that browsers may erase while parsing URLs.
const controlCharacters = /[\u0000-\u001F\u007F]/;
const scheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/;
const rasterDataImage = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/]+={0,2}$/i;

/** Shared by editing, reading and serialization. SVG and protocol-relative URLs are intentionally excluded. */
export function sanitizeFolioUrl(value: unknown, options: FolioUrlOptions): string | undefined {
  if (typeof value !== "string") return undefined;
  const url = value.trim();
  if (!url || controlCharacters.test(url) || url.includes("\\") || url.startsWith("//"))
    return undefined;
  if (options.kind === "image" && options.allowDataImage !== false && rasterDataImage.test(url))
    return url;
  if (!scheme.test(url)) {
    try {
      new URL(url, "https://folio.local");
      return url;
    } catch {
      return undefined;
    }
  }
  try {
    const protocol = new URL(url).protocol;
    return (options.kind === "image" ? imageProtocols : linkProtocols).has(protocol)
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}
import type { FolioDocument, FolioJSONContent } from "./document";
import { FolioDocumentValidationError } from "./document";

/** Check URLs after validating the document's structure. Never changes the saved JSON. */
export function assertSafeDocumentUrls(document: FolioDocument): void {
  const pending: Array<{ node: FolioJSONContent; path: string }> = [{ node: document, path: "$" }];
  const check = (value: unknown, kind: "image" | "link", path: string) => {
    if (
      value !== null &&
      value !== undefined &&
      value !== "" &&
      !sanitizeFolioUrl(value, { kind })
    ) {
      throw new FolioDocumentValidationError([
        { code: "unsafe_url", path, message: "URL is not permitted by the Folio URL policy" },
      ]);
    }
  };
  while (pending.length) {
    const { node, path } = pending.pop()!;
    if (node.type === "image") check(node.attrs?.src, "image", `${path}.attrs.src`);
    if (node.type === "bookmark") check(node.attrs?.url, "link", `${path}.attrs.url`);
    node.marks?.forEach((mark, index) => {
      if (mark.type === "link")
        check(mark.attrs?.href, "link", `${path}.marks[${index}].attrs.href`);
    });
    node.content?.forEach((child, index) =>
      pending.push({ node: child, path: `${path}.content[${index}]` }),
    );
  }
}
