import * as Y from "yjs";

// Origins that represent local user actions (undoable)
export const LOCAL_ORIGINS = ["local-three", "local-leva"] as const;
export type LocalOrigin = (typeof LOCAL_ORIGINS)[number];

export function createUndoManager(objectsMap: Y.Map<unknown>): Y.UndoManager {
  return new Y.UndoManager(objectsMap, {
    trackedOrigins: new Set<string>(LOCAL_ORIGINS),
    captureTimeout: 500, // Group rapid changes (drag) into one undo step
  });
}
