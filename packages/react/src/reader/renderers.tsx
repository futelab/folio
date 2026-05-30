import type { ReactNode } from "react";
import type { JSONContent } from "@tiptap/core";
import type { FolioDocument } from "@futelab/folio-core/browser";

interface HeadingEntry {
  id: string;
  level: number;
  text: string;
  path: string;
}

interface RenderContext {
  headings: HeadingEntry[];
}

const anchorProtocols = new Set(["http:", "https:", "mailto:", "tel:"]);
const imageProtocols = new Set(["http:", "https:"]);
const dataImagePattern =
  /^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,[a-z0-9+/=]+$/i;
const schemePattern = /^[a-zA-Z][a-zA-Z\d+.-]*:/;
const controlCharacterPattern = /[\u0000-\u001F\u007F]/;

function getNodeText(node: JSONContent): string {
  if (node.type === "text") {
    return node.text ?? "";
  }

  return node.content?.map(getNodeText).join("") ?? "";
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isSafeRelativeUrl(value: string): boolean {
  if (
    value.startsWith("//") ||
    value.includes("\\") ||
    schemePattern.test(value) ||
    controlCharacterPattern.test(value)
  ) {
    return false;
  }

  try {
    new URL(value, "https://folio.local");
    return true;
  } catch {
    return false;
  }
}

function sanitizeUrl(
  value: unknown,
  allowedProtocols: Set<string>,
  options: { allowDataImage?: boolean } = {},
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed || controlCharacterPattern.test(trimmed)) {
    return undefined;
  }

  if (options.allowDataImage && dataImagePattern.test(trimmed)) {
    return trimmed;
  }

  if (isSafeRelativeUrl(trimmed)) {
    return trimmed;
  }

  try {
    const parsedUrl = new URL(trimmed);

    return allowedProtocols.has(parsedUrl.protocol) ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

function collectHeadings(node: JSONContent, path = "0", headings: HeadingEntry[] = []) {
  if (node.type === "heading") {
    const text = getNodeText(node);
    const baseId = slugify(text) || `heading-${headings.length + 1}`;
    let id = baseId;
    let suffix = 2;

    while (headings.some((heading) => heading.id === id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }

    headings.push({
      id,
      level: Number(node.attrs?.level ?? 1),
      text,
      path,
    });
  }

  node.content?.forEach((child, index) => {
    collectHeadings(child, `${path}-${index}`, headings);
  });

  return headings;
}

function renderChildren(
  content: JSONContent[] | undefined,
  context: RenderContext,
  path: string,
): ReactNode {
  return content?.map((child, index) => renderNode(child, context, `${path}-${index}`));
}

function renderText(node: JSONContent, key: string): ReactNode {
  let rendered: ReactNode = node.text ?? "";

  node.marks?.forEach((mark, index) => {
    const markKey = `${key}-mark-${index}`;

    if (mark.type === "bold") {
      rendered = <strong key={markKey}>{rendered}</strong>;
    } else if (mark.type === "italic") {
      rendered = <em key={markKey}>{rendered}</em>;
    } else if (mark.type === "code") {
      rendered = <code key={markKey}>{rendered}</code>;
    } else if (mark.type === "strike") {
      rendered = <del key={markKey}>{rendered}</del>;
    } else if (mark.type === "underline") {
      rendered = <u key={markKey}>{rendered}</u>;
    } else if (mark.type === "highlight") {
      const color =
        typeof mark.attrs?.color === "string" ? mark.attrs.color : undefined;

      rendered = (
        <mark key={markKey} style={color ? { backgroundColor: color } : undefined}>
          {rendered}
        </mark>
      );
    } else if (mark.type === "textStyle" && typeof mark.attrs?.color === "string") {
      rendered = (
        <span key={markKey} style={{ color: mark.attrs.color }}>
          {rendered}
        </span>
      );
    } else if (mark.type === "link") {
      const href = sanitizeUrl(mark.attrs?.href, anchorProtocols);

      rendered = href ? (
        <a href={href} key={markKey} rel="noreferrer" target="_blank">
          {rendered}
        </a>
      ) : (
        rendered
      );
    }
  });

  return rendered;
}

function renderHeading(node: JSONContent, context: RenderContext, path: string) {
  const id = context.headings.find((heading) => heading.path === path)?.id;
  const children = renderChildren(node.content, context, path);

  switch (node.attrs?.level) {
    case 2:
      return (
        <h2 id={id} key={path}>
          {children}
        </h2>
      );
    case 3:
      return (
        <h3 id={id} key={path}>
          {children}
        </h3>
      );
    default:
      return (
        <h1 id={id} key={path}>
          {children}
        </h1>
      );
  }
}

function renderTableOfContents(context: RenderContext, path: string) {
  return (
    <nav className="folio-reader__toc" data-folio-toc="" key={path}>
      <ol>
        {context.headings.map((heading) => (
          <li data-level={heading.level} key={heading.id}>
            <a href={`#${heading.id}`}>{heading.text}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function renderNode(node: JSONContent, context: RenderContext, path: string): ReactNode {
  if (node.type === "text") {
    return renderText(node, path);
  }

  switch (node.type) {
    case "doc":
      return <>{renderChildren(node.content, context, path)}</>;
    case "paragraph":
      return <p key={path}>{renderChildren(node.content, context, path)}</p>;
    case "hardBreak":
      return <br key={path} />;
    case "heading":
      return renderHeading(node, context, path);
    case "bulletList":
      return <ul key={path}>{renderChildren(node.content, context, path)}</ul>;
    case "orderedList":
      return <ol key={path}>{renderChildren(node.content, context, path)}</ol>;
    case "listItem":
      return <li key={path}>{renderChildren(node.content, context, path)}</li>;
    case "taskList":
      return (
        <ul data-type="taskList" key={path}>
          {renderChildren(node.content, context, path)}
        </ul>
      );
    case "taskItem": {
      const label = getNodeText(node) || "Task item";

      return (
        <li data-checked={String(Boolean(node.attrs?.checked))} data-type="taskItem" key={path}>
          <input
            aria-label={label}
            checked={Boolean(node.attrs?.checked)}
            readOnly
            type="checkbox"
          />
          <div>{renderChildren(node.content, context, path)}</div>
        </li>
      );
    }
    case "blockquote":
      return <blockquote key={path}>{renderChildren(node.content, context, path)}</blockquote>;
    case "horizontalRule":
      return <hr key={path} />;
    case "codeBlock":
      return (
        <pre key={path}>
          <code>{getNodeText(node)}</code>
        </pre>
      );
    case "image":
      return (
        <figure className="folio-reader__figure" key={path}>
          <img
            alt={String(node.attrs?.alt ?? "")}
            src={sanitizeUrl(node.attrs?.src, imageProtocols, {
              allowDataImage: true,
            })}
            title={node.attrs?.title ? String(node.attrs.title) : undefined}
          />
          {node.attrs?.caption ? <figcaption>{String(node.attrs.caption)}</figcaption> : null}
        </figure>
      );
    case "table":
      return (
        <table key={path}>
          <tbody>{renderChildren(node.content, context, path)}</tbody>
        </table>
      );
    case "tableRow":
      return <tr key={path}>{renderChildren(node.content, context, path)}</tr>;
    case "tableHeader":
      return (
        <th key={path} scope="col">
          {renderChildren(node.content, context, path)}
        </th>
      );
    case "tableCell":
      return <td key={path}>{renderChildren(node.content, context, path)}</td>;
    case "details":
      return (
        <details key={path} open={node.attrs?.open !== false}>
          {renderChildren(node.content, context, path)}
        </details>
      );
    case "detailsSummary":
      return <summary key={path}>{renderChildren(node.content, context, path)}</summary>;
    case "detailsContent":
      return <div key={path}>{renderChildren(node.content, context, path)}</div>;
    case "callout":
      return (
        <aside
          className="folio-callout"
          data-folio-callout=""
          data-tone={String(node.attrs?.tone ?? "info")}
          key={path}
        >
          {renderChildren(node.content, context, path)}
        </aside>
      );
    case "bookmark": {
      const title = String(node.attrs?.title ?? node.attrs?.url ?? "Bookmark");
      const url = sanitizeUrl(node.attrs?.url, anchorProtocols);

      return (
        <div className="folio-bookmark" data-folio-bookmark="" key={path}>
          {url ? (
            <a href={url} rel="noreferrer" target="_blank">
              {title}
            </a>
          ) : (
            title
          )}
          {node.attrs?.description ? <p>{String(node.attrs.description)}</p> : null}
        </div>
      );
    }
    case "mention":
      return (
        <span className="folio-mention" data-folio-mention="" key={path}>
          {String(node.attrs?.label ?? node.attrs?.id ?? getNodeText(node))}
        </span>
      );
    case "tableOfContents":
      return renderTableOfContents(context, path);
    default:
      return (
        <div data-folio-unknown-node={node.type ?? "unknown"} key={path}>
          {renderChildren(node.content, context, path)}
        </div>
      );
  }
}

export function renderFolioNode(node: FolioDocument | JSONContent): ReactNode {
  const context: RenderContext = {
    headings: collectHeadings(node),
  };

  return renderNode(node, context, "0");
}
