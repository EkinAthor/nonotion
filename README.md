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
- Database pages with table view and properties (rename, delete, reorder, hide/show columns per view)
- Image upload (file picker + clipboard paste) with BLOB storage
- Notion export import (ZIP upload with pages, databases, images, and inline formatting)
- Quick search (Ctrl+K) across pages, block content, and database properties
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

## Deployment & Running
 
### Option 1: Non-Production (SQLite) - Recommended for personal use
 **NOT for production**. Uses local SQLite database (`nonotion.db`). Easiest to set up.
 
 **Run locally (requires Node.js + pnpm):**
 ```bash
 pnpm dev
 ```
 Open http://localhost:5173
 
 **Run in Docker:**
 ```bash
 docker compose up -d
 ```
 Open http://localhost (port 80)
 
 ---
 
### Option 2: Testing (Postgres)
 **For development/testing only**. Uses a local Postgres Docker container.
 
 1. Start Postgres:
 ```bash
 docker compose -f docker-compose.postgres.yml up -d
 ```
 
 2. Run the application:
 ```bash
 # Linux/macOS
 STORAGE_TYPE=postgres \
 DATABASE_URL=postgresql://nonotion:nonotion@localhost:5432/nonotion \
   pnpm dev
 
 # Windows PowerShell
 $env:STORAGE_TYPE="postgres"; $env:DATABASE_URL="postgresql://nonotion:nonotion@localhost:5432/nonotion"; pnpm dev
 ```
 
 ---
 
### Option 3: Production (Postgres)
 **Required for production deployments**. Connects to an external Postgres database (e.g., Supabase, RDS, or a managed service).
 
 1. Set up your Postgres database.
 2. Configure environment variables (in `.env` or your deployment platform):
    - `STORAGE_TYPE=postgres`
    - `DATABASE_URL=postgresql://user:pass@host:5432/db`
    - `JWT_SECRET` (Use a strong random string!)
 
 **Deployment Guides:**
 - [Docker Deployment](./docs/docker-deployment.md)
 - [Vercel Deployment](./docs/vercel-deployment.md)
# IMPORTANT: Change POSTGRES_PASSWORD in docker-compose.yml or use .env in production!

---

## Resetting Admin Password

If you lose access to the admin account, you can reset the password using an environment variable.

1. Stop the application.
2. Set `RESET_ADMIN_PASSWORD=newpassword123` in your environment (or `.env` file).
3. Start the application (`pnpm dev` or via Docker).
4. The password for the admin user (matching `ADMIN_EMAIL` or the first found admin) will be reset on startup.
5. **IMPORTANT:** Change the password in the app and remove the `RESET_ADMIN_PASSWORD` environment variable after successful login to prevent it from resetting on every restart.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | JWT signing secret (required) | - |
| `ADMIN_EMAIL` | Email that gets admin role | First user |
| `RESET_ADMIN_PASSWORD` | Reset admin password on startup | - |
| `REQUIRE_USER_APPROVAL` | Require admin approval for new users | `true` |
| `STORAGE_TYPE` | `sqlite` (default) or `postgres` | `sqlite` |
| `DATABASE_URL` | PostgreSQL connection URL | - |
| `PORT` | API server port | `3001` |
| `CORS_ORIGINS` | Allowed origins (comma-separated) | `localhost:5173,localhost:3000` |
| `MAX_FILE_SIZE_MB` | Maximum file upload size in MB | `10` |
| `MAX_IMPORT_SIZE_MB` | Maximum Notion import ZIP size in MB | `100` |
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

### Files

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/files` | Upload file (multipart) |
| GET | `/api/files/:id` | Get file (binary) |

### Import

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/import` | Import Notion export ZIP (multipart) |

### Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search?q=...` | Search pages, blocks, and properties |

### Sharing

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pages/:id/shares` | Get permissions |
| POST | `/api/pages/:id/shares` | Share page |
| PATCH | `/api/pages/:id/shares/:userId` | Update permission |
| DELETE | `/api/pages/:id/shares/:userId` | Remove permission |

---

## Importing from Notion

Nonotion can import your Notion workspace data from a ZIP export:

1. In Notion, go to **Settings & members > Settings > Export all workspace content** (choose **Markdown & CSV** format)
2. In Nonotion, click **Import from Notion** in the sidebar
3. Upload the exported ZIP file (drag-and-drop or click to browse)

**What gets imported:**
- Pages with full hierarchy (nested sub-pages preserved)
- Databases with inferred column types (text, select, multi-select, date, checkbox, URL)
- Database rows with property values and option tags
- Images (uploaded to BLOB storage)
- Inline formatting (bold, italic, code, links)
- Block types: headings, paragraphs, bullet/numbered lists, checklists, code blocks, dividers, images, page links, database views

**Limitations:**
- Person/user columns are imported as multi-select tags (Notion users can't be mapped)
- Comments and activity history are not imported
- Maximum ZIP size: 100MB (configurable via `MAX_IMPORT_SIZE_MB`)

## License

MIT
