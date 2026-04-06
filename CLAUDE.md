# Portal — 3D Codex for Designers

A collaborative 3D design tool that bridges a web-based editor with Blender via live sync, enabling designers to work on 3D scenes in the browser and synchronize changes bidirectionally with Blender.

## Architecture Overview

Portal consists of two main systems connected by a real-time sync layer:

- **Web App** (this repo) — Next.js frontend with a 3D editor, AI chat interface, project/scene management
- **Blender Plugin** (separate) — Python plugin that connects to the web app via MCP server, syncs scene data bidirectionally
- **Sync Layer** — YJS-based global JSON state with constant sync between web and Blender via WebSockets

## Tech Stack

### Frontend
- **Framework:** Next.js 16 (App Router, Turbopack)
- **UI:** React 19, Tailwind CSS v4
- **3D:** React Three Fiber (R3F), drei, Leva (controls)
- **Animation:** Framer Motion (editor UI), GSAP (landing page)
- **Tree View:** react-arborist (scene collection / project tree)

### Backend
- **Runtime:** Next.js API routes
- **Database:** MongoDB Atlas via Prisma 6.19 (`prisma-client-js`)
- **Auth:** Better Auth (email/password + username plugin + Google OAuth)
- **Real-time:** WebSockets, YJS (CRDT sync)

### AI
- **SDK:** Vercel AI SDK, MCP TypeScript SDK
- **UI:** assistant-ui (React chat components)

### Cloud / Infra
- **Database:** MongoDB Atlas
- **Deployment:** Vercel (planned)

## Project Structure

```
app/
├── page.tsx                     # Landing page
├── layout.tsx                   # Root layout (Lexend font)
├── globals.css                  # Global styles
├── (auth)/
│   ├── sign-in/page.tsx         # Sign-in page
│   └── sign-up/page.tsx         # Sign-up page
├── api/auth/[...all]/route.ts   # Better Auth API handler
└── editor/
    ├── page.tsx                 # Editor page
    ├── layout.tsx               # Editor layout (banner + sidebar + canvas)
    └── _components/
        ├── Projects.tsx         # Project/scene tree sidebar
        └── TopBanner.tsx        # Welcome banner + logout
lib/
├── auth.ts                      # Better Auth server config
└── auth-client.ts               # Better Auth React client
prisma/
└── schema.prisma                # MongoDB schema (User, Session, Account, Verification)
middleware.ts                    # Auth guard for /editor routes
```

## Key Conventions

- **Package manager:** pnpm
- **Prisma CLI:** Always use `pnpm exec prisma` (local v6.19), NOT `npx prisma` (global v7 will break)
- **MongoDB:** All Prisma models use `@id @default(auto()) @map("_id") @db.ObjectId` pattern
- **Auth IDs:** Better Auth configured with `advanced.database.generateId` using MongoDB ObjectId
- **Components:** Editor components go in `app/editor/_components/`
- **Auth pages:** Grouped under `app/(auth)/` route group
- **Styling:** Tailwind CSS v4 with dark theme (neutral-950 backgrounds)
- **Font:** Lexend (Google Fonts)

## Environment Variables

```
DATABASE_URL          # MongoDB Atlas connection string (must include database name: /portal)
BETTER_AUTH_SECRET    # Auth encryption secret (32+ chars)
BETTER_AUTH_URL       # Base URL (http://localhost:3000)
GOOGLE_CLIENT_ID      # Google OAuth client ID
GOOGLE_CLIENT_SECRET  # Google OAuth client secret
```

## Common Commands

```bash
pnpm dev                    # Start dev server
pnpm build                  # Production build
pnpm exec prisma db push    # Push schema to MongoDB (MUST use pnpm exec)
pnpm exec prisma generate   # Regenerate Prisma client
pnpm exec prisma studio     # Open Prisma Studio
```

### Rules to follow 
Always refer to the latest docs before implementing any feature

