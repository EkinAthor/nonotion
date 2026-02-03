# Nonotion

A Notion-like workspace application with block-based page editing, built as a pnpm monorepo.

## Features

- Recursive page tree with nested subpages
- Block-based editor (Heading 1/2/3 + Paragraph)
- Drag-and-drop block reordering
- Slash commands for block type changes
- Auto-save with 500ms debounce
- Star/unstar pages
- Breadcrumb navigation
- Multi-user authentication with JWT
- Page sharing with permission levels (owner/editor/viewer)
- Database pages with table view and properties
- Configurable storage backend (JSON/SQLite or PostgreSQL)
- Docker deployment support

## Tech Stack

- **Frontend**: React, Vite, TypeScript, Tailwind CSS, Zustand, TipTap
- **Backend**: Node.js, Fastify, TypeScript, Drizzle ORM
- **Storage**: JSON files + SQLite (default) or PostgreSQL
- **Monorepo**: pnpm workspaces, Turborepo
- **Testing**: Playwright

## Quick Start

```bash
# Install dependencies
pnpm install

# Build shared package
pnpm --filter @nonotion/shared build

# Start development servers (API + Web)
pnpm dev
```

Open http://localhost:5173 in your browser.

## Project Structure

```
nonotion/
├── packages/shared/    # Shared types, schemas, utilities
├── apps/api/           # Fastify backend (localhost:3001)
├── apps/web/           # React frontend (localhost:5173)
├── e2e/                # Playwright E2E tests
├── data/               # JSON/SQLite storage (default mode)
└── docs/               # Documentation
```

## Storage Configuration

Nonotion supports two storage backends:

### Default: JSON + SQLite

Pages and blocks are stored in JSON files, users and permissions in SQLite. No configuration needed.

```bash
pnpm dev
```

### PostgreSQL

All data stored in PostgreSQL. Compatible with standard PostgreSQL and Supabase.

**Option 1: Using Docker Compose**

```bash
# Start PostgreSQL + API + Web
docker compose -f docker-compose.postgres.yml up -d

# View logs
docker compose -f docker-compose.postgres.yml logs -f
```

**Option 2: Manual Setup**

```bash
# Start PostgreSQL (example using Docker)
docker compose -f docker-compose.postgres.yml up postgres
# Build option
docker compose -f docker-compose.postgres.yml up -- build postgres

# Run migrations
DATABASE_URL=postgresql://nonotion:nonotion@localhost:5432/nonotion \
  pnpm --filter @nonotion/api db:migrate:pg
# Windows
$env:DATABASE_URL="postgresql://nonotion:nonotion@localhost:5432/nonotion"
$env:STORAGE_TYPE="postgres"
pnpm --filter @nonotion/api db:migrate:pg

# Start API with PostgreSQL
STORAGE_TYPE=postgres \
DATABASE_URL=postgresql://nonotion:nonotion@localhost:5432/nonotion \
  pnpm --filter @nonotion/api dev
# Windows
$env:DATABASE_URL="postgresql://nonotion:nonotion@localhost:5432/nonotion"
$env:STORAGE_TYPE="postgres"
pnpm --filter @nonotion/api dev
```

**Supabase Connection**

```bash
STORAGE_TYPE=postgres
DATABASE_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
```

### Migrating Existing Data to PostgreSQL

```bash
DATABASE_URL=postgresql://nonotion:nonotion@localhost:5432/nonotion \
  pnpm --filter @nonotion/api migrate:to-postgres
```

## Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Authentication
JWT_SECRET=your-secure-secret-here
ADMIN_EMAIL=admin@example.com

# Storage: 'json-sqlite' (default) or 'postgres'
STORAGE_TYPE=json-sqlite
DATABASE_URL=postgresql://nonotion:nonotion@localhost:5432/nonotion

# Optional
PORT=3001
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
REQUIRE_USER_APPROVAL=true
```

## Scripts

```bash
# Development
pnpm dev                # Start all dev servers
pnpm dev:status         # Check if servers are running
pnpm dev:stop           # Stop servers (manual kill)
pnpm --filter @nonotion/api dev   # Start API only
pnpm --filter @nonotion/web dev   # Start frontend only

# Build
pnpm build              # Build all packages

# Testing
pnpm --filter @nonotion/e2e test:e2e      # Run E2E tests
pnpm --filter @nonotion/e2e test:e2e:ui   # Run E2E tests with UI

# Database (SQLite - default)
pnpm --filter @nonotion/api db:generate   # Generate migration
pnpm --filter @nonotion/api db:migrate    # Apply migrations
pnpm --filter @nonotion/api db:studio     # Open Drizzle Studio

# Database (PostgreSQL)
pnpm --filter @nonotion/api db:generate:pg   # Generate migration
pnpm --filter @nonotion/api db:migrate:pg    # Apply migrations
pnpm --filter @nonotion/api db:studio:pg     # Open Drizzle Studio

# Data Migration
pnpm --filter @nonotion/api migrate:to-postgres  # Migrate to PostgreSQL
```

## Docker Deployment

```bash
# Default (JSON + SQLite storage)
docker compose up -d

# With PostgreSQL
docker compose -f docker-compose.postgres.yml up -d
```

See [docs/docker-deployment.md](docs/docker-deployment.md) for detailed deployment instructions.

## API Endpoints

### Pages & Blocks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pages` | List all accessible pages |
| POST | `/api/pages` | Create page |
| PATCH | `/api/pages/:id` | Update page |
| DELETE | `/api/pages/:id` | Delete page |
| GET | `/api/pages/:pageId/blocks` | Get blocks for page |
| POST | `/api/pages/:pageId/blocks` | Create block |
| PATCH | `/api/blocks/:id` | Update block |
| DELETE | `/api/blocks/:id` | Delete block |
| PATCH | `/api/pages/:pageId/blocks/reorder` | Reorder blocks |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/change-password` | Change password |

### Sharing

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pages/:id/shares` | Get page permissions |
| POST | `/api/pages/:id/shares` | Share page with user |
| PATCH | `/api/pages/:id/shares/:userId` | Update permission |
| DELETE | `/api/pages/:id/shares/:userId` | Remove permission |

## License

MIT
