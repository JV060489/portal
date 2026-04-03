#!/bin/sh
set -e

# Apply schema to MongoDB (safe — no data loss)
npx prisma db push --skip-generate

# Start WebSocket server in background
npx tsx server/ws-server.ts &

# Start Inngest dev server in background (only if no cloud keys are set)
if [ -z "$INNGEST_EVENT_KEY" ]; then
  npx inngest-cli@latest dev &

  # Wait for Inngest dev server to be ready (port 8288)
  echo "Waiting for Inngest dev server..."
  until wget -q --spider http://localhost:8288 2>/dev/null; do
    sleep 1
  done
  echo "Inngest dev server is ready."
fi

# Start Next.js (foreground) — Inngest auto-discovers via /api/inngest
INNGEST_DEV=1 node server.js
