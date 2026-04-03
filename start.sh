#!/bin/sh
set -e

# Apply schema to MongoDB (safe — no data loss)
npx prisma db push --skip-generate

# Start WebSocket server in background
npx tsx server/ws-server.ts &

# Start Next.js standalone server
node server.js
