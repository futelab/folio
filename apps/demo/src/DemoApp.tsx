import { useEffect, useMemo, useRef, useState } from "react";
import type { FolioDocument } from "@futelab/folio/core";
import {
  assertSafeDocumentUrls,
  createFolioSnapshot,
  defaultFolioDocumentLimits,
  parseFolioDocument,
  parseFolioSnapshot,
} from "@futelab/folio/core";
import { fromHTML, fromMarkdown, toHTML, toMarkdown } from "@futelab/folio/serialization";
import { FolioReader, createMemoryCommentStore } from "@futelab/folio/react";
import {
  createDemoCollaboration,
  createDemoPageFeatures,
  defaultDemoFeatureSettings,
  DemoFeatureControls,
  DemoFeatureEditor,
} from "./DemoFeatures";
import type { DemoCollaboration } from "./DemoFeatures";
import {
  FileText,
  Folder,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";

const STORAGE_KEY = "futelab.folio.demo.pages";
const EDITOR_PLACEHOLDER = "Type '/' for commands";
const UNTITLED_PAGE_LABEL = "Untitled";
const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 1024 * 1024;
const mentionSuggestions = [
  { id: "maya", label: "Maya" },
  { id: "alex", label: "Alex Chen" },
  { id: "lin", label: "林晓" },
];
type DemoLocale = "en" | "zh-CN";
type DocumentFormat = "json" | "html" | "markdown";
const messages = {
  en: {
    pages: "Pages",
    search: "Search",
    searchPages: "Search pages",
    newPage: "New page",
    editor: "Editor",
    preview: "Preview",
    reset: "Reset",
    pageTitle: "Page title",
    untitled: UNTITLED_PAGE_LABEL,
    placeholder: EDITOR_PLACEHOLDER,
    tools: "Document tools",
    language: "Language",
    readOnly: "Read-only",
    format: "File format",
    import: "Import",
    export: "Export",
    importFile: "Import document file",
    saving: "Saving locally…",
    saved: "Saved locally",
    saveFailed: "Local save failed",
    saveFailureHelp:
      "Your draft is still open. Export JSON as a backup, free some browser storage, then retry.",
    retry: "Retry local save",
    loadFailed:
      "Saved pages could not be loaded. The original saved draft has been preserved. Reset to use the demo pages or download the original backup.",
    backup: "Download original backup",
    imported: "Document imported.",
    exported: "Document exported.",
    importFailed: "Import failed. The current document has been kept.",
    exportFailed: "Export failed. The current document has been kept.",
    fileLimit: "Document files must be 8 MB or smaller.",
    importChanged: "Import canceled because the selected page changed.",
    uploadHelp:
      "This local demo embeds PNG, JPEG, GIF and WebP images up to 1 MB, within the document budget. Production upload callbacks can return a hosted URL. Try Mention for sample contacts.",
    imageType: "Choose a PNG, JPEG, GIF or WebP image. SVG files are not supported.",
    imageSize: "Images in this local demo must be 1 MB or smaller.",
    imageRead: "The image could not be read.",
    imageInvalid: "The selected file is not a valid image of its declared type.",
    imageDimensions: "Images must contain 40 million pixels or fewer.",
    imageBudget:
      "This document has no room for another embedded image. Use a smaller image or remove an existing image.",
    markdownHelp:
      "JSON preserves every block. Markdown export regenerates matching table-of-contents anchors and reports unsupported content instead of dropping it.",
    importBusy: "Importing document…",
    editorFailed: "The editor could not apply this change.",
  },
  "zh-CN": {
    pages: "页面",
    search: "搜索",
    searchPages: "搜索页面",
    newPage: "新建页面",
    editor: "编辑器",
    preview: "预览",
    reset: "重置",
    pageTitle: "页面标题",
    untitled: "无标题",
    placeholder: "输入 / 打开命令菜单",
    tools: "文档工具",
    language: "界面语言",
    readOnly: "只读",
    format: "文件格式",
    import: "导入",
    export: "导出",
    importFile: "导入文档文件",
    saving: "正在保存到本地…",
    saved: "已保存到本地",
    saveFailed: "本地保存失败",
    saveFailureHelp: "草稿仍保留在当前页面。请先导出 JSON 备份，释放浏览器存储空间后重试。",
    retry: "重试本地保存",
    loadFailed: "无法载入已保存的页面，原始草稿已保留。可下载原始备份，或重置后使用示例页面。",
    backup: "下载原始备份",
    imported: "文档已导入。",
    exported: "文档已导出。",
    importFailed: "导入失败，当前文档已保留。",
    exportFailed: "导出失败，当前文档已保留。",
    fileLimit: "文档文件不能超过 8 MB。",
    importChanged: "已切换页面，本次导入已取消。",
    uploadHelp:
      "本地演示可嵌入最大 1 MB 的 PNG、JPEG、GIF、WebP 图片，并受文档容量限制。正式应用的上传回调可返回托管地址。可通过“提及”体验示例联系人。",
    imageType: "请选择 PNG、JPEG、GIF 或 WebP 图片，不支持 SVG。",
    imageSize: "本地演示的图片不能超过 1 MB。",
    imageRead: "无法读取此图片。",
    imageInvalid: "图片内容无效或与文件类型不一致。",
    imageDimensions: "图片像素总数不能超过 4000 万。",
    imageBudget: "当前文档已没有足够空间嵌入新图片。请使用更小的图片，或先移除已有图片。",
    markdownHelp:
      "JSON 可保留全部内容。Markdown 导出会重新生成匹配的目录锚点，其他无法完整表达的内容会明确报错，避免丢失。",
    importBusy: "正在导入文档…",
    editorFailed: "编辑器未能应用此次变更。",
  },
} as const;

interface DemoPage {
  id: string;
  title: string;
  icon: string;
  updatedAt: number;
  document: FolioDocument;
}

const heroImage = `${import.meta.env.BASE_URL}folio-workspace.png`;

const starterPages: DemoPage[] = [
  {
    id: "product-plan",
    title: "Folio editor plan",
    icon: "✦",
    updatedAt: Date.now(),
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Build a reusable React editor with " },
            {
              type: "text",
              text: "Notion-like",
              marks: [{ type: "bold" }, { type: "highlight", attrs: { color: "#fff3bf" } }],
            },
            { type: "text", text: " document editing, reading, and extension points." },
          ],
        },
        {
          type: "tableOfContents",
        },
        {
          type: "callout",
          attrs: { tone: "info" },
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Type / in the editor to open block commands while keeping the writing surface clear.",
                },
              ],
            },
          ],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Launch checklist" }],
        },
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: true },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Document schema and serialization" }],
                },
              ],
            },
            {
              type: "taskItem",
              attrs: { checked: true },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Editor, reader, menus, and block handles" }],
                },
              ],
            },
            {
              type: "taskItem",
              attrs: { checked: false },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Polish npm package docs and publish alpha" }],
                },
              ],
            },
          ],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Content blocks" }],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Block" }] }],
                },
                {
                  type: "tableHeader",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Status" }] }],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Callout, task list, toggle" }],
                    },
                  ],
                },
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Ready" }] }],
                },
              ],
            },
          ],
        },
        {
          type: "details",
          attrs: { open: true },
          content: [
            {
              type: "detailsSummary",
              content: [{ type: "text", text: "Open implementation notes" }],
            },
            {
              type: "detailsContent",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "Default content is JSON-first. Reader output should match saved editor output.",
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "image",
          attrs: {
            alt: "Document workspace preview",
            caption: "A document surface with editorial blocks.",
            src: heroImage,
          },
        },
      ],
    },
  },
  {
    id: "meeting-notes",
    title: "Design review notes",
    icon: "◌",
    updatedAt: Date.now() - 1000 * 60 * 32,
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Owner: " },
            { type: "mention", attrs: { id: "maya", label: "Maya" } },
            {
              type: "text",
              text: " · Focus on document density, block controls, and publishing safety.",
            },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Keep editing surface calm and content-first." }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "Make reader parity visible next to editor state." },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "bookmark",
          attrs: {
            description: "Public package API, styles, and serialization exports.",
            title: "@futelab/folio alpha",
            url: "https://www.npmjs.com/",
          },
        },
      ],
    },
  },
];

function createBlankPage(): DemoPage {
  const createdAt = Date.now();

  return {
    id: `page-${crypto.randomUUID()}`,
    title: "",
    icon: "□",
    updatedAt: createdAt,
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [],
        },
      ],
    },
  };
}

interface LoadedPages {
  pages: DemoPage[];
  blocked: boolean;
  original?: string;
}

function loadPages(): LoadedPages {
  let original: string | undefined;
  try {
    original = window.localStorage.getItem(STORAGE_KEY) ?? undefined;
    if (!original) return { pages: starterPages, blocked: false };
    if (original.length > MAX_IMPORT_BYTES) throw new Error("Saved pages exceed the load limit");
    const parsed: unknown = JSON.parse(original);
    let candidates: unknown;
    if (Array.isArray(parsed)) candidates = parsed;
    else if (
      parsed &&
      typeof parsed === "object" &&
      "format" in parsed &&
      parsed.format === "folio-demo" &&
      "version" in parsed &&
      parsed.version === 1 &&
      "pages" in parsed
    )
      candidates = parsed.pages;
    if (!Array.isArray(candidates) || !candidates.length || candidates.length > 100)
      throw new Error("Invalid saved pages");
    const ids = new Set<string>();
    const pages = candidates.map((candidate: unknown): DemoPage => {
      if (!candidate || typeof candidate !== "object") throw new Error("Invalid saved page");
      const page = candidate as Record<string, unknown>;
      if (
        typeof page.id !== "string" ||
        !page.id ||
        page.id.length > 128 ||
        ids.has(page.id) ||
        typeof page.title !== "string" ||
        page.title.length > 5_000 ||
        typeof page.icon !== "string" ||
        page.icon.length > 16 ||
        typeof page.updatedAt !== "number" ||
        !Number.isFinite(page.updatedAt) ||
        Math.abs(page.updatedAt) > 8_640_000_000_000_000
      )
        throw new Error("Invalid saved page metadata");
      ids.add(page.id);
      const document = parseFolioSnapshot(page.document).document;
      assertSafeDocumentUrls(document);
      return {
        id: page.id,
        title: page.title,
        icon: page.icon,
        updatedAt: page.updatedAt,
        document,
      };
    });
    return { pages, blocked: false };
  } catch {
    return { pages: starterPages, blocked: true, original };
  }
}

function formatUpdatedAt(value: number, locale: DemoLocale): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function downloadFile(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function uploadDemoImage(file: File, locale: DemoLocale) {
  const copy = messages[locale];
  if (file.size > MAX_IMAGE_BYTES) throw new Error(copy.imageSize);
  const allowed = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
  if (file.type && !allowed.has(file.type)) throw new Error(copy.imageType);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = Array.from(bytes.slice(0, 12));
  const text = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  const type =
    header.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10"
      ? "image/png"
      : header[0] === 255 && header[1] === 216 && header[2] === 255
        ? "image/jpeg"
        : ["GIF87a", "GIF89a"].includes(text(0, 6))
          ? "image/gif"
          : text(0, 4) === "RIFF" && text(8, 12) === "WEBP"
            ? "image/webp"
            : undefined;
  if (!type || (file.type && file.type !== type)) throw new Error(copy.imageInvalid);
  const image = await createImageBitmap(file).catch(() => {
    throw new Error(copy.imageInvalid);
  });
  const pixels = image.width * image.height;
  image.close();
  if (pixels > 40_000_000) throw new Error(copy.imageDimensions);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 32_768)
    binary += String.fromCharCode(...bytes.subarray(index, index + 32_768));
  return { src: `data:${type};base64,${btoa(binary)}`, alt: file.name };
}

function updatePageDocument(
  pages: DemoPage[],
  pageId: string,
  document: FolioDocument,
): DemoPage[] {
  return pages.map((page) =>
    page.id === pageId ? { ...page, document, updatedAt: Date.now() } : page,
  );
}

function updatePageTitle(pages: DemoPage[], pageId: string, title: string): DemoPage[] {
  return pages.map((page) =>
    page.id === pageId ? { ...page, title, updatedAt: Date.now() } : page,
  );
}

export function DemoApp() {
  const [loaded] = useState(loadPages);
  const [pages, setPages] = useState<DemoPage[]>(loaded.pages);
  const [selectedPageId, setSelectedPageId] = useState(() => {
    const requested = new URL(window.location.href).searchParams.get("page");
    return pages.find((page) => page.id === requested)?.id ?? pages[0]?.id ?? starterPages[0].id;
  });
  const [features, setFeatures] = useState(() => createDemoPageFeatures(loaded.pages));
  const [featureSettings, setFeatureSettings] = useState(defaultDemoFeatureSettings);
  const [collaboration, setCollaboration] = useState<DemoCollaboration | null>(null);
  const [query, setQuery] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [locale, setLocale] = useState<DemoLocale>("en");
  const [readOnly, setReadOnly] = useState(false);
  const [format, setFormat] = useState<DocumentFormat>("json");
  const [saveState, setSaveState] = useState<"saving" | "saved" | "failed">("saving");
  const [storageBlocked, setStorageBlocked] = useState(loaded.blocked);
  const [retrySave, setRetrySave] = useState(0);
  const [notice, setNotice] = useState<{
    kind: "error" | "success";
    message: string;
    source?: "editor";
  }>();
  const [importing, setImporting] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const latestPageId = useRef(selectedPageId);
  const latestReadOnly = useRef(readOnly);
  const copy = messages[locale];

  const selectedPage = useMemo(
    () => pages.find((page) => page.id === selectedPageId) ?? pages[0],
    [pages, selectedPageId],
  );
  const filteredPages = useMemo(
    () =>
      pages.filter((page) =>
        (page.title.trim() || copy.untitled).toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [pages, query, copy.untitled],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => () => collaboration?.room.destroy(), [collaboration]);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("page") !== selectedPageId) {
      url.searchParams.set("page", selectedPageId);
      url.hash = "";
      window.history.replaceState(null, "", url);
    }
  }, [selectedPageId]);

  useEffect(() => {
    latestPageId.current = selectedPageId;
    latestReadOnly.current = readOnly;
  }, [selectedPageId, readOnly]);

  useEffect(() => {
    if (storageBlocked) return;
    const save = () => {
      try {
        const snapshot = {
          format: "folio-demo",
          version: 1,
          pages: pages.map((page) => ({ ...page, document: createFolioSnapshot(page.document) })),
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
        setSaveState("saved");
      } catch {
        setSaveState("failed");
      }
    };
    const timer = window.setTimeout(save, 350);
    window.addEventListener("pagehide", save);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", save);
    };
  }, [pages, storageBlocked, retrySave]);

  const uploadImage = useMemo(
    () => async (file: File) => {
      const result = await uploadDemoImage(file, locale);
      // JSON length conservatively includes keys and gives headroom for node attributes.
      if (
        JSON.stringify(selectedPage?.document).length + result.src.length + 20_000 >
        defaultFolioDocumentLimits.maxTextLength
      )
        throw new Error(messages[locale].imageBudget);
      return result;
    },
    [locale, selectedPage?.document],
  );

  function changePages(update: (currentPages: DemoPage[]) => DemoPage[]) {
    clearEditorError();
    setSaveState("saving");
    setPages(update);
  }

  function clearEditorError() {
    setNotice((current) => (current?.source === "editor" ? undefined : current));
  }

  function handleCreatePage() {
    if (readOnly || pages.length >= 100) return;
    const page = createBlankPage();
    setFeatures((current) => ({
      ...current,
      comments: new Map([...current.comments, [page.id, createMemoryCommentStore()]]),
    }));
    void features.history.create(page.id, {
      document: page.document,
      label: "Initial demo version",
      author: { id: "maya", name: "Maya" },
    });
    if (collaboration) setCollaboration(createDemoCollaboration(page.document));

    changePages((currentPages) => [page, ...currentPages]);
    setSelectedPageId(page.id);
  }

  function handleReset() {
    if (readOnly) return;
    setSaveState("saving");
    setPages(starterPages);
    setFeatures(createDemoPageFeatures(starterPages));
    if (collaboration) setCollaboration(createDemoCollaboration(starterPages[0].document));
    setSelectedPageId(starterPages[0].id);
    setStorageBlocked(false);
    setRetrySave((value) => value + 1);
    setNotice(undefined);
  }

  function handleExport() {
    if (!selectedPage) return;
    try {
      const name = (selectedPage.title.trim() || "folio-document")
        // oxlint-disable-next-line no-control-regex -- Download filenames must exclude control characters.
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
        .slice(0, 80);
      const document = parseFolioDocument(selectedPage.document);
      const content =
        format === "json"
          ? JSON.stringify(createFolioSnapshot(document), null, 2)
          : format === "html"
            ? toHTML(document)
            : toMarkdown(document, { headingIds: "omit-matching-toc" });
      const extension = format === "markdown" ? "md" : format;
      downloadFile(
        content,
        `${name}.${extension}`,
        format === "json"
          ? "application/json"
          : format === "html"
            ? "text/html;charset=utf-8"
            : "text/markdown;charset=utf-8",
      );
      setNotice({ kind: "success", message: copy.exported });
    } catch (error) {
      setNotice({
        kind: "error",
        message: `${copy.exportFailed} ${error instanceof Error ? error.message : ""}`,
      });
    }
  }

  async function handleImport(file: File) {
    if (!selectedPage || readOnly) return;
    const targetId = selectedPage.id;
    const importFormat = format;
    setImporting(true);
    setNotice(undefined);
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error(copy.fileLimit);
      const content = await file.text();
      const document =
        importFormat === "json"
          ? parseFolioSnapshot(content).document
          : importFormat === "html"
            ? fromHTML(content)
            : fromMarkdown(content);
      parseFolioDocument(document);
      assertSafeDocumentUrls(document);
      if (latestPageId.current !== targetId || latestReadOnly.current)
        throw new Error(copy.importChanged);
      changePages((currentPages) => updatePageDocument(currentPages, targetId, document));
      if (collaboration) setCollaboration(createDemoCollaboration(document));
      setNotice({ kind: "success", message: copy.imported });
    } catch (error) {
      setNotice({
        kind: "error",
        message: `${copy.importFailed} ${error instanceof Error ? error.message : ""}`,
      });
    } finally {
      setImporting(false);
      if (importInput.current) importInput.current.value = "";
    }
  }

  if (!selectedPage) return null;

  return (
    <div className="folio-demo" data-testid="folio-demo" lang={locale}>
      <nav aria-label={copy.pages} className="folio-demo__sidebar">
        <div className="folio-demo__brand">
          <span className="folio-demo__brand-mark">F</span>
          <span>Folio</span>
        </div>

        <div className="folio-demo__search">
          <Search aria-hidden size={15} />
          <input
            aria-label={copy.searchPages}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.search}
            value={query}
          />
        </div>

        <div className="folio-demo__section-label">
          <Folder aria-hidden size={14} />
          <span>{copy.pages}</span>
        </div>

        <div className="folio-demo__page-list">
          {filteredPages.map((page) => (
            <button
              aria-current={page.id === selectedPage.id ? "page" : undefined}
              className="folio-demo__page-button"
              key={page.id}
              onClick={() => {
                clearEditorError();
                if (collaboration && page.id !== selectedPageId)
                  setCollaboration(createDemoCollaboration(page.document));
                setSelectedPageId(page.id);
              }}
              type="button"
            >
              <span>{page.icon}</span>
              <span>{page.title.trim() || copy.untitled}</span>
            </button>
          ))}
        </div>

        <button
          className="folio-demo__sidebar-action"
          disabled={readOnly || pages.length >= 100}
          onClick={handleCreatePage}
          type="button"
        >
          <Plus aria-hidden size={15} />
          <span>{copy.newPage}</span>
        </button>

        <section aria-label={copy.tools} className="folio-demo__tools">
          <h2>{copy.tools}</h2>
          <label>
            {copy.language}
            <select
              onChange={(event) => setLocale(event.target.value as DemoLocale)}
              value={locale}
            >
              <option value="en">English</option>
              <option value="zh-CN">简体中文</option>
            </select>
          </label>
          <label className="folio-demo__toggle">
            <input
              checked={readOnly}
              aria-checked={readOnly}
              onChange={(event) => setReadOnly(event.target.checked)}
              role="switch"
              type="checkbox"
            />
            {copy.readOnly}
          </label>
          <label>
            {copy.format}
            <select
              disabled={importing}
              onChange={(event) => setFormat(event.target.value as DocumentFormat)}
              value={format}
            >
              <option value="json">JSON</option>
              <option value="html">HTML</option>
              <option value="markdown">Markdown</option>
            </select>
          </label>
          <div className="folio-demo__file-actions">
            <button
              disabled={readOnly || importing}
              onClick={() => importInput.current?.click()}
              type="button"
            >
              {copy.import}
            </button>
            <button disabled={importing} onClick={handleExport} type="button">
              {copy.export}
            </button>
          </div>
          <input
            accept={
              format === "json"
                ? ".json,application/json"
                : format === "html"
                  ? ".html,.htm,text/html"
                  : ".md,.markdown,text/markdown,text/plain"
            }
            aria-label={copy.importFile}
            className="folio-demo__file-input"
            disabled={readOnly || importing}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImport(file);
            }}
            ref={importInput}
            type="file"
          />
          <p>{copy.markdownHelp}</p>
          <p>{copy.uploadHelp}</p>
          <DemoFeatureControls
            locale={locale}
            settings={featureSettings}
            onChange={setFeatureSettings}
            collaborating={Boolean(collaboration)}
            onCollaborationChange={(enabled) =>
              setCollaboration(enabled ? createDemoCollaboration(selectedPage.document) : null)
            }
          />
          {loaded.original && loaded.blocked ? (
            <button
              onClick={() =>
                downloadFile(loaded.original!, "folio-original-backup.json", "application/json")
              }
              type="button"
            >
              {copy.backup}
            </button>
          ) : null}
        </section>
      </nav>

      <main aria-label={copy.editor} className="folio-demo__editor-shell">
        <header className="folio-demo__topbar">
          <div className="folio-demo__crumb">
            <FileText aria-hidden size={16} />
            <span>{selectedPage.title.trim() || copy.untitled}</span>
          </div>
          <div className="folio-demo__status">
            <span role="status">
              {storageBlocked || saveState === "failed" ? copy.saveFailed : copy[saveState]}
            </span>
            <span>{formatUpdatedAt(selectedPage.updatedAt, locale)}</span>
          </div>
          <div className="folio-demo__toolbar">
            <button
              aria-pressed={showPreview}
              onClick={() => setShowPreview((value) => !value)}
              title={copy.preview}
              type="button"
            >
              {showPreview ? (
                <PanelRightClose aria-hidden size={16} />
              ) : (
                <PanelRightOpen aria-hidden size={16} />
              )}
            </button>
            <button
              disabled={readOnly || importing}
              onClick={handleReset}
              title={copy.reset}
              type="button"
            >
              <RotateCcw aria-hidden size={16} />
            </button>
          </div>
        </header>

        <div className="folio-demo__feedback">
          {storageBlocked ? (
            <p className="folio-demo__error" role="alert">
              {copy.loadFailed}
            </p>
          ) : null}
          {saveState === "failed" && !storageBlocked ? (
            <p className="folio-demo__error" role="alert">
              {copy.saveFailureHelp}{" "}
              <button
                onClick={() => {
                  setSaveState("saving");
                  setRetrySave((value) => value + 1);
                }}
                type="button"
              >
                {copy.retry}
              </button>
            </p>
          ) : null}
          {importing ? <p role="status">{copy.importBusy}</p> : null}
          {notice ? (
            <p
              className={notice.kind === "error" ? "folio-demo__error" : ""}
              data-testid="demo-feedback"
              role={notice.kind === "error" ? "alert" : "status"}
            >
              {notice.message}
            </p>
          ) : null}
        </div>

        <section className="folio-demo__document">
          <input
            aria-label={copy.pageTitle}
            className="folio-demo__title"
            maxLength={5_000}
            onChange={(event) =>
              changePages((currentPages) =>
                updatePageTitle(currentPages, selectedPage.id, event.target.value),
              )
            }
            placeholder={copy.untitled}
            readOnly={readOnly}
            value={selectedPage.title}
          />
          <div className="folio-demo__editor-frame">
            <DemoFeatureEditor
              features={features}
              settings={featureSettings}
              session={collaboration}
              classNames={{ slashMenu: "folio-demo__command-menu" }}
              key={selectedPage.id}
              documentId={selectedPage.id}
              editable={!readOnly}
              locale={locale}
              mentionSuggestions={mentionSuggestions}
              onError={(error) =>
                setNotice({
                  kind: "error",
                  source: "editor",
                  message: `${copy.editorFailed} ${error.message}`,
                })
              }
              onChange={(document) =>
                changePages((currentPages) =>
                  updatePageDocument(currentPages, selectedPage.id, document),
                )
              }
              placeholder={copy.placeholder}
              uploadImage={uploadImage}
              value={selectedPage.document}
            />
          </div>
        </section>
      </main>

      {showPreview ? (
        <aside aria-label={copy.preview} className="folio-demo__preview">
          <FolioReader value={selectedPage.document} />
        </aside>
      ) : null}
    </div>
  );
}
