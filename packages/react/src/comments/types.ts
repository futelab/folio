import type { Editor } from "@tiptap/core";

export interface FolioCommentUser {
  id: string;
  name: string;
}
export interface FolioCommentAnchor {
  kind: "text" | "block";
  from: number;
  to: number;
  blockId?: string;
  orphaned?: boolean;
}
export interface FolioCommentReply {
  id: string;
  body: string;
  author: FolioCommentUser;
  createdAt: string;
}
export interface FolioCommentThread extends FolioCommentReply {
  anchor: FolioCommentAnchor;
  replies: readonly FolioCommentReply[];
  resolved: boolean;
  updatedAt: string;
}
export type FolioCommentAction =
  | "create"
  | "reply"
  | "resolve"
  | "reopen"
  | "remove"
  | "removeReply";
export interface FolioCommentPermissionRequest {
  action: FolioCommentAction;
  user: FolioCommentUser;
  thread?: FolioCommentThread;
  reply?: FolioCommentReply;
}
/** Snapshots must keep the same identity until a subscribed change is emitted. */
export interface FolioCommentStore {
  getSnapshot: () => readonly FolioCommentThread[];
  subscribe: (listener: () => void) => () => void;
  create: (thread: FolioCommentThread) => void | Promise<void>;
  reply: (threadId: string, reply: FolioCommentReply) => void | Promise<void>;
  setResolved: (threadId: string, resolved: boolean) => void | Promise<void>;
  remove: (threadId: string) => void | Promise<void>;
  removeReply?: (threadId: string, replyId: string) => void | Promise<void>;
  /** Optional persistence of mapped anchors; comments never enter document JSON. */
  updateAnchor?: (threadId: string, anchor: FolioCommentAnchor) => void | Promise<void>;
}
export interface FolioCommentsOptions {
  store: FolioCommentStore;
  user: FolioCommentUser;
  can?: (request: FolioCommentPermissionRequest) => boolean | Promise<boolean>;
  onError?: (error: Error) => void;
}
export interface FolioCommentsPanelLabels {
  title: string;
  draft: string;
  addText: string;
  addBlock: string;
  reply: string;
  resolve: string;
  reopen: string;
  remove: string;
  resolved: string;
  orphaned: string;
  empty: string;
  pending: string;
}
export interface FolioCommentsPanelProps {
  editor: Editor | null;
  options: FolioCommentsOptions;
  labels?: Partial<FolioCommentsPanelLabels>;
  className?: string;
  onSelectThread?: (thread: FolioCommentThread) => void;
}
