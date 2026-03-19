"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { createUndoManager } from "./undo";
import { useSession } from "@/lib/auth-client";

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface YjsContextValue {
  doc: Y.Doc;
  sceneMap: Y.Map<unknown>;
  undoManager: Y.UndoManager;
  connected: boolean;
  synced: boolean;
}

const YjsContext = createContext<YjsContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider component
// ---------------------------------------------------------------------------

interface YjsProviderProps {
  sceneId: string;
  children: ReactNode;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4444";

export function YjsProvider({ sceneId, children }: YjsProviderProps) {
  const { data: session } = useSession();
  const [ctx, setCtx] = useState<YjsContextValue | null>(null);

  const token = session?.session?.token;

  useEffect(() => {
    if (!token) return;

    const doc = new Y.Doc();
    const sceneMap = doc.getMap("scene");
    let undoManager: Y.UndoManager | null = null;

    const wsProvider = new WebsocketProvider(
      WS_URL,
      `scene/${sceneId}`,
      doc,
      {
        connect: true,
        params: { token },
      }
    );

    let connected = false;
    let synced = false;

    const updateCtx = () => {
      if (!connected || !synced || !undoManager) {
        setCtx(null);
        return;
      }
      setCtx({ doc, sceneMap, undoManager, connected, synced });
    };

    wsProvider.on("status", ({ status }: { status: string }) => {
      connected = status === "connected";
      updateCtx();
    });

    wsProvider.on("sync", (isSynced: boolean) => {
      synced = isSynced;
      if (isSynced && !undoManager) {
        const objectsMap = sceneMap.get("objects") as Y.Map<unknown>;
        if (objectsMap) {
          undoManager = createUndoManager(objectsMap);
        }
      }
      updateCtx();
    });

    return () => {
      undoManager?.destroy();
      wsProvider.disconnect();
      wsProvider.destroy();
      doc.destroy();
      setCtx(null);
    };
  }, [sceneId, token]);

  if (!token) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-neutral-950 text-neutral-400">
        Authenticating...
      </div>
    );
  }

  if (!ctx) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-neutral-950 text-neutral-400">
        Connecting to scene...
      </div>
    );
  }

  return <YjsContext.Provider value={ctx}>{children}</YjsContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useYjs(): YjsContextValue {
  const ctx = useContext(YjsContext);
  if (!ctx) {
    throw new Error("useYjs must be used within a YjsProvider");
  }
  return ctx;
}
