import * as Y from "yjs";
import { PrismaClient } from "@prisma/client";
import { docToJSON, initializeDoc, isDocEmpty, migrateOldState } from "@/lib/yjs/scene-doc";
import { DEFAULT_SCENE_STATE } from "@/lib/yjs/types";

// ---------------------------------------------------------------------------
// Singleton Prisma client for the WS server process
// ---------------------------------------------------------------------------

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// ---------------------------------------------------------------------------
// Room tracking — for debounced persistence and collection timeout
// ---------------------------------------------------------------------------

interface RoomState {
  doc: Y.Doc;
  sceneId: string;
  dirty: boolean;
  clientCount: number;
  flushTimer: ReturnType<typeof setTimeout> | null;
  collectionTimer: ReturnType<typeof setTimeout> | null;
}

const rooms = new Map<string, RoomState>();

const DEBOUNCE_MS = 10_000; // 10s debounced writes
const COLLECTION_TIMEOUT_MS = 5 * 60_000; // 5min idle before destroying

// ---------------------------------------------------------------------------
// extractSceneId — parse "scene:<sceneId>" room name
// ---------------------------------------------------------------------------

function extractSceneId(docName: string): string | null {
  const match = docName.match(/^scene:(.+)$/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// writeStateToDB — persist Y.Doc to MongoDB (binary + JSON snapshot)
// ---------------------------------------------------------------------------

async function writeStateToDB(room: RoomState): Promise<void> {
  if (!room.dirty) return;

  const binaryState = Y.encodeStateAsUpdate(room.doc);
  const jsonSnapshot = docToJSON(room.doc);

  if (!jsonSnapshot) {
    console.error(`[persistence] Zod validation failed for scene:${room.sceneId}, refusing to write`);
    return;
  }

  try {
    await prisma.scene.update({
      where: { id: room.sceneId },
      data: {
        yjsState: Buffer.from(binaryState),
        globalData: jsonSnapshot,
      },
    });
    room.dirty = false;
    console.log(`[persistence] Saved scene:${room.sceneId}`);
  } catch (err) {
    console.error(`[persistence] Failed to save scene:${room.sceneId}:`, err);
  }
}

// ---------------------------------------------------------------------------
// scheduleDebouncedWrite — write at most every DEBOUNCE_MS
// ---------------------------------------------------------------------------

function scheduleDebouncedWrite(room: RoomState): void {
  room.dirty = true;
  if (room.flushTimer) return; // already scheduled

  room.flushTimer = setTimeout(async () => {
    room.flushTimer = null;
    await writeStateToDB(room);
  }, DEBOUNCE_MS);
}

// ---------------------------------------------------------------------------
// bindState — load Y.Doc from MongoDB (called when a room is first opened)
// ---------------------------------------------------------------------------

export async function bindState(docName: string, doc: Y.Doc): Promise<void> {
  const sceneId = extractSceneId(docName);
  if (!sceneId) {
    console.error(`[persistence] Invalid room name: ${docName}`);
    return;
  }

  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    select: { yjsState: true, globalData: true },
  });

  if (!scene) {
    console.error(`[persistence] Scene not found: ${sceneId}`);
    return;
  }

  // Server-authoritative initialization
  if (scene.yjsState) {
    // Load from binary YJS state
    Y.applyUpdate(doc, new Uint8Array(scene.yjsState));
  } else {
    // First time: migrate from old globalData format
    const oldData = scene.globalData as Record<string, unknown>;
    const hasOldFormat = oldData && ("camera" in oldData || "cube" in oldData);
    const state = hasOldFormat
      ? migrateOldState(oldData)
      : DEFAULT_SCENE_STATE;

    initializeDoc(doc, state);
  }

  // Track room
  const room: RoomState = {
    doc,
    sceneId,
    dirty: false,
    clientCount: 0,
    flushTimer: null,
    collectionTimer: null,
  };
  rooms.set(docName, room);

  // Listen for changes to schedule debounced writes
  doc.on("update", () => {
    scheduleDebouncedWrite(room);
  });
}

// ---------------------------------------------------------------------------
// Client connect/disconnect tracking + collection timeout
// ---------------------------------------------------------------------------

export function onClientConnect(docName: string): void {
  const room = rooms.get(docName);
  if (!room) return;

  room.clientCount++;

  // Cancel collection timeout if any
  if (room.collectionTimer) {
    clearTimeout(room.collectionTimer);
    room.collectionTimer = null;
  }
}

export function onClientDisconnect(docName: string): void {
  const room = rooms.get(docName);
  if (!room) return;

  room.clientCount = Math.max(0, room.clientCount - 1);

  if (room.clientCount === 0) {
    // Start collection timeout
    room.collectionTimer = setTimeout(async () => {
      // Flush any pending writes
      if (room.flushTimer) {
        clearTimeout(room.flushTimer);
        room.flushTimer = null;
      }
      await writeStateToDB(room);

      // Destroy from memory
      room.doc.destroy();
      rooms.delete(docName);
      console.log(`[persistence] Collected idle room: ${docName}`);
    }, COLLECTION_TIMEOUT_MS);
  }
}

// ---------------------------------------------------------------------------
// flushAll — flush all dirty docs (called on graceful shutdown)
// ---------------------------------------------------------------------------

export async function flushAll(): Promise<void> {
  console.log(`[persistence] Flushing ${rooms.size} rooms...`);
  const promises: Promise<void>[] = [];

  for (const room of rooms.values()) {
    if (room.flushTimer) {
      clearTimeout(room.flushTimer);
      room.flushTimer = null;
    }
    room.dirty = true; // force write on shutdown
    promises.push(writeStateToDB(room));
  }

  await Promise.all(promises);
  console.log("[persistence] All rooms flushed.");
}

// ---------------------------------------------------------------------------
// getDoc — get an existing Y.Doc for a room (used by ws-server)
// ---------------------------------------------------------------------------

export function getDoc(docName: string): Y.Doc | undefined {
  return rooms.get(docName)?.doc;
}
