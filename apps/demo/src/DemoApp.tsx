import { useEffect, useMemo, useState } from "react";
import type { FolioDocument } from "@futelab/folio/core";
import { FolioEditor, FolioReader } from "@futelab/folio/react";
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

interface DemoPage {
  id: string;
  title: string;
  icon: string;
  updatedAt: number;
  document: FolioDocument;
}

const heroImage =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='640' viewBox='0 0 1200 640'%3E%3Crect width='1200' height='640' fill='%23f6f1e8'/%3E%3Crect x='112' y='96' width='976' height='448' rx='30' fill='%23ffffff'/%3E%3Crect x='168' y='154' width='352' height='28' rx='14' fill='%23d8eee4'/%3E%3Crect x='168' y='214' width='720' height='18' rx='9' fill='%23e6e1d8'/%3E%3Crect x='168' y='258' width='590' height='18' rx='9' fill='%23e6e1d8'/%3E%3Crect x='168' y='330' width='196' height='130' rx='18' fill='%23efe7d8'/%3E%3Crect x='396' y='330' width='196' height='130' rx='18' fill='%23ddebe7'/%3E%3Crect x='624' y='330' width='196' height='130' rx='18' fill='%23f3ded7'/%3E%3Cpath d='M906 156c44 64 54 138 29 222-17 57-58 99-124 126' fill='none' stroke='%2394a196' stroke-width='18' stroke-linecap='round'/%3E%3C/svg%3E";

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
          attrs: { tone: "info", icon: "⚑" },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Type / in the editor to open block commands while keeping the writing surface clear." }],
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
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Callout, task list, toggle" }] }],
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
                    { type: "text", text: "Default content is JSON-first. Reader output should match saved editor output." },
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
            { type: "text", text: " · Focus on document density, block controls, and publishing safety." },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Keep editing surface calm and content-first." }] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Make reader parity visible next to editor state." }] }],
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
    id: `page-${createdAt}`,
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

function getDisplayTitle(title: string): string {
  return title.trim() || UNTITLED_PAGE_LABEL;
}

function loadPages(): DemoPage[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (!stored) return starterPages;

    const parsed = JSON.parse(stored) as DemoPage[];

    return Array.isArray(parsed) && parsed.length ? parsed : starterPages;
  } catch {
    return starterPages;
  }
}

function formatUpdatedAt(value: number): string {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
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

function updatePageTitle(
  pages: DemoPage[],
  pageId: string,
  title: string,
): DemoPage[] {
  return pages.map((page) =>
    page.id === pageId ? { ...page, title, updatedAt: Date.now() } : page,
  );
}

function isDocumentBlank(document: FolioDocument): boolean {
  const blocks = document.content ?? [];

  return (
    blocks.length === 1 &&
    blocks[0]?.type === "paragraph" &&
    (blocks[0].content?.length ?? 0) === 0
  );
}

export function DemoApp() {
  const [pages, setPages] = useState<DemoPage[]>(loadPages);
  const [selectedPageId, setSelectedPageId] = useState(pages[0]?.id ?? starterPages[0].id);
  const [query, setQuery] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const selectedPage = useMemo(
    () => pages.find((page) => page.id === selectedPageId) ?? pages[0],
    [pages, selectedPageId],
  );
  const filteredPages = useMemo(
    () =>
      pages.filter((page) =>
        getDisplayTitle(page.title)
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [pages, query],
  );

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
  }, [pages]);

  function handleCreatePage() {
    const page = createBlankPage();

    setPages((currentPages) => [page, ...currentPages]);
    setSelectedPageId(page.id);
  }

  function handleReset() {
    setPages(starterPages);
    setSelectedPageId(starterPages[0].id);
  }

  if (!selectedPage) return null;

  return (
    <div className="folio-demo" data-testid="folio-demo">
      <nav aria-label="Pages" className="folio-demo__sidebar">
        <div className="folio-demo__brand">
          <span className="folio-demo__brand-mark">F</span>
          <span>Folio</span>
        </div>

        <div className="folio-demo__search">
          <Search aria-hidden size={15} />
          <input
            aria-label="Search pages"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            value={query}
          />
        </div>

        <div className="folio-demo__section-label">
          <Folder aria-hidden size={14} />
          <span>Pages</span>
        </div>

        <div className="folio-demo__page-list">
          {filteredPages.map((page) => (
            <button
              aria-current={page.id === selectedPage.id ? "page" : undefined}
              className="folio-demo__page-button"
              key={page.id}
              onClick={() => setSelectedPageId(page.id)}
              type="button"
            >
              <span>{page.icon}</span>
              <span>{getDisplayTitle(page.title)}</span>
            </button>
          ))}
        </div>

        <button className="folio-demo__sidebar-action" onClick={handleCreatePage} type="button">
          <Plus aria-hidden size={15} />
          <span>New page</span>
        </button>
      </nav>

      <main aria-label="Editor" className="folio-demo__editor-shell">
        <header className="folio-demo__topbar">
          <div className="folio-demo__crumb">
            <FileText aria-hidden size={16} />
            <span>{getDisplayTitle(selectedPage.title)}</span>
          </div>
          <div className="folio-demo__status">
            <span>Saved locally</span>
            <span>{formatUpdatedAt(selectedPage.updatedAt)}</span>
          </div>
          <div className="folio-demo__toolbar">
            <button
              aria-pressed={showPreview}
              onClick={() => setShowPreview((value) => !value)}
              title="Preview"
              type="button"
            >
              {showPreview ? (
                <PanelRightClose aria-hidden size={16} />
              ) : (
                <PanelRightOpen aria-hidden size={16} />
              )}
            </button>
            <button onClick={handleReset} title="Reset" type="button">
              <RotateCcw aria-hidden size={16} />
            </button>
          </div>
        </header>

        <section className="folio-demo__document">
          <input
            aria-label="Page title"
            className="folio-demo__title"
            onChange={(event) =>
              setPages((currentPages) =>
                updatePageTitle(currentPages, selectedPage.id, event.target.value),
              )
            }
            placeholder={UNTITLED_PAGE_LABEL}
            value={selectedPage.title}
          />
          <div className="folio-demo__editor-frame">
            {isDocumentBlank(selectedPage.document) ? (
              <span className="folio-demo__editor-placeholder">{EDITOR_PLACEHOLDER}</span>
            ) : null}
            <FolioEditor
              classNames={{ slashMenu: "folio-demo__command-menu" }}
              key={selectedPage.id}
              onChange={(document) =>
                setPages((currentPages) =>
                  updatePageDocument(currentPages, selectedPage.id, document),
                )
              }
              placeholder={EDITOR_PLACEHOLDER}
              value={selectedPage.document}
            />
          </div>
        </section>
      </main>

      {showPreview ? (
        <aside aria-label="Preview" className="folio-demo__preview">
          <FolioReader value={selectedPage.document} />
        </aside>
      ) : null}
    </div>
  );
}
