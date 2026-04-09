"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import * as Y from "yjs";
import type { SceneObjectData, CameraData } from "./types";
import {
  createDefaultObject,
  createGeneratedObject,
  getPrimitiveLocalBounds,
  type ShapeGeometry,
} from "./types";
import { useYjs } from "./provider";
import { computeWorldMatrix, worldToLocal, decomposeMatrix, writeTransformToMap } from "./transforms";

function readObjectDataFromMap(objMap: Y.Map<unknown>): SceneObjectData {
  const geometry = (objMap.get("geometry") as string) ?? "box";
  const geometryKind =
    (objMap.get("geometryKind") as "primitive" | "generated" | undefined) ??
    "primitive";

  return {
    type: (objMap.get("type") as string) ?? "mesh",
    geometry,
    geometryKind,
    sourceKind:
      (objMap.get("sourceKind") as "openscad" | undefined) ?? undefined,
    name: (objMap.get("name") as string) ?? "Object",
    px: (objMap.get("px") as number) ?? 0,
    py: (objMap.get("py") as number) ?? 0,
    pz: (objMap.get("pz") as number) ?? 0,
    rx: (objMap.get("rx") as number) ?? 0,
    ry: (objMap.get("ry") as number) ?? 0,
    rz: (objMap.get("rz") as number) ?? 0,
    sx: (objMap.get("sx") as number) ?? 1,
    sy: (objMap.get("sy") as number) ?? 1,
    sz: (objMap.get("sz") as number) ?? 1,
    materialColor: (objMap.get("materialColor") as string) ?? "#ffffff",
    parentId: (objMap.get("parentId") as string | undefined) ?? undefined,
    localBounds:
      (objMap.get("localBounds") as SceneObjectData["localBounds"]) ??
      (geometryKind === "primitive"
        ? getPrimitiveLocalBounds(geometry as ShapeGeometry)
        : undefined),
    boundsVersion: (objMap.get("boundsVersion") as number) ?? 1,
    geometryRevision: (objMap.get("geometryRevision") as number) ?? 1,
    openscadCode:
      (objMap.get("openscadCode") as string | undefined) ?? undefined,
    generatedPrompt:
      (objMap.get("generatedPrompt") as string | undefined) ?? undefined,
    compileStatus:
      (objMap.get("compileStatus") as SceneObjectData["compileStatus"]) ?? "idle",
    compileError:
      (objMap.get("compileError") as string | undefined) ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// useYjsObject — bind a single Y.Map object to a Three.js mesh
// ---------------------------------------------------------------------------

export function useYjsObject(objectId: string) {
  const { doc, sceneMap, connected } = useYjs();
  const isApplyingRemote = useRef(false);
  const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingData = useRef<Partial<SceneObjectData> | null>(null);

  const getObjectMap = useCallback((): Y.Map<unknown> | undefined => {
    const objects = sceneMap.get("objects") as Y.Map<Y.Map<unknown>> | undefined;
    return objects?.get(objectId);
  }, [sceneMap, objectId]);

  // Write local Three.js transforms to Y.Doc (throttled)
  const writeTransform = useCallback(
    (data: Partial<SceneObjectData>, immediate = false) => {
      if (!connected) return;
      if (isApplyingRemote.current) return;

      const doWrite = (writeData: Partial<SceneObjectData>) => {
        const objMap = getObjectMap();
        if (!objMap) return;

        doc.transact(() => {
          for (const [key, value] of Object.entries(writeData)) {
            objMap.set(key, value);
          }
        }, "local-three");
      };

      if (immediate) {
        if (throttleTimer.current) {
          clearTimeout(throttleTimer.current);
          throttleTimer.current = null;
        }
        pendingData.current = null;
        doWrite(data);
        return;
      }

      // Always store the latest data so the throttled write uses fresh values
      pendingData.current = data;

      // Throttle to ~15 writes/sec during drag
      if (!throttleTimer.current) {
        throttleTimer.current = setTimeout(() => {
          throttleTimer.current = null;
          if (pendingData.current) {
            doWrite(pendingData.current);
            pendingData.current = null;
          }
        }, 66);
      }
    },
    [doc, getObjectMap, connected]
  );

  // Observe remote changes and apply to mesh via callback
  const observeObject = useCallback(
    (onRemoteChange: (data: Partial<SceneObjectData>) => void) => {
      const objMap = getObjectMap();
      if (!objMap) return () => {};

      const handler = (event: Y.YMapEvent<unknown>) => {
        if (
          event.transaction.origin === "local-three" ||
          event.transaction.origin === "local-leva"
        ) {
          return;
        }

        const changes: Partial<SceneObjectData> = {};
        for (const key of event.keysChanged) {
          (changes as Record<string, unknown>)[key] = objMap.get(key);
        }

        isApplyingRemote.current = true;
        onRemoteChange(changes);
        isApplyingRemote.current = false;
      };

      objMap.observe(handler);
      return () => objMap.unobserve(handler);
    },
    [getObjectMap]
  );

  // Read current state from Y.Doc
  const readObject = useCallback((): SceneObjectData | null => {
    const objMap = getObjectMap();
    if (!objMap) return null;
    return readObjectDataFromMap(objMap);
  }, [getObjectMap]);

  const writeObjectData = useCallback(
    (data: Partial<SceneObjectData>) => {
      if (!connected) return;
      const objMap = getObjectMap();
      if (!objMap) return;

      doc.transact(() => {
        for (const [key, value] of Object.entries(data)) {
          if (value === undefined) {
            objMap.delete(key);
          } else {
            objMap.set(key, value);
          }
        }
      }, "local-three");
    },
    [connected, doc, getObjectMap],
  );

  // Flush pending writes and clear timer on unmount to prevent stale writes
  useEffect(() => {
    return () => {
      if (throttleTimer.current) {
        clearTimeout(throttleTimer.current);
        throttleTimer.current = null;
      }
      // Flush any pending data so YJS has the latest state
      if (pendingData.current && connected) {
        const objMap = getObjectMap();
        if (objMap) {
          doc.transact(() => {
            for (const [key, value] of Object.entries(pendingData.current!)) {
              objMap.set(key, value);
            }
          }, "local-three");
        }
        pendingData.current = null;
      }
    };
  }, [doc, getObjectMap, connected]);

  return {
    writeTransform,
    writeObjectData,
    observeObject,
    readObject,
    isApplyingRemote,
  };
}

// ---------------------------------------------------------------------------
// useYjsCamera — bind camera to Y.Doc
// ---------------------------------------------------------------------------

export function useYjsCamera() {
  const { doc, sceneMap, connected } = useYjs();
  const isApplyingRemote = useRef(false);

  const getCameraMap = useCallback((): Y.Map<number> | undefined => {
    return sceneMap.get("camera") as Y.Map<number> | undefined;
  }, [sceneMap]);

  const writeCamera = useCallback(
    (data: Partial<CameraData>) => {
      if (!connected) return;
      if (isApplyingRemote.current) return;

      const camMap = getCameraMap();
      if (!camMap) return;

      doc.transact(() => {
        for (const [key, value] of Object.entries(data)) {
          camMap.set(key, value);
        }
      }, "local-three");
    },
    [doc, getCameraMap, connected]
  );

  const observeCamera = useCallback(
    (onRemoteChange: (data: Partial<CameraData>) => void) => {
      const camMap = getCameraMap();
      if (!camMap) return () => {};

      const handler = (event: Y.YMapEvent<number>) => {
        if (
          event.transaction.origin === "local-three" ||
          event.transaction.origin === "local-leva"
        ) {
          return;
        }

        const changes: Partial<CameraData> = {};
        for (const key of event.keysChanged) {
          (changes as Record<string, number>)[key] = camMap.get(key)!;
        }

        isApplyingRemote.current = true;
        onRemoteChange(changes);
        isApplyingRemote.current = false;
      };

      camMap.observe(handler);
      return () => camMap.unobserve(handler);
    },
    [getCameraMap]
  );

  const readCamera = useCallback((): CameraData | null => {
    const camMap = getCameraMap();
    if (!camMap) return null;

    return {
      px: camMap.get("px") ?? 5,
      py: camMap.get("py") ?? 4,
      pz: camMap.get("pz") ?? 5,
      tx: camMap.get("tx") ?? 0,
      ty: camMap.get("ty") ?? 0,
      tz: camMap.get("tz") ?? 0,
    };
  }, [getCameraMap]);

  return { writeCamera, observeCamera, readCamera, isApplyingRemote };
}

// ---------------------------------------------------------------------------
// useYjsObjectIds — observe the objects map for add/remove
// ---------------------------------------------------------------------------

export function useYjsObjectIds(): string[] {
  const { sceneMap, synced } = useYjs();

  const readKeys = (): string[] => {
    if (!synced) return [];
    const objects = sceneMap.get("objects") as Y.Map<Y.Map<unknown>> | undefined;
    return objects ? Array.from(objects.keys()) : [];
  };

  // Re-initialize state when deps change by tracking them
  const [prevDeps, setPrevDeps] = useState({ sceneMap, synced });
  const [ids, setIds] = useState<string[]>(readKeys);

  if (prevDeps.sceneMap !== sceneMap || prevDeps.synced !== synced) {
    setPrevDeps({ sceneMap, synced });
    setIds(readKeys());
  }

  useEffect(() => {
    if (!synced) return;

    const objects = sceneMap.get("objects") as Y.Map<Y.Map<unknown>> | undefined;
    if (!objects) return;

    const handler = () => {
      setIds(Array.from(objects.keys()));
    };

    objects.observe(handler);
    return () => objects.unobserve(handler);
  }, [sceneMap, synced]);

  return ids;
}

// ---------------------------------------------------------------------------
// useYjsObjects — returns { id, name, geometry }[] with live updates
// ---------------------------------------------------------------------------

export type SceneObjectInfo = SceneObjectData & { id: string };

export function useYjsObjects(): SceneObjectInfo[] {
  const { sceneMap, synced } = useYjs();
  const [objects, setObjects] = useState<SceneObjectInfo[]>([]);

  useEffect(() => {
    if (!synced) return;

    const objectsMap = sceneMap.get("objects") as
      | Y.Map<Y.Map<unknown>>
      | undefined;
    if (!objectsMap) return;

    const readAll = () => {
      const result: SceneObjectInfo[] = [];
      objectsMap.forEach((objMap, id) => {
        result.push({ id, ...readObjectDataFromMap(objMap) });
      });
      setObjects(result);
    };

    readAll();

    // Observe add/remove of objects
    const topHandler = () => readAll();
    objectsMap.observeDeep(topHandler);

    return () => objectsMap.unobserveDeep(topHandler);
  }, [sceneMap, synced]);

  return objects;
}

// Strip trailing " (N)" suffix to get the base name for deduplication
function getBaseName(name: string): string {
  return name.replace(/ \(\d+\)$/, "");
}

// Generate a unique name given a base and existing names set
function deduplicateName(baseName: string, existingNames: Set<string>): string {
  const base = getBaseName(baseName);
  if (!existingNames.has(base)) return base;
  let counter = 1;
  while (existingNames.has(`${base} (${counter})`)) {
    counter++;
  }
  return `${base} (${counter})`;
}

// ---------------------------------------------------------------------------
// useYjsAddObject — add a new object to the scene
// ---------------------------------------------------------------------------

export function useYjsAddObject() {
  const { doc, sceneMap, connected } = useYjs();

  return useCallback(
    (geometry: string, baseName: string, presetId?: string): string | null => {
      if (!connected) return null;

      const objectsMap = sceneMap.get("objects") as
        | Y.Map<Y.Map<unknown>>
        | undefined;
      if (!objectsMap) return null;

      const existingNames = new Set<string>();
      objectsMap.forEach((objMap) => {
        const n = objMap.get("name") as string | undefined;
        if (n) existingNames.add(n);
      });

      const name = deduplicateName(baseName, existingNames);
      const id = presetId ?? crypto.randomUUID();
      const data = createDefaultObject(geometry as "box" | "sphere" | "cylinder" | "cone" | "torus" | "plane" | "circle" | "icosahedron", name);

      doc.transact(() => {
        const objMap = new Y.Map<unknown>();
        for (const [key, value] of Object.entries(data)) {
          objMap.set(key, value);
        }
        objectsMap.set(id, objMap);
      }, "local-three");

      return id;
    },
    [doc, sceneMap, connected],
  );
}

export function useYjsAddGeneratedObject() {
  const { doc, sceneMap, connected } = useYjs();

  return useCallback(
    (
      name: string,
      openscadCode: string,
      generatedPrompt: string,
      presetId?: string,
    ): string | null => {
      if (!connected) return null;

      const objectsMap = sceneMap.get("objects") as
        | Y.Map<Y.Map<unknown>>
        | undefined;
      if (!objectsMap) return null;

      const existingNames = new Set<string>();
      objectsMap.forEach((objMap) => {
        const currentName = objMap.get("name") as string | undefined;
        if (currentName) existingNames.add(currentName);
      });

      const dedupedName = deduplicateName(name, existingNames);
      const id = presetId ?? crypto.randomUUID();
      const data = createGeneratedObject(
        dedupedName,
        openscadCode,
        generatedPrompt,
      );

      doc.transact(() => {
        const objMap = new Y.Map<unknown>();
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) objMap.set(key, value);
        }
        objectsMap.set(id, objMap);
      }, "local-three");

      return id;
    },
    [connected, doc, sceneMap],
  );
}

// ---------------------------------------------------------------------------
// useYjsDuplicateObject — duplicate an object with same transforms
// ---------------------------------------------------------------------------

export function useYjsDuplicateObject() {
  const { doc, sceneMap, connected } = useYjs();

  return useCallback(
    (objectId: string): string | null => {
      if (!connected) return null;

      const objectsMap = sceneMap.get("objects") as
        | Y.Map<Y.Map<unknown>>
        | undefined;
      if (!objectsMap) return null;

      const sourceMap = objectsMap.get(objectId);
      if (!sourceMap) return null;

      // Collect existing names for deduplication
      const existingNames = new Set<string>();
      objectsMap.forEach((objMap) => {
        const n = objMap.get("name") as string | undefined;
        if (n) existingNames.add(n);
      });

      // Build children map for hierarchy duplication
      const allObjects: Array<{
        id: string;
        parentId?: string;
      }> = [];
      objectsMap.forEach((objMap, id) => {
        allObjects.push({
          id,
          parentId: (objMap.get("parentId") as string | undefined) ?? undefined,
        });
      });
      const childrenMap = buildChildrenMap(allObjects);
      const descendantIds = getDescendantIds(objectId, childrenMap);

      // Map old IDs to new IDs
      const newRootId = crypto.randomUUID();
      const idMapping = new Map<string, string>();
      idMapping.set(objectId, newRootId);
      for (const descId of descendantIds) {
        idMapping.set(descId, crypto.randomUUID());
      }

      doc.transact(() => {
        // Duplicate each object in the hierarchy
        for (const [oldId, newId] of idMapping) {
          const srcMap = objectsMap.get(oldId);
          if (!srcMap) continue;

          const srcData: Record<string, unknown> = {};
          srcMap.forEach((value, key) => {
            srcData[key] = value;
          });

          const srcName = (srcData.name as string) ?? "Object";
          const name = deduplicateName(srcName, existingNames);
          existingNames.add(name); // Track for subsequent deduplication

          const objMap = new Y.Map<unknown>();
          for (const [key, value] of Object.entries(srcData)) {
            if (key === "name") {
              objMap.set(key, name);
            } else if (key === "parentId" && value) {
              // Re-link to new parent ID if within duplicated subtree,
              // otherwise preserve original parent so subtree stays attached
              const newParentId = idMapping.get(value as string);
              if (newParentId) {
                objMap.set(key, newParentId);
              } else {
                objMap.set(key, value as string);
              }
            } else {
              objMap.set(key, value);
            }
          }
          objectsMap.set(newId, objMap);
        }
      }, "local-three");

      return newRootId;
    },
    [doc, sceneMap, connected],
  );
}

// ---------------------------------------------------------------------------
// useYjsDeleteObject — remove an object from the scene
// ---------------------------------------------------------------------------

export function useYjsDeleteObject() {
  const { doc, sceneMap, connected } = useYjs();

  return useCallback(
    (objectId: string) => {
      if (!connected) return;

      const objectsMap = sceneMap.get("objects") as
        | Y.Map<Y.Map<unknown>>
        | undefined;
      if (!objectsMap) return;

      doc.transact(() => {
        // Promote children to root — preserve their world positions
        objectsMap.forEach((objMap, id) => {
          if ((objMap.get("parentId") as string | undefined) === objectId) {
            const worldMat = computeWorldMatrix(id, objectsMap);
            const worldTransform = decomposeMatrix(worldMat);
            objMap.delete("parentId");
            writeTransformToMap(objMap, worldTransform);
          }
        });
        objectsMap.delete(objectId);
      }, "local-three");
    },
    [doc, sceneMap, connected],
  );
}

// ---------------------------------------------------------------------------
// useYjsBatchWriteTransform — write transforms for multiple objects atomically
// ---------------------------------------------------------------------------

export function useYjsBatchWriteTransform() {
  const { doc, sceneMap, connected } = useYjs();
  const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUpdates = useRef<Array<{ objectId: string; data: Partial<SceneObjectData> }> | null>(null);

  // Flush pending writes and clear timer on unmount
  useEffect(() => {
    return () => {
      if (throttleTimer.current) {
        clearTimeout(throttleTimer.current);
        throttleTimer.current = null;
      }
      if (pendingUpdates.current && connected) {
        const objectsMap = sceneMap.get("objects") as
          | Y.Map<Y.Map<unknown>>
          | undefined;
        if (objectsMap) {
          doc.transact(() => {
            for (const { objectId, data } of pendingUpdates.current!) {
              const objMap = objectsMap.get(objectId);
              if (!objMap) continue;
              for (const [key, value] of Object.entries(data)) {
                objMap.set(key, value);
              }
            }
          }, "local-three");
        }
        pendingUpdates.current = null;
      }
    };
  }, [doc, sceneMap, connected]);

  return useCallback(
    (updates: Array<{ objectId: string; data: Partial<SceneObjectData> }>, immediate = false) => {
      if (!connected) return;

      const objectsMap = sceneMap.get("objects") as
        | Y.Map<Y.Map<unknown>>
        | undefined;
      if (!objectsMap) return;

      const doWrite = (data: Array<{ objectId: string; data: Partial<SceneObjectData> }>) => {
        doc.transact(() => {
          for (const { objectId, data: objData } of data) {
            const objMap = objectsMap.get(objectId);
            if (!objMap) continue;
            for (const [key, value] of Object.entries(objData)) {
              objMap.set(key, value);
            }
          }
        }, "local-three");
      };

      if (immediate) {
        if (throttleTimer.current) {
          clearTimeout(throttleTimer.current);
          throttleTimer.current = null;
        }
        pendingUpdates.current = null;
        doWrite(updates);
        return;
      }

      // Always store the latest updates so the throttled write uses fresh data
      pendingUpdates.current = updates;

      if (!throttleTimer.current) {
        throttleTimer.current = setTimeout(() => {
          throttleTimer.current = null;
          if (pendingUpdates.current) {
            doWrite(pendingUpdates.current);
            pendingUpdates.current = null;
          }
        }, 66);
      }
    },
    [doc, sceneMap, connected],
  );
}

// ---------------------------------------------------------------------------
// useYjsBatchDelete — delete multiple objects atomically
// ---------------------------------------------------------------------------

export function useYjsBatchDelete() {
  const { doc, sceneMap, connected } = useYjs();

  return useCallback(
    (objectIds: string[]) => {
      if (!connected) return;

      const objectsMap = sceneMap.get("objects") as
        | Y.Map<Y.Map<unknown>>
        | undefined;
      if (!objectsMap) return;

      const deleteSet = new Set(objectIds);

      doc.transact(() => {
        // Promote children of deleted objects to root — preserve world positions
        objectsMap.forEach((objMap, id) => {
          const pid = objMap.get("parentId") as string | undefined;
          if (pid && deleteSet.has(pid) && !deleteSet.has(id)) {
            const worldMat = computeWorldMatrix(id, objectsMap);
            const worldTransform = decomposeMatrix(worldMat);
            objMap.delete("parentId");
            writeTransformToMap(objMap, worldTransform);
          }
        });
        for (const id of objectIds) {
          objectsMap.delete(id);
        }
      }, "local-three");
    },
    [doc, sceneMap, connected],
  );
}

// ---------------------------------------------------------------------------
// useYjsRenameObject — rename an object in the scene
// ---------------------------------------------------------------------------

export function useYjsRenameObject() {
  const { doc, sceneMap, connected } = useYjs();

  return useCallback(
    (objectId: string, newName: string) => {
      if (!connected) return;

      const objectsMap = sceneMap.get("objects") as
        | Y.Map<Y.Map<unknown>>
        | undefined;
      if (!objectsMap) return;

      const objMap = objectsMap.get(objectId);
      if (!objMap) return;

      // Collect existing names excluding this object
      const existingNames = new Set<string>();
      objectsMap.forEach((m, id) => {
        if (id === objectId) return;
        const n = m.get("name") as string | undefined;
        if (n) existingNames.add(n);
      });

      const name = existingNames.has(newName)
        ? deduplicateName(newName, existingNames)
        : newName;

      doc.transact(() => {
        objMap.set("name", name);
      }, "local-three");
    },
    [doc, sceneMap, connected],
  );
}

// ---------------------------------------------------------------------------
// Hierarchy helpers — pure functions for parent-child relationships
// ---------------------------------------------------------------------------

export function buildChildrenMap(
  objects: Array<{ id: string; parentId?: string }>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const obj of objects) {
    if (obj.parentId) {
      const siblings = map.get(obj.parentId) ?? [];
      siblings.push(obj.id);
      map.set(obj.parentId, siblings);
    }
  }
  return map;
}

export function getDescendantIds(objectId: string, childrenMap: Map<string, string[]>): string[] {
  const result: string[] = [];
  const stack = [objectId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const children = childrenMap.get(current) ?? [];
    for (const childId of children) {
      result.push(childId);
      stack.push(childId);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// useYjsParentObject — set parentId on child objects
// ---------------------------------------------------------------------------

export function useYjsParentObject() {
  const { doc, sceneMap, connected } = useYjs();

  return useCallback(
    (childIds: string[], parentId: string) => {
      if (!connected) return;

      const objectsMap = sceneMap.get("objects") as
        | Y.Map<Y.Map<unknown>>
        | undefined;
      if (!objectsMap) return;

      // Validate parent exists and is not one of the children
      if (!objectsMap.has(parentId) || childIds.includes(parentId)) return;

      // Circular reference prevention: walk ancestors of parentId
      const ancestors = new Set<string>();
      let current: string | undefined = parentId;
      while (current) {
        if (ancestors.has(current)) break; // already visited
        ancestors.add(current);
        const m = objectsMap.get(current);
        current = m ? (m.get("parentId") as string | undefined) : undefined;
      }
      // If any childId is an ancestor of parentId, this would create a cycle
      for (const childId of childIds) {
        if (ancestors.has(childId)) return;
      }

      // Compute the new parent's world matrix once
      const newParentWorld = computeWorldMatrix(parentId, objectsMap);

      doc.transact(() => {
        for (const childId of childIds) {
          const childMap = objectsMap.get(childId);
          if (!childMap) continue;

          // Compute child's current world matrix BEFORE reparenting
          const childWorld = computeWorldMatrix(childId, objectsMap);
          const childWorldTransform = decomposeMatrix(childWorld);

          // Set new parent
          childMap.set("parentId", parentId);

          // Recalculate local transform so the object stays in the same world position
          const newLocal = worldToLocal(childWorldTransform, newParentWorld);
          writeTransformToMap(childMap, newLocal);
        }
      }, "local-three");
    },
    [doc, sceneMap, connected],
  );
}

// ---------------------------------------------------------------------------
// useYjsUnparentObject — remove parentId from objects
// ---------------------------------------------------------------------------

export function useYjsUnparentObject() {
  const { doc, sceneMap, connected } = useYjs();

  return useCallback(
    (objectIds: string[]) => {
      if (!connected) return;

      const objectsMap = sceneMap.get("objects") as
        | Y.Map<Y.Map<unknown>>
        | undefined;
      if (!objectsMap) return;

      doc.transact(() => {
        for (const id of objectIds) {
          const objMap = objectsMap.get(id);
          if (!objMap) continue;

          // Compute world matrix BEFORE removing parent
          const worldMat = computeWorldMatrix(id, objectsMap);
          const worldTransform = decomposeMatrix(worldMat);

          // Remove parent — object becomes root, local == world
          objMap.delete("parentId");
          writeTransformToMap(objMap, worldTransform);
        }
      }, "local-three");
    },
    [doc, sceneMap, connected],
  );
}
