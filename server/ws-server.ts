import "dotenv/config";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import {
  bindState,
  onClientConnect,
  onClientDisconnect,
  flushAll,
  prisma,
} from "./persistence.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.WS_PORT ?? "4444", 10);
const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

// ---------------------------------------------------------------------------
// Room state — docs + awareness per room
// ---------------------------------------------------------------------------

const docs = new Map<string, Y.Doc>();
const awarenessMap = new Map<string, awarenessProtocol.Awareness>();
const roomClients = new Map<string, Set<WebSocket>>();

async function getOrCreateDoc(docName: string): Promise<Y.Doc> {
  let doc = docs.get(docName);
  if (doc) return doc;

  doc = new Y.Doc();
  docs.set(docName, doc);

  const awareness = new awarenessProtocol.Awareness(doc);
  awarenessMap.set(docName, awareness);

  // Load state from MongoDB (server-authoritative init)
  await bindState(docName, doc);

  return doc;
}

// ---------------------------------------------------------------------------
// Auth — validate session token against Prisma
// ---------------------------------------------------------------------------

async function authenticateAndAuthorize(
  token: string,
  sceneId: string
): Promise<boolean> {
  try {
    const session = await prisma.session.findUnique({
      where: { token },
      select: { userId: true, expiresAt: true },
    });

    if (!session || session.expiresAt < new Date()) return false;

    const scene = await prisma.scene.findFirst({
      where: { id: sceneId, userId: session.userId },
      select: { id: true },
    });

    return !!scene;
  } catch (err) {
    console.error("[auth] Error:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Send helper
// ---------------------------------------------------------------------------

function send(ws: WebSocket, message: Uint8Array): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(message);
  }
}

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------

const httpServer = createServer((_req, res) => {
  // Health check endpoint
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", rooms: docs.size }));
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", async (ws, req) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Expected: /scene/<sceneId>
  if (pathParts.length !== 2 || pathParts[0] !== "scene") {
    ws.close(4000, "Invalid URL. Expected /scene/<sceneId>");
    return;
  }

  const sceneId = pathParts[1];
  const token = url.searchParams.get("token");

  if (!token) {
    ws.close(4001, "Missing auth token");
    return;
  }

  // Auth
  const authorized = await authenticateAndAuthorize(token, sceneId);
  if (ws.readyState !== WebSocket.OPEN) return;
  if (!authorized) {
    ws.close(4003, "Unauthorized");
    return;
  }

  const docName = `scene:${sceneId}`;

  // Get or create doc
  const doc = await getOrCreateDoc(docName);
  if (ws.readyState !== WebSocket.OPEN) return;
  const awareness = awarenessMap.get(docName)!;

  // Track client
  if (!roomClients.has(docName)) {
    roomClients.set(docName, new Set());
  }
  roomClients.get(docName)!.add(ws);
  onClientConnect(docName);

  // Send initial sync step 1
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(ws, encoding.toUint8Array(encoder));
  }

  // Send sync step 2 (full document state) so the client marks itself as synced
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeSyncStep2(encoder, doc);
    send(ws, encoding.toUint8Array(encoder));
  }

  // Send current awareness state
  {
    const awarenessStates = awareness.getStates();
    if (awarenessStates.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(
          awareness,
          Array.from(awarenessStates.keys())
        )
      );
      send(ws, encoding.toUint8Array(encoder));
    }
  }

  // Handle incoming messages
  ws.on("message", (data: ArrayBuffer | Buffer) => {
    const message = new Uint8Array(data as ArrayBuffer);
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case MSG_SYNC: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, doc, ws);
        if (encoding.length(encoder) > 1) {
          send(ws, encoding.toUint8Array(encoder));
        }
        break;
      }
      case MSG_AWARENESS: {
        const update = decoding.readVarUint8Array(decoder);
        awarenessProtocol.applyAwarenessUpdate(awareness, update, ws);
        break;
      }
    }
  });

  // Broadcast doc updates to all other clients in the room
  const updateHandler = (update: Uint8Array, origin: unknown) => {
    if (origin === ws) return; // Don't echo back to sender

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);

    const clients = roomClients.get(docName);
    if (clients) {
      for (const client of clients) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          send(client, message);
        }
      }
    }
  };
  doc.on("update", updateHandler);

  // Broadcast awareness updates
  const awarenessHandler = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => {
    const changedClients = [...added, ...updated, ...removed];
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
    );
    const message = encoding.toUint8Array(encoder);

    const clients = roomClients.get(docName);
    if (clients) {
      for (const client of clients) {
        if (client !== origin && client.readyState === WebSocket.OPEN) {
          send(client, message);
        }
      }
    }
  };
  awareness.on("update", awarenessHandler);

  // Cleanup on disconnect
  ws.on("close", () => {
    doc.off("update", updateHandler);
    awareness.off("update", awarenessHandler);

    // Remove this client's presence/cursor state from awareness
    awarenessProtocol.removeAwarenessStates(awareness, [awareness.clientID], null);

    const clients = roomClients.get(docName);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        roomClients.delete(docName);
      }
    }

    onClientDisconnect(docName);
    console.log(`[ws] Client disconnected from ${docName}`);
  });

  console.log(`[ws] Client connected to ${docName}`);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown() {
  console.log("[ws] Shutting down...");
  await flushAll();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

httpServer.listen(PORT, () => {
  console.log(`[ws] YJS WebSocket server running on port ${PORT}`);
});
