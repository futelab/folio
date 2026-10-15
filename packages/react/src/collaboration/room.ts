import { Doc, applyUpdate, encodeStateAsUpdate } from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import type { FolioCollaborationProvider } from "./types";
import { getSchema } from "@tiptap/core";
import {
  createDefaultTiptapExtensions,
  parseFolioDocument,
  type FolioDocument,
  type FolioExtension,
} from "@futelab/folio-core/browser";
import { initializeFolioCollaboration } from "./extension";

export interface FolioLocalCollaborationProvider extends FolioCollaborationProvider {
  awareness: Awareness;
  document: Doc;
  destroy: () => void;
}

/** An in-process transport for demos/tests; network transports use the same API. */
export function createFolioCollaborationRoom(
  options: { initialValue?: FolioDocument; extensions?: FolioExtension[] } = {},
) {
  const document = new Doc();
  if (options.initialValue)
    initializeFolioCollaboration(
      document,
      getSchema(createDefaultTiptapExtensions({ folioExtensions: options.extensions })),
      parseFolioDocument(options.initialValue, { extensions: options.extensions }),
    );
  const connected = new Set<FolioLocalCollaborationProvider>();
  const providers = new Set<FolioLocalCollaborationProvider>();
  const ownedPeers = new Set<Doc>();
  let destroyed = false;
  const room = {
    document,
    createPeer() {
      if (destroyed) throw new Error("The collaboration room is closed.");
      const peerDocument = new Doc();
      ownedPeers.add(peerDocument);
      const provider = room.createProvider(peerDocument);
      return {
        document: peerDocument,
        provider,
        destroy() {
          provider.destroy();
          if (!peerDocument.isDestroyed) peerDocument.destroy();
          ownedPeers.delete(peerDocument);
        },
      };
    },
    createProvider(peer: Doc): FolioLocalCollaborationProvider {
      if (destroyed) throw new Error("The collaboration room is closed.");
      const awareness = new Awareness(peer);
      const listeners = new Map<string, Set<(event: any) => void>>();
      let active = false;
      let disposed = false;
      const emit = (event: string, value: unknown) => {
        for (const listener of listeners.get(event) ?? []) listener(value);
      };
      const peerUpdate = (update: Uint8Array, origin: unknown) => {
        if (origin !== provider) applyUpdate(document, update, provider);
      };
      const roomUpdate = (update: Uint8Array, origin: unknown) => {
        if (origin !== provider) applyUpdate(peer, update, provider);
      };
      const awarenessUpdate = (
        change: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown,
      ) => {
        if (origin === connected) return;
        const update = encodeAwarenessUpdate(awareness, [
          ...change.added,
          ...change.updated,
          ...change.removed,
        ]);
        for (const other of connected)
          if (other !== provider) applyAwarenessUpdate(other.awareness, update, connected);
      };
      const provider: FolioLocalCollaborationProvider = {
        document: peer,
        awareness,
        synced: false,
        on(event, listener) {
          const entries = listeners.get(event) ?? new Set();
          entries.add(listener);
          listeners.set(event, entries);
        },
        off(event, listener) {
          listeners.get(event)?.delete(listener);
        },
        connect() {
          if (active || disposed || destroyed) return;
          active = true;
          emit("status", { status: "connecting" });
          peer.on("update", peerUpdate);
          document.on("update", roomUpdate);
          awareness.on("update", awarenessUpdate);
          applyUpdate(peer, encodeStateAsUpdate(document), provider);
          applyUpdate(document, encodeStateAsUpdate(peer), provider);
          // Peers retain the last awareness clock after an offline removal.
          // Advance ours so a reconnect is accepted immediately, before heartbeat.
          const localState = awareness.getLocalState();
          if (localState) awareness.setLocalState(localState);
          for (const other of connected) {
            applyAwarenessUpdate(
              awareness,
              encodeAwarenessUpdate(other.awareness, [...other.awareness.getStates().keys()]),
              connected,
            );
            applyAwarenessUpdate(
              other.awareness,
              encodeAwarenessUpdate(awareness, [awareness.clientID]),
              connected,
            );
          }
          connected.add(provider);
          provider.synced = true;
          emit("status", { status: "connected" });
          emit("sync", true);
        },
        disconnect() {
          if (!active) return;
          active = false;
          peer.off("update", peerUpdate);
          document.off("update", roomUpdate);
          awareness.off("update", awarenessUpdate);
          connected.delete(provider);
          for (const other of connected)
            removeAwarenessStates(other.awareness, [awareness.clientID], connected);
          provider.synced = false;
          emit("sync", false);
          emit("status", { status: "disconnected" });
        },
        destroy() {
          if (disposed) return;
          provider.disconnect?.();
          disposed = true;
          awareness.destroy();
          listeners.clear();
          providers.delete(provider);
        },
      };
      providers.add(provider);
      return provider;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const provider of [...providers]) provider.destroy();
      for (const peer of ownedPeers) if (!peer.isDestroyed) peer.destroy();
      ownedPeers.clear();
      document.destroy();
    },
  };
  return room;
}
