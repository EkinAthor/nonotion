# Nonotion

A self-hosted, lightweight Notion alternative with block-based page editing.

## Features

- Recursive page tree with nested subpages
- Block-based editor (Heading 1/2/3 + Paragraph)
- Drag-and-drop block reordering
- Slash commands for block type changes
- Auto-save with debounce
- Star/unstar pages
- Multi-user authentication with JWT
- Page sharing with permission levels (owner/editor/viewer)
- Database pages with table view and properties
- Configurable storage (JSON/SQLite or PostgreSQL)

## Tech Stack

- **Frontend**: React, Vite, TypeScript, Tailwind CSS, Zustand, TipTap
- **Backend**: Node.js, Fastify, TypeScript, Drizzle ORM
- **Storage**: JSON + SQLite (default) or PostgreSQL
- **Monorepo**: pnpm workspaces, Turborepo

## Project Structure

```
nonotion/
├── packages/shared/    # Shared types, schemas, utilities
├── apps/api/           # Fastify backend (port 3001)
├── apps/web/           # React frontend (port 5173)
├── e2e/                # Playwright E2E tests
└── data/               # Local storage (gitignored)
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (optional, for PostgreSQL or production deployment)

### Installation

```bash
# Clone and install
git clone <repository-url>
cd nonotion
pnpm install

# Build shared package (required before first run)
pnpm --filter @nonotion/shared build
```

---

## Running Locally

### Option 1: Local Storage (Default)

Uses JSON files for pages/blocks and SQLite for users. Simplest setup.

```bash
pnpm dev
```

Open http://localhost:5173

### Option 2: PostgreSQL Storage

Uses PostgreSQL for all data. Better for production-like testing.

**1. Start PostgreSQL:**

```bash
docker compose -f docker-compose.postgres.yml up -d
```

**2. Run migrations:**

do this only if needed to migrate from previous json sqlite to postgres

```bash
# Linux/macOS
DATABASE_URL=postgresql://nonotion:nonotion@localhost:5432/nonotion \
  pnpm --filter @nonotion/api db:migrate:pg

# Windows PowerShell
$env:DATABASE_URL="postgresql://nonotion:nonotion@localhost:5432/nonotion"
pnpm --filter @nonotion/api db:migrate:pg
```

**3. Start the application:**

```bash
# Linux/macOS
STORAGE_TYPE=postgres \
DATABASE_URL=postgresql://nonotion:nonotion@localhost:5432/nonotion \
  pnpm dev

# Windows PowerShell
$env:STORAGE_TYPE="postgres"
$env:DATABASE_URL="postgresql://nonotion:nonotion@localhost:5432/nonotion"
pnpm dev
```

Open http://localhost:5173

---

## Docker Deployment

Run the full stack in Docker containers.
(expecting postgres to be running already)

**1. Create environment file:**

```bash
cp .env.example .env
# Edit .env and set JWT_SECRET to a secure value
```

**2. Start services:**

```bash
docker compose up -d
```

Open http://localhost (port 80)

**With PostgreSQL storage:**

```bash
# Set in .env:
# STORAGE_TYPE=postgres
# DATABASE_URL=postgresql://your-postgres-host:5432/nonotion

docker compose up -d
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | JWT signing secret (required) | - |
| `ADMIN_EMAIL` | Email that gets admin role | First user |
| `REQUIRE_USER_APPROVAL` | Require admin approval for new users | `true` |
| `STORAGE_TYPE` | `json-sqlite` or `postgres` | `json-sqlite` |
| `DATABASE_URL` | PostgreSQL connection URL | - |
| `PORT` | API server port | `3001` |
| `CORS_ORIGINS` | Allowed origins (comma-separated) | `localhost:5173,localhost:3000` |
| `WEB_PORT` | Web server port (Docker only) | `80` |

---

## Scripts Reference

```bash
# Development
pnpm dev                    # Start API + Web
pnpm --filter @nonotion/api dev    # API only
pnpm --filter @nonotion/web dev    # Web only

# Build
pnpm build                  # Build all packages

# Database (SQLite)
pnpm --filter @nonotion/api db:generate    # Generate migration
pnpm --filter @nonotion/api db:migrate     # Apply migrations
pnpm --filter @nonotion/api db:studio      # Open Drizzle Studio

# Database (PostgreSQL)
pnpm --filter @nonotion/api db:generate:pg # Generate migration
pnpm --filter @nonotion/api db:migrate:pg  # Apply migrations
pnpm --filter @nonotion/api db:studio:pg   # Open Drizzle Studio

# Data Migration
pnpm --filter @nonotion/api migrate:to-postgres  # Migrate data to PostgreSQL

# Testing
pnpm --filter @nonotion/e2e test:e2e       # Run E2E tests
```

---

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/change-password` | Change password |

### Pages

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pages` | List accessible pages |
| GET | `/api/pages/:id` | Get page |
| POST | `/api/pages` | Create page |
| PATCH | `/api/pages/:id` | Update page |
| DELETE | `/api/pages/:id` | Delete page |

### Blocks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pages/:id/blocks` | Get blocks |
| POST | `/api/pages/:id/blocks` | Create block |
| PATCH | `/api/blocks/:id` | Update block |
| DELETE | `/api/blocks/:id` | Delete block |
| PATCH | `/api/pages/:id/blocks/reorder` | Reorder blocks |

### Sharing

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pages/:id/shares` | Get permissions |
| POST | `/api/pages/:id/shares` | Share page |
| PATCH | `/api/pages/:id/shares/:userId` | Update permission |
| DELETE | `/api/pages/:id/shares/:userId` | Remove permission |

---

## License

MIT
