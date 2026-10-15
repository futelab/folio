import type { FolioDocument } from "@futelab/folio-core/browser";
export interface FolioRevisionAuthor {
  id: string;
  name: string;
}
export interface FolioRevisionSummary {
  id: string;
  documentId: string;
  createdAt: number;
  label?: string;
  author?: FolioRevisionAuthor;
}
export interface FolioRevision extends FolioRevisionSummary {
  document: FolioDocument;
}
export interface FolioRevisionInput {
  document: FolioDocument;
  label?: string;
  author?: FolioRevisionAuthor;
}
export interface FolioHistoryAdapter {
  list: (documentId: string, signal?: AbortSignal) => Promise<FolioRevisionSummary[]>;
  load: (documentId: string, revisionId: string, signal?: AbortSignal) => Promise<FolioRevision>;
  create: (
    documentId: string,
    revision: FolioRevisionInput,
    signal?: AbortSignal,
  ) => Promise<FolioRevisionSummary>;
  subscribe?: (documentId: string, listener: () => void) => () => void;
}
export interface FolioHistoryOptions {
  adapter: FolioHistoryAdapter;
  author?: FolioRevisionAuthor;
  /** Zero disables automatic checkpoints. Defaults to 30 seconds. */
  autoSaveIntervalMs?: number;
  onError?: (error: Error) => void;
}
export function assertRevisionSummary(value: FolioRevisionSummary, documentId: string): void {
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.documentId !== "string" ||
    value.documentId !== documentId ||
    !Number.isFinite(value.createdAt) ||
    value.createdAt < 0 ||
    (value.label !== undefined && typeof value.label !== "string") ||
    (value.author !== undefined &&
      (!value.author ||
        typeof value.author.id !== "string" ||
        typeof value.author.name !== "string"))
  )
    throw new Error("The history adapter returned invalid revision metadata or another document.");
}
