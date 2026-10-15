import { Fragment } from "react";
import type { ReactNode } from "react";
import type { JSONContent } from "@tiptap/core";
import {
  createFolioExtensionRegistry,
  sanitizeFolioUrl,
  validateFolioDocument,
} from "@futelab/folio-core/browser";
import type {
  FolioDocument,
  FolioDocumentIssue,
  FolioDocumentLimits,
  FolioExtension,
  FolioRendererContribution,
} from "@futelab/folio-core/browser";

export interface FolioReaderIssue {
  code:
    | "invalid-document"
    | "invalid-extensions"
    | "unknown-node"
    | "unknown-mark"
    | "renderer-error"
    | "render-limit";
  path: string;
  type?: string;
  message: string;
  validationIssues?: FolioDocumentIssue[];
}

export interface RenderFolioNodeOptions {
  extensions?: FolioExtension[];
  /** Supply a distinct prefix per document when calling this function directly. */
  headingIdPrefix?: string;
  limits?: Partial<FolioDocumentLimits>;
  maxRenderedNodes?: number;
  /** A pure diagnostic callback, invoked during render. */
  onError?: (issue: FolioReaderIssue) => void;
  renderError?: (issue: FolioReaderIssue) => ReactNode;
}

interface HeadingEntry {
  id: string;
  level: number;
  text: string;
  path: string;
}
interface RenderContext {
  headings: HeadingEntry[];
  headingByPath: Map<string, HeadingEntry>;
  renderers: Map<string, FolioRendererContribution>;
  remaining: number;
  tocRemaining: number;
  limitReported: boolean;
  limitNotice?: ReactNode;
  options: RenderFolioNodeOptions;
}

function getNodeText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  return node.content?.map(getNodeText).join("") ?? "";
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function collectHeadings(node: JSONContent, prefix: string) {
  const headings: HeadingEntry[] = [];
  const usedIds = new Set<string>();
  const nextSuffix = new Map<string, number>();
  let sourceCost = 0;

  function visit(current: JSONContent, path: string) {
    sourceCost += 1 + Math.min(current.marks?.length ?? 0, 64);
    if (current.type === "heading") {
      const text = getNodeText(current);
      const persistedId = current.attrs?.id ?? current.attrs?.["data-toc-id"];
      const baseId = `${prefix}${typeof persistedId === "string" && persistedId ? persistedId : slugify(text) || `heading-${headings.length + 1}`}`;
      let id = baseId;
      let suffix = nextSuffix.get(baseId) ?? 2;
      while (usedIds.has(id)) {
        id = `${baseId}-${suffix}`;
        suffix += 1;
      }
      usedIds.add(id);
      nextSuffix.set(baseId, suffix);
      headings.push({ id, level: Number(current.attrs?.level ?? 1), text, path });
    }
    current.content?.forEach((child, index) => visit(child, `${path}-${index}`));
  }

  visit(node, "0");
  return { headings, sourceCost };
}

function reportIssue(issue: FolioReaderIssue, options: RenderFolioNodeOptions): ReactNode {
  options.onError?.(issue);
  if (options.renderError) return options.renderError(issue);
  return (
    <span data-folio-reader-error={issue.code} role="status">
      {issue.message}
    </span>
  );
}

function renderLimit(context: RenderContext, path: string): ReactNode {
  if (context.limitReported) return null;
  context.limitReported = true;
  context.limitNotice = reportIssue(
    {
      code: "render-limit",
      path,
      message: "Document preview was shortened because its render limit was reached.",
    },
    context.options,
  );
  return null;
}

function renderChildren(
  content: JSONContent[] | undefined,
  context: RenderContext,
  path: string,
): ReactNode {
  const rendered: ReactNode[] = [];
  for (const [index, child] of (content ?? []).entries()) {
    if (context.remaining <= 0) {
      rendered.push(renderLimit(context, `${path}-${index}`));
      break;
    }
    rendered.push(renderNode(child, context, `${path}-${index}`));
  }
  return rendered;
}

function renderContribution(
  contribution: FolioRendererContribution,
  node: JSONContent,
  children: ReactNode,
  context: RenderContext,
  path: string,
): ReactNode {
  try {
    return (
      <Fragment key={path}>{contribution.render(node, { children, path }) as ReactNode}</Fragment>
    );
  } catch {
    return (
      <Fragment key={path}>
        {reportIssue(
          {
            code: "renderer-error",
            path,
            type: node.type,
            message: `Unable to render content: ${node.type ?? "unknown"}.`,
          },
          context.options,
        )}
        {children}
      </Fragment>
    );
  }
}

function renderText(node: JSONContent, context: RenderContext, key: string): ReactNode {
  let rendered: ReactNode = node.text ?? "";
  for (const [index, mark] of (node.marks ?? []).entries()) {
    // Untrusted unknown marks must not create a React tree deep enough to overflow SSR.
    if (context.remaining <= 0 || index >= 64) {
      rendered = (
        <>
          {rendered}
          {renderLimit(context, key)}
        </>
      );
      break;
    }
    context.remaining -= 1;
    const markKey = `${key}-mark-${index}`;
    const contribution = context.renderers.get(`mark:${mark.type}`);
    if (contribution) {
      rendered = renderContribution(contribution, mark, rendered, context, markKey);
      continue;
    }

    switch (mark.type) {
      case "bold":
        rendered = <strong key={markKey}>{rendered}</strong>;
        break;
      case "italic":
        rendered = <em key={markKey}>{rendered}</em>;
        break;
      case "code":
        rendered = <code key={markKey}>{rendered}</code>;
        break;
      case "strike":
        rendered = <del key={markKey}>{rendered}</del>;
        break;
      case "underline":
        rendered = <u key={markKey}>{rendered}</u>;
        break;
      case "highlight": {
        const color = typeof mark.attrs?.color === "string" ? mark.attrs.color : undefined;
        rendered = (
          <mark key={markKey} style={color ? { backgroundColor: color } : undefined}>
            {rendered}
          </mark>
        );
        break;
      }
      case "textStyle": {
        const color = typeof mark.attrs?.color === "string" ? mark.attrs.color : undefined;
        rendered = (
          <span key={markKey} style={color ? { color } : undefined}>
            {rendered}
          </span>
        );
        break;
      }
      case "link": {
        const href = sanitizeFolioUrl(mark.attrs?.href, { kind: "link" });
        if (href)
          rendered = (
            <a href={href} key={markKey} rel="noopener noreferrer" target="_blank">
              {rendered}
            </a>
          );
        break;
      }
      default:
        rendered = (
          <span data-folio-unknown-mark={mark.type} key={markKey}>
            {rendered}
            {reportIssue(
              {
                code: "unknown-mark",
                path: markKey,
                type: mark.type,
                message: `Unsupported formatting: ${mark.type}.`,
              },
              context.options,
            )}
          </span>
        );
    }
  }
  return <Fragment key={key}>{rendered}</Fragment>;
}

function renderHeading(node: JSONContent, context: RenderContext, path: string) {
  const id = context.headingByPath.get(path)?.id;
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
  const entries: ReactNode[] = [];
  for (const heading of context.headings) {
    if (context.remaining <= 0 || context.tocRemaining <= 0) {
      renderLimit(context, path);
      break;
    }
    context.remaining -= 1;
    context.tocRemaining -= 1;
    entries.push(
      <li data-level={heading.level} key={heading.id}>
        <a href={`#${heading.id}`}>{heading.text}</a>
      </li>,
    );
  }
  return (
    <nav className="folio-reader__toc" data-folio-toc="" key={path}>
      <ol>{entries}</ol>
    </nav>
  );
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function tableCellAttributes(node: JSONContent) {
  const widths = Array.isArray(node.attrs?.colwidth) ? node.attrs.colwidth : [];
  const validWidths =
    widths.length > 0 &&
    widths.every(
      (width: unknown) => typeof width === "number" && Number.isSafeInteger(width) && width >= 0,
    );
  const width = validWidths
    ? widths.reduce((sum: number, item: number) => sum + item, 0)
    : undefined;
  return {
    colSpan: positiveInteger(node.attrs?.colspan),
    rowSpan: positiveInteger(node.attrs?.rowspan),
    "data-colwidth": validWidths ? widths.join(",") : undefined,
    style:
      width && Number.isSafeInteger(width)
        ? widths.includes(0)
          ? { minWidth: `${width}px` }
          : { width: `${width}px` }
        : undefined,
  };
}

function renderNode(node: JSONContent, context: RenderContext, path: string): ReactNode {
  context.remaining -= 1;
  const contribution = context.renderers.get(`node:${node.type}`);
  if (contribution)
    return renderContribution(
      contribution,
      node,
      renderChildren(node.content, context, path),
      context,
      path,
    );
  if (node.type === "text") return renderText(node, context, path);

  switch (node.type) {
    case "doc":
      return <Fragment key={path}>{renderChildren(node.content, context, path)}</Fragment>;
    case "paragraph":
      return <p key={path}>{renderChildren(node.content, context, path)}</p>;
    case "hardBreak":
      return <br key={path} />;
    case "heading":
      return renderHeading(node, context, path);
    case "bulletList":
      return <ul key={path}>{renderChildren(node.content, context, path)}</ul>;
    case "orderedList":
      return (
        <ol
          key={path}
          start={
            typeof node.attrs?.start === "number" && Number.isSafeInteger(node.attrs.start)
              ? node.attrs.start
              : undefined
          }
        >
          {renderChildren(node.content, context, path)}
        </ol>
      );
    case "listItem":
      return <li key={path}>{renderChildren(node.content, context, path)}</li>;
    case "taskList":
      return (
        <ul data-type="taskList" key={path}>
          {renderChildren(node.content, context, path)}
        </ul>
      );
    case "taskItem":
      return (
        <li data-checked={String(node.attrs?.checked === true)} data-type="taskItem" key={path}>
          <input
            aria-label={getNodeText(node) || "Task item"}
            checked={node.attrs?.checked === true}
            readOnly
            type="checkbox"
          />
          <div>{renderChildren(node.content, context, path)}</div>
        </li>
      );
    case "blockquote":
      return <blockquote key={path}>{renderChildren(node.content, context, path)}</blockquote>;
    case "horizontalRule":
      return <hr key={path} />;
    case "codeBlock": {
      const language = typeof node.attrs?.language === "string" ? node.attrs.language : undefined;
      return (
        <pre key={path}>
          <code className={language ? `language-${language}` : undefined}>{getNodeText(node)}</code>
        </pre>
      );
    }
    case "image":
      return (
        <figure className="folio-reader__figure" key={path}>
          <img
            alt={String(node.attrs?.alt ?? "")}
            src={sanitizeFolioUrl(node.attrs?.src, { kind: "image" })}
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
        <th {...tableCellAttributes(node)} key={path} scope="col">
          {renderChildren(node.content, context, path)}
        </th>
      );
    case "tableCell":
      return (
        <td {...tableCellAttributes(node)} key={path}>
          {renderChildren(node.content, context, path)}
        </td>
      );
    case "details":
      return (
        <details key={path} open={node.attrs?.open === true}>
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
      const url = sanitizeFolioUrl(node.attrs?.url, { kind: "link" });
      return (
        <div className="folio-bookmark" data-folio-bookmark="" key={path}>
          {url ? (
            <a href={url} rel="noopener noreferrer" target="_blank">
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
        <span
          className="folio-mention"
          data-folio-mention=""
          data-type="mention"
          data-id={node.attrs?.id}
          data-label={node.attrs?.label}
          key={path}
        >
          {String(node.attrs?.mentionSuggestionChar ?? "@") +
            String(node.attrs?.label ?? node.attrs?.id ?? getNodeText(node))}
        </span>
      );
    case "tableOfContents":
      return renderTableOfContents(context, path);
    default:
      return (
        <Fragment key={path}>
          <span data-folio-unknown-node={node.type ?? "unknown"}>
            {reportIssue(
              {
                code: "unknown-node",
                path,
                type: node.type,
                message: `Unsupported content: ${node.type ?? "unknown"}.`,
              },
              context.options,
            )}
          </span>
          {renderChildren(node.content, context, path)}
        </Fragment>
      );
  }
}

/** Render a validated document. FolioReader also supplies a unique heading prefix. */
export function renderFolioNode(value: unknown, options: RenderFolioNodeOptions = {}): ReactNode {
  let renderers: FolioRendererContribution[];
  try {
    renderers = createFolioExtensionRegistry(options.extensions).renderers;
  } catch {
    return reportIssue(
      {
        code: "invalid-extensions",
        path: "0",
        message: "This document cannot be displayed because its reader extensions conflict.",
      },
      options,
    );
  }

  const validation = validateFolioDocument(value, {
    extensions: options.extensions,
    limits: options.limits,
    allowUnknownContent: true,
  });
  if (!validation.valid)
    return reportIssue(
      {
        code: "invalid-document",
        path: "0",
        message: "This document cannot be displayed because its content is invalid.",
        validationIssues: validation.errors,
      },
      options,
    );

  const prefix = options.headingIdPrefix ? `${options.headingIdPrefix}-` : "";
  const { headings, sourceCost } = collectHeadings(value as FolioDocument, prefix);
  const renderBudget = positiveInteger(options.maxRenderedNodes) ?? 50_000;
  const context: RenderContext = {
    headings,
    headingByPath: new Map(headings.map((heading) => [heading.path, heading])),
    renderers: new Map(
      renderers.map((renderer) => [`${renderer.kind ?? "node"}:${renderer.type}`, renderer]),
    ),
    remaining: renderBudget,
    // Reserve the budget for actual content before generating repeated TOC entries.
    tocRemaining: Math.max(0, renderBudget - sourceCost),
    limitReported: false,
    options,
  };
  const rendered = renderNode(value as FolioDocument, context, "0");
  return (
    <>
      {rendered}
      {context.limitNotice}
    </>
  );
}
