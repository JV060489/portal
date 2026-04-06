# Portal

**An AI-assisted browser-based 3D scene editor built with a collaboration-ready architecture.**

Portal is a full-stack web application for creating and editing 3D scenes directly in the browser. It combines an interactive 3D editor, natural-language scene manipulation, authenticated workflows, and asynchronous AI job processing. The system is also designed with real-time collaboration foundations using Yjs and WebSockets.

---

## Features

- [x] **Browser-Based 3D Editor** - Create and edit scenes with React Three Fiber, object transforms, camera controls, and scene hierarchy management
- [x] **AI Scene Editing** - Use natural language to add, rename, duplicate, recolor, and transform objects in the scene
- [x] **Async AI Workflow Pipeline** - Queue AI requests through API routes and Inngest jobs for reliable background processing
- [x] **Authentication and User Isolation** - Secure access with Better Auth plus per-user AI job tracking and limits
- [x] **Collaboration-Ready Foundation** - Real-time sync infrastructure is in place with Yjs documents and a WebSocket server
- [ ] **Sketchfab Asset Import** - Import external 3D assets into scenes
- [ ] **AI Model Generation** - Generate 3D models for rapid prototyping
- [ ] **AI Tool Orchestration** - Expand the assistant to reason across external asset and generation tools
- [ ] **Physics Validation** - Simulate and validate generated scene outputs

---

## Architecture

Portal is composed of three cooperating layers:

- **Web App (Next.js)** - 3D editor, AI chat UI, authentication, project workflows, and API endpoints
- **Async AI Layer (Inngest)** - Background job execution for AI requests, tool calling, and result persistence
- **Realtime Sync Layer (Yjs + WebSockets)** - Shared document infrastructure for collaborative scene state synchronization

---

## Why This Project Stands Out

- Demonstrates full-stack product thinking across frontend interaction design, backend workflows, authentication, and database integration
- Uses AI in a practical way: the model issues structured tool calls that map to concrete scene mutations
- Separates user-facing requests from AI execution through an async job pipeline instead of blocking the request cycle
- Shows readiness for collaborative editing through Yjs/WebSocket architecture without overstating unfinished product surface area

---

## Tech Stack

### Frontend

| Technology | Purpose |
|---|---|
| Next.js 16 | App Router, Turbopack |
| React 19 | UI framework |
| Tailwind CSS v4 | Styling |
| React Three Fiber | 3D rendering |
| drei | R3F helpers and abstractions |
| Leva | Runtime controls / debug panel |
| Framer Motion | Editor UI animations |
| react-arborist | Scene tree / project hierarchy |

### Backend

| Technology | Purpose |
|---|---|
| Next.js API Routes | Server endpoints |
| tRPC | Type-safe API layer |
| MongoDB Atlas | Database |
| Prisma 6.19 | ORM |
| Better Auth | Authentication (email/password, Google OAuth) |
| Inngest | Background jobs and event-driven functions |
| Yjs + WebSockets | Realtime shared-state synchronization |

### AI

| Technology | Purpose |
|---|---|
| Vercel AI SDK | LLM integration |
| AI SDK (Google, OpenAI) | Multi-provider model access |
| assistant-ui | React chat components |
| MCP TypeScript SDK | Model Context Protocol for tool orchestration |

### Monitoring

| Technology | Purpose |
|---|---|
| Sentry | Error tracking and performance monitoring |

---

## Getting Started

### Prerequisites

- **Node.js** >= 20
- **pnpm**
- **MongoDB Atlas** account or local MongoDB instance
- **Google OAuth** credentials (optional)

### Installation

```bash
git clone https://github.com/JV060489/portal.git
cd portal
pnpm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
# Database
DATABASE_URL="mongodb+srv://<user>:<password>@<cluster>.mongodb.net/portal"

# Authentication
BETTER_AUTH_SECRET="your-secret-key-min-32-chars"
BETTER_AUTH_URL="http://localhost:3000"

# Google OAuth (optional)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

### Database Setup

```bash
pnpm exec prisma db push
pnpm exec prisma generate
```

> **Important:** Use `pnpm exec prisma` instead of `npx prisma`. The project uses Prisma 6.19 locally, and `npx` may resolve to an incompatible version.

### Running the Application

```bash
# Next.js dev server + WebSocket server + Inngest dev server
pnpm dev:all
```

Or run services individually:

```bash
pnpm dev
pnpm dev:ws
npx inngest-cli@latest dev
```

Open [http://localhost:3000](http://localhost:3000) to access the application.

---

## Project Structure

```text
app/
|-- page.tsx                        # Landing page
|-- layout.tsx                      # Root layout
|-- globals.css                     # Global styles
|-- (auth)/
|   |-- sign-in/page.tsx            # Sign-in page
|   `-- sign-up/page.tsx            # Sign-up page
|-- api/
|   `-- auth/[...all]/route.ts      # Better Auth API handler
`-- editor/
    |-- page.tsx                    # Editor page
    |-- layout.tsx                  # Editor layout
    `-- _components/
        |-- Projects.tsx            # Project/scene tree sidebar
        `-- TopBanner.tsx           # Welcome banner + logout

lib/
|-- auth.ts                         # Better Auth server config
`-- auth-client.ts                  # Better Auth React client

server/
`-- ws-server.ts                    # WebSocket server for Yjs sync

prisma/
`-- schema.prisma                   # MongoDB schema

middleware.ts                       # Auth guard for /editor routes
```

---

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start the Next.js development server |
| `pnpm dev:ws` | Start the WebSocket server for sync |
| `pnpm dev:all` | Start all local services concurrently |
| `pnpm build` | Generate Prisma client, push schema, and build Next.js |
| `pnpm start` | Start the production server |
| `pnpm lint` | Run ESLint |
| `pnpm exec prisma studio` | Open Prisma Studio |
| `pnpm exec prisma db push` | Push schema changes to MongoDB |

---

## Contributing

1. Fork the repository
2. Create a feature branch with `git checkout -b feature/your-feature`
3. Commit your changes
4. Push the branch
5. Open a pull request

---

## License

This project is licensed under the [MIT License](LICENSE).
