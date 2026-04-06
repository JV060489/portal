# Portal

**A collaborative 3D design tool for building and editing 3D scenes in the browser with AI-assisted workflows and real-time collaboration.**

Portal combines a powerful browser-based 3D editor with AI-assisted design capabilities and real-time collaboration. Designers can create, transform, and manage 3D scenes directly in the browser.

---

## Features

- [x] **3D Editor** — Browser-based 3D scene editor built with React Three Fiber, supporting object manipulation, camera controls, and scene hierarchy management
- [x] **Real-Time Collaboration** — YJS-powered CRDT sync over WebSockets for seamless multi-user editing with conflict-free state management
- [x] **AI / NLI / LLM Integration** — Natural language interface powered by Vercel AI SDK and assistant-ui, enabling conversational scene editing and design assistance
- [x] **Shape Operations** — Add, transform (translate, rotate, scale), and change colors of 3D shapes directly in the editor
- [ ] **Sketchfab Asset Import** — Import 3D assets from the Sketchfab API library directly into your scenes
- [ ] **AI Model Generation** — Generate 3D models using the Hyper Rodin API for rapid prototyping
- [ ] **AI-Powered Reasoning** — Use AI to reason through and orchestrate Sketchfab imports, model generation, and scene composition via connected tools
- [ ] **Physics Engine** — Lightweight physics simulation to validate and test AI-generated scene outputs

---

## Architecture

Portal is composed of two interconnected systems:

- **Web App (Next.js)** - 3D editor, AI chat UI, project management, authentication, and database-backed workflows
- **CRDT Sync Layer** - YJS state synchronization over WebSockets for shared real-time editing sessions

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

### Real-Time
| Technology | Purpose |
|---|---|
| YJS | CRDT-based state synchronization |
| WebSockets (ws) | Transport layer for real-time sync |
| y-websocket | YJS WebSocket provider |

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
- **pnpm** (package manager)
- **MongoDB Atlas** account (or local MongoDB instance)
- **Google OAuth** credentials (optional, for social login)

### Installation

```bash
# Clone the repository
git clone https://github.com/JV060489/portal.git
cd portal

# Install dependencies
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
# Push the Prisma schema to MongoDB
pnpm exec prisma db push

# Generate the Prisma client
pnpm exec prisma generate
```

> **Important:** Always use `pnpm exec prisma` instead of `npx prisma`. The project uses Prisma 6.19 locally, and npx may resolve to an incompatible v7.

### Running the Application

```bash
# Start everything (Next.js dev server + WebSocket server + Inngest dev server)
pnpm dev:all
```

Or run services individually:

```bash
# Next.js dev server only
pnpm dev

# WebSocket server only
pnpm dev:ws

# Inngest dev server only
npx inngest-cli@latest dev
```

Open [http://localhost:3000](http://localhost:3000) to access the application.

---

## Project Structure

```
app/
├── page.tsx                        # Landing page
├── layout.tsx                      # Root layout (Lexend font)
├── globals.css                     # Global styles
├── (auth)/
│   ├── sign-in/page.tsx            # Sign-in page
│   └── sign-up/page.tsx            # Sign-up page
├── api/
│   └── auth/[...all]/route.ts      # Better Auth API handler
└── editor/
    ├── page.tsx                    # Editor page
    ├── layout.tsx                  # Editor layout (banner + sidebar + canvas)
    └── _components/
        ├── Projects.tsx            # Project/scene tree sidebar
        └── TopBanner.tsx           # Welcome banner + logout

lib/
├── auth.ts                         # Better Auth server config
└── auth-client.ts                  # Better Auth React client

server/
└── ws-server.ts                    # WebSocket server for YJS sync

prisma/
└── schema.prisma                   # MongoDB schema (User, Session, Account, Verification)

middleware.ts                       # Auth guard for /editor routes
```

---

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start Next.js development server |
| `pnpm dev:ws` | Start WebSocket server for real-time sync |
| `pnpm dev:all` | Start all services concurrently |
| `pnpm build` | Production build (generates Prisma client, pushes schema, builds Next.js) |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm exec prisma studio` | Open Prisma Studio (database GUI) |
| `pnpm exec prisma db push` | Push schema changes to MongoDB |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the [MIT License](LICENSE).

