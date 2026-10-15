import type { Awareness } from "y-protocols/awareness";
import type { Doc } from "yjs";

export interface FolioCollaborationUser {
  id: string;
  name: string;
  /** Six-digit hexadecimal color, for example #2563eb. */
  color: string;
}

export type FolioCollaborationStatus =
  | "connecting"
  | "connected"
  | "synced"
  | "disconnected"
  | "error";

/** Compatible with websocket, WebRTC, or an application's own Yjs transport. */
export interface FolioCollaborationProvider {
  awareness?: Awareness;
  synced?: boolean;
  connect?: () => unknown;
  disconnect?: () => unknown;
  on?: (event: "status" | "sync", listener: (event: any) => void) => unknown;
  off?: (event: "status" | "sync", listener: (event: any) => void) => unknown;
}

export interface FolioCollaborationOptions {
  document: Doc;
  field?: string;
  provider?: FolioCollaborationProvider;
  user?: FolioCollaborationUser;
  /** Set false when the host owns a shared provider's connection lifecycle. */
  manageConnection?: boolean;
  onStatusChange?: (status: FolioCollaborationStatus) => void;
  onError?: (error: Error) => void;
}
