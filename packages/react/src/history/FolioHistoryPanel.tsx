import { useMemo, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { FolioDocument, FolioExtension } from "@futelab/folio-core/browser";
import { FolioReader } from "../FolioReader";
import { useDialogNavigation } from "../menus/useDialogNavigation";
import { compareFolioRevisions, type FolioHistoryController } from "./useFolioHistory";

export interface FolioHistoryLabels {
  history: string;
  close: string;
  save: string;
  label: string;
  empty: string;
  restore: string;
  current: string;
  revision: string;
  added: string;
  removed: string;
  changed: string;
  busy: string;
  approximate?: string;
}
export function resolveHistoryLabels(
  locale?: string,
  overrides?: Partial<FolioHistoryLabels>,
): FolioHistoryLabels {
  return {
    ...(locale?.toLowerCase().startsWith("zh")
      ? {
          history: "版本历史",
          close: "关闭版本历史",
          save: "保存当前版本",
          label: "版本名称",
          empty: "尚无历史版本",
          restore: "恢复此版本",
          current: "当前文档",
          revision: "历史版本",
          added: "新增块",
          removed: "删除块",
          changed: "修改块",
          busy: "正在加载…",
        }
      : {
          history: "Version history",
          close: "Close version history",
          save: "Save current version",
          label: "Version name",
          empty: "No saved revisions",
          restore: "Restore this version",
          current: "Current document",
          revision: "Saved revision",
          added: "Added blocks",
          removed: "Removed blocks",
          changed: "Changed blocks",
          busy: "Loading…",
        }),
    ...overrides,
  };
}
export interface FolioHistoryPanelProps {
  editor: Editor;
  history: FolioHistoryController;
  onClose: () => void;
  labels: FolioHistoryLabels;
  locale?: string;
  extensions?: FolioExtension[];
}
export function FolioHistoryPanel({
  editor,
  history,
  onClose,
  labels,
  locale,
  extensions,
}: FolioHistoryPanelProps) {
  const panelRef = useDialogNavigation(onClose);
  const [label, setLabel] = useState("");
  const current = editor.getJSON() as FolioDocument;
  const diff = useMemo(
    () => (history.preview ? compareFolioRevisions(history.preview.document, current) : undefined),
    [history.preview, current],
  );
  return (
    <div
      className="folio-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-label={labels.history}
        aria-modal="true"
        className="folio-dialog folio-history-panel"
        ref={panelRef}
        role="dialog"
      >
        <header>
          <h2>{labels.history}</h2>
          <button aria-label={labels.close} onClick={onClose} type="button">
            ×
          </button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void history.save(label || undefined).then((saved) => {
              if (saved) setLabel("");
            });
          }}
        >
          <input
            aria-label={labels.label}
            maxLength={200}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={labels.label}
            value={label}
          />
          <button disabled={!editor.isEditable || history.busy} type="submit">
            {labels.save}
          </button>
        </form>
        {history.error ? <p role="alert">{history.error.message}</p> : null}
        {history.busy ? <p role="status">{labels.busy}</p> : null}
        <div className="folio-history-panel__body">
          <nav aria-label={labels.history}>
            {!history.revisions.length ? (
              <p>{labels.empty}</p>
            ) : (
              history.revisions.map((revision) => (
                <button
                  aria-pressed={history.preview?.id === revision.id}
                  key={revision.id}
                  onClick={() => {
                    void history.load(revision.id);
                  }}
                  type="button"
                >
                  <strong>
                    {revision.label || new Date(revision.createdAt).toLocaleString(locale)}
                  </strong>
                  {revision.author ? <small>{revision.author.name}</small> : null}
                  {revision.label ? (
                    <small>{new Date(revision.createdAt).toLocaleString(locale)}</small>
                  ) : null}
                </button>
              ))
            )}
          </nav>
          <div className="folio-history-panel__comparison">
            {history.preview ? (
              <>
                <div aria-live="polite" className="folio-history-panel__summary">
                  {labels.added}: {diff?.added} · {labels.removed}: {diff?.removed} ·{" "}
                  {labels.changed}: {diff?.changed}
                </div>
                {diff?.approximate ? (
                  <p>
                    {labels.approximate ??
                      (locale?.toLowerCase().startsWith("zh")
                        ? "大文档差异数量为近似值；下方预览保留完整内容。"
                        : "Large-document change counts are approximate; previews retain the complete content.")}
                  </p>
                ) : null}
                <div className="folio-history-panel__previews">
                  <section>
                    <h3>{labels.revision}</h3>
                    <FolioReader
                      extensions={extensions}
                      headingIdPrefix="history-before"
                      value={history.preview.document}
                    />
                  </section>
                  <section>
                    <h3>{labels.current}</h3>
                    <FolioReader
                      extensions={extensions}
                      headingIdPrefix="history-current"
                      value={current}
                    />
                  </section>
                </div>
                <button
                  disabled={!history.canRestore || history.busy}
                  onClick={() => {
                    void history.restore();
                  }}
                  type="button"
                >
                  {labels.restore}
                </button>
              </>
            ) : (
              <p>{labels.revision}</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
