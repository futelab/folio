import { getSchema } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { createDefaultTiptapExtensions } from "./extensions/defaultExtensions";
import type { FolioExtension } from "./extensions/types";
import { createFolioExtensionRegistry } from "./extensions/registry";
import { isFolioBlockId } from "./extensions/blockIdentity";
import { isFolioColumnWidth } from "./nodes/columns";

export type FolioDocument = JSONContent & { type: "doc"; content?: JSONContent[] };
export type FolioJSONContent = JSONContent;

export interface FolioDocumentLimits {
  maxDepth: number;
  maxNodes: number;
  maxTextLength: number;
  maxAttributeValues: number;
}

export const defaultFolioDocumentLimits: Readonly<FolioDocumentLimits> = Object.freeze({
  maxDepth: 64,
  maxNodes: 10_000,
  maxTextLength: 2_000_000,
  maxAttributeValues: 100_000,
});

export interface FolioDocumentIssue {
  code: string;
  path: string;
  message: string;
}
export interface FolioDocumentValidationOptions {
  extensions?: FolioExtension[];
  limits?: Partial<FolioDocumentLimits>;
  /** Reader-only recovery: retain structurally safe unknown nodes/marks for a visible fallback. */
  allowUnknownContent?: boolean;
}
export interface FolioDocumentValidationResult {
  valid: boolean;
  errors: FolioDocumentIssue[];
}

export class FolioDocumentValidationError extends Error {
  readonly issues: FolioDocumentIssue[];
  constructor(issues: FolioDocumentIssue[]) {
    super(
      `Invalid Folio document: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`,
    );
    this.name = "FolioDocumentValidationError";
    this.issues = issues;
  }
}

export function createEmptyFolioDocument(): FolioDocument {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

let defaultDocumentSchema: ReturnType<typeof getSchema> | undefined;

function validationSchema(options: FolioDocumentValidationOptions): ReturnType<typeof getSchema> {
  createFolioExtensionRegistry(options.extensions);
  if (!options.extensions?.some((extension) => extension.tiptapExtensions?.length)) {
    return (defaultDocumentSchema ??= getSchema(createDefaultTiptapExtensions()));
  }
  // Custom extension options can be mutable. The convenience API must observe their current configuration.
  return getSchema(createDefaultTiptapExtensions({ folioExtensions: options.extensions }));
}

function validateDocument(
  value: unknown,
  options: FolioDocumentValidationOptions = {},
  compiledSchema?: ReturnType<typeof getSchema>,
): FolioDocumentValidationResult {
  const errors: FolioDocumentIssue[] = [];
  const issue = (code: string, path: string, message: string) => {
    if (errors.length < 20) errors.push({ code, path, message });
  };
  const limits = { ...defaultFolioDocumentLimits, ...options.limits };
  for (const [key, limit] of Object.entries(limits)) {
    if (!Number.isSafeInteger(limit) || limit < 1)
      issue("invalid_limit", "$", `${key} must be a positive safe integer`);
  }
  if (errors.length) return { valid: false, errors };
  const ancestors = new WeakSet<object>();
  let nodes = 0;
  let characters = 0;
  let attributeValues = 0;
  let unknownContent = false;
  const blockIds = new Set<string>();
  let schema: ReturnType<typeof getSchema>;
  try {
    schema = compiledSchema ?? validationSchema(options);
  } catch (error) {
    issue("invalid_extensions", "$", error instanceof Error ? error.message : "Invalid extensions");
    return { valid: false, errors };
  }
  const stringValue = (text: string, path: string) => {
    characters += text.length;
    if (characters > limits.maxTextLength)
      issue("size_limit", path, "Document text and attribute strings exceed the character limit");
  };
  const jsonValue = (item: unknown, path: string, depth: number): void => {
    if (errors.length >= 20) return;
    if (++attributeValues > limits.maxAttributeValues) {
      issue("size_limit", path, "Too many attribute values");
      return;
    }
    if (depth > limits.maxDepth) {
      issue("depth_limit", path, "Attribute nesting exceeds the depth limit");
      return;
    }
    if (typeof item === "string") {
      stringValue(item, path);
      return;
    }
    if (
      item === null ||
      typeof item === "boolean" ||
      (typeof item === "number" && Number.isFinite(item))
    )
      return;
    if (!Array.isArray(item) && !isRecord(item)) {
      issue("invalid_json", path, "Attributes must contain JSON values");
      return;
    }
    if (ancestors.has(item)) {
      issue("cyclic_value", path, "Cyclic content is not JSON");
      return;
    }
    ancestors.add(item);
    for (const [key, child] of Object.entries(item)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype")
        issue("invalid_key", `${path}.${key}`, "Unsafe object key");
      jsonValue(child, `${path}.${key}`, depth + 1);
      if (attributeValues > limits.maxAttributeValues || errors.length >= 20) break;
    }
    ancestors.delete(item);
  };
  const checkAttrs = (attrs: unknown, path: string, specs: Record<string, unknown> | undefined) => {
    if (attrs === undefined) return;
    if (!isRecord(attrs)) {
      issue("invalid_attrs", path, "attrs must be an object");
      return;
    }
    jsonValue(attrs, path, 0);
    if (specs)
      for (const key of Object.keys(attrs)) {
        if (!Object.hasOwn(specs, key))
          issue("unknown_attribute", `${path}.${key}`, "Attribute is not registered in the schema");
      }
  };
  const visit = (item: unknown, path: string, depth: number): void => {
    if (errors.length >= 20) return;
    if (++nodes > limits.maxNodes) {
      issue("node_limit", path, "Document exceeds the node limit");
      return;
    }
    if (depth > limits.maxDepth) {
      issue("depth_limit", path, "Document exceeds the depth limit");
      return;
    }
    if (!isRecord(item)) {
      issue("invalid_node", path, "Node must be an object");
      return;
    }
    if (ancestors.has(item)) {
      issue("cyclic_value", path, "Cyclic content is not JSON");
      return;
    }
    ancestors.add(item);
    if (typeof item.type !== "string" || !item.type)
      issue("invalid_type", `${path}.type`, "Node type must be a nonempty string");
    const nodeType = typeof item.type === "string" ? schema.nodes[item.type] : undefined;
    if (!nodeType) {
      unknownContent = true;
      if (!options.allowUnknownContent)
        issue("unknown_node", `${path}.type`, `Unregistered node: ${String(item.type)}`);
    }
    checkAttrs(item.attrs, `${path}.attrs`, nodeType ? (nodeType.spec.attrs ?? {}) : undefined);
    for (const key of Object.keys(item)) {
      if (!["type", "attrs", "content", "marks", "text"].includes(key))
        issue(
          "unknown_property",
          `${path}.${key}`,
          "Unrecognized node property would be lost by Tiptap",
        );
    }
    if (isRecord(item.attrs)) {
      const attrs = item.attrs;
      if (item.type === "column" && attrs.width !== undefined && !isFolioColumnWidth(attrs.width))
        issue(
          "invalid_attribute",
          `${path}.attrs.width`,
          "Column width must be a positive finite weight no greater than 100",
        );
      if (attrs.folioBlockId !== undefined && attrs.folioBlockId !== null) {
        if (!isFolioBlockId(attrs.folioBlockId))
          issue(
            "invalid_attribute",
            `${path}.attrs.folioBlockId`,
            "Block ID must contain 1 to 128 letters, numbers, underscores or hyphens",
          );
        else if (blockIds.has(attrs.folioBlockId))
          issue(
            "duplicate_block_id",
            `${path}.attrs.folioBlockId`,
            "Block IDs must be unique within a document",
          );
        else blockIds.add(attrs.folioBlockId);
      }
      if (
        item.type === "heading" &&
        attrs.level !== undefined &&
        ![1, 2, 3].includes(attrs.level as number)
      )
        issue("invalid_attribute", `${path}.attrs.level`, "Heading level must be 1, 2 or 3");
      if (
        item.type === "orderedList" &&
        attrs.start !== undefined &&
        !Number.isSafeInteger(attrs.start)
      )
        issue("invalid_attribute", `${path}.attrs.start`, "List start must be a safe integer");
      if (
        item.type === "taskItem" &&
        attrs.checked !== undefined &&
        typeof attrs.checked !== "boolean"
      )
        issue("invalid_attribute", `${path}.attrs.checked`, "checked must be a boolean");
      if (item.type === "details" && attrs.open !== undefined && typeof attrs.open !== "boolean")
        issue("invalid_attribute", `${path}.attrs.open`, "open must be a boolean");
      const stringAttributes: Record<string, string[]> = {
        image: ["src", "alt", "title", "caption"],
        bookmark: ["url", "title", "description"],
        callout: ["tone"],
        codeBlock: ["language"],
        heading: ["id", "data-toc-id"],
        orderedList: ["type"],
        mention: ["mentionSuggestionChar"],
      };
      for (const name of stringAttributes[String(item.type)] ?? []) {
        if (attrs[name] !== undefined && attrs[name] !== null && typeof attrs[name] !== "string")
          issue("invalid_attribute", `${path}.attrs.${name}`, `${name} must be a string or null`);
      }
      if (item.type === "mention")
        for (const name of ["id", "label"]) {
          if (
            attrs[name] !== undefined &&
            attrs[name] !== null &&
            typeof attrs[name] !== "string" &&
            typeof attrs[name] !== "number"
          )
            issue(
              "invalid_attribute",
              `${path}.attrs.${name}`,
              `${name} must be a string, number or null`,
            );
        }
      if (item.type === "tableCell" || item.type === "tableHeader") {
        for (const name of ["colspan", "rowspan"]) {
          if (
            attrs[name] !== undefined &&
            (!Number.isSafeInteger(attrs[name]) || Number(attrs[name]) < 1)
          )
            issue(
              "invalid_attribute",
              `${path}.attrs.${name}`,
              `${name} must be a positive integer`,
            );
        }
        if (
          attrs.colwidth !== undefined &&
          attrs.colwidth !== null &&
          (!Array.isArray(attrs.colwidth) ||
            attrs.colwidth.some((width) => !Number.isSafeInteger(width) || width < 0))
        )
          issue(
            "invalid_attribute",
            `${path}.attrs.colwidth`,
            "colwidth must be an array of nonnegative integer widths",
          );
      }
    }
    if (item.type === "text") {
      if (typeof item.text !== "string" || !item.text)
        issue("invalid_text", `${path}.text`, "Text nodes require nonempty text");
      else stringValue(item.text, `${path}.text`);
      if (item.content !== undefined)
        issue("invalid_content", `${path}.content`, "Text nodes cannot have children");
    } else if (item.text !== undefined)
      issue("invalid_text", `${path}.text`, "Only text nodes may contain text");
    if (item.marks !== undefined) {
      if (!Array.isArray(item.marks))
        issue("invalid_marks", `${path}.marks`, "marks must be an array");
      else
        for (let index = 0; index < item.marks.length; index++) {
          const mark = item.marks[index];
          const markPath = `${path}.marks[${index}]`;
          if (!isRecord(mark) || typeof mark.type !== "string") {
            issue("invalid_mark", markPath, "Mark must have a string type");
            continue;
          }
          const markType = schema.marks[mark.type];
          if (!markType) {
            unknownContent = true;
            if (!options.allowUnknownContent)
              issue("unknown_mark", markPath, `Unregistered mark: ${mark.type}`);
          }
          checkAttrs(
            mark.attrs,
            `${markPath}.attrs`,
            markType ? (markType.spec.attrs ?? {}) : undefined,
          );
          for (const key of Object.keys(mark)) {
            if (key !== "type" && key !== "attrs")
              issue(
                "unknown_property",
                `${markPath}.${key}`,
                "Unrecognized mark property would be lost by Tiptap",
              );
          }
          if (mark.attrs && isRecord(mark.attrs))
            for (const name of ["href", "target", "rel", "class", "color"]) {
              if (
                mark.attrs[name] !== undefined &&
                mark.attrs[name] !== null &&
                typeof mark.attrs[name] !== "string"
              )
                issue(
                  "invalid_attribute",
                  `${markPath}.attrs.${name}`,
                  `${name} must be a string or null`,
                );
            }
          if (++attributeValues > limits.maxAttributeValues) {
            issue("size_limit", markPath, "Too many marks");
            break;
          }
        }
    }
    if (item.content !== undefined) {
      if (!Array.isArray(item.content))
        issue("invalid_content", `${path}.content`, "content must be an array");
      else
        for (let index = 0; index < item.content.length; index++) {
          visit(item.content[index], `${path}.content[${index}]`, depth + 1);
          if (nodes > limits.maxNodes || errors.length >= 20) break;
        }
    }
    // Unknown descendants must not disable validation of unrelated known branches.
    if (!errors.length && nodeType && item.type !== "text") {
      const children = (item.content ?? []) as Array<Record<string, unknown>>;
      if (children.every((child) => typeof child.type === "string" && schema.nodes[child.type])) {
        const content = children.map((child) =>
          child.type === "text"
            ? schema.text(String(child.text))
            : schema.nodes[child.type as string]!.create(
                isRecord(child.attrs) ? child.attrs : undefined,
              ),
        );
        if (
          !nodeType.validContent(
            nodeType.create(isRecord(item.attrs) ? item.attrs : undefined, content).content,
          )
        ) {
          issue("invalid_schema", path, `Invalid child content for ${String(item.type)}`);
        }
      }
    }
    ancestors.delete(item);
  };
  try {
    if (!isRecord(value) || value.type !== "doc")
      issue("invalid_root", "$", "Root type must be doc");
    else visit(value, "$", 0);
    if (!errors.length && !unknownContent) schema.nodeFromJSON(value).check();
  } catch (error) {
    issue(
      "invalid_schema",
      "$",
      error instanceof Error ? error.message : "Document does not match its schema",
    );
  }
  return { valid: errors.length === 0, errors };
}

/** Validate before handing untrusted saved JSON to Tiptap or a renderer. Never repairs or discards data. */
export function validateFolioDocument(
  value: unknown,
  options: FolioDocumentValidationOptions = {},
): FolioDocumentValidationResult {
  return validateDocument(value, options);
}

export interface FolioDocumentValidator {
  validate: (value: unknown) => FolioDocumentValidationResult;
  parse: (value: unknown) => FolioDocument;
  is: (value: unknown) => value is FolioDocument;
}

/** Compile once per editor schema. Recreate when extension configuration changes, just like a Tiptap editor. */
export function createFolioDocumentValidator(
  options: FolioDocumentValidationOptions = {},
): FolioDocumentValidator {
  const captured = {
    ...options,
    extensions: options.extensions ? [...options.extensions] : undefined,
    limits: { ...options.limits },
  };
  const schema = validationSchema(captured);
  const validate = (value: unknown) => validateDocument(value, captured, schema);
  return {
    validate,
    parse: (value) => {
      const result = validate(value);
      if (!result.valid) throw new FolioDocumentValidationError(result.errors);
      return value as FolioDocument;
    },
    is: (value): value is FolioDocument => validate(value).valid,
  };
}

export function parseFolioDocument(
  value: unknown,
  options: FolioDocumentValidationOptions = {},
): FolioDocument {
  const result = validateFolioDocument(value, options);
  if (!result.valid) throw new FolioDocumentValidationError(result.errors);
  return value as FolioDocument;
}

export function isFolioDocument(
  value: unknown,
  options: FolioDocumentValidationOptions = {},
): value is FolioDocument {
  return validateFolioDocument(value, options).valid;
}

export const folioDocumentFormatVersion = 1 as const;
export interface FolioSnapshot {
  format: "folio";
  version: typeof folioDocumentFormatVersion;
  document: FolioDocument;
}

export function createFolioSnapshot(
  document: FolioDocument,
  options: FolioDocumentValidationOptions = {},
): FolioSnapshot {
  // JSON clone makes the snapshot independent of subsequent mutable editor state.
  return {
    format: "folio",
    version: folioDocumentFormatVersion,
    document: JSON.parse(JSON.stringify(parseFolioDocument(document, options))) as FolioDocument,
  };
}

/** Migrate legacy unwrapped Tiptap JSON; future versions are rejected without replacing saved data. */
export function parseFolioSnapshot(
  value: unknown,
  options: FolioDocumentValidationOptions = {},
): FolioSnapshot {
  let candidate = value;
  if (typeof candidate === "string") {
    if (
      candidate.length >
      (options.limits?.maxTextLength ?? defaultFolioDocumentLimits.maxTextLength) * 4
    ) {
      throw new FolioDocumentValidationError([
        { code: "size_limit", path: "$", message: "Snapshot JSON exceeds the size limit" },
      ]);
    }
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      throw new FolioDocumentValidationError([
        { code: "invalid_json", path: "$", message: "Snapshot is not valid JSON" },
      ]);
    }
  }
  if (isRecord(candidate) && candidate.format === "folio") {
    if (candidate.version !== folioDocumentFormatVersion) {
      throw new FolioDocumentValidationError([
        {
          code: "unsupported_version",
          path: "$.version",
          message: `Unsupported Folio document version: ${String(candidate.version)}`,
        },
      ]);
    }
    return createFolioSnapshot(parseFolioDocument(candidate.document, options), options);
  }
  return createFolioSnapshot(parseFolioDocument(candidate, options), options);
}

export const migrateFolioSnapshot = parseFolioSnapshot;
