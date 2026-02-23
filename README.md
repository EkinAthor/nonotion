# Nonotion

A self-hosted, lightweight Notion alternative with block-based page editing.

## Features

- Recursive page tree with nested subpages
- Block-based editor (Heading 1/2/3 + Paragraph)
- Drag-and-drop block reordering
- Slash commands for block type changes
- Auto-save with debounce
- Star/unstar pages
- Multi-user authentication with JWT (email/password + Google OAuth)
- Owner account with workspace-wide access to all pages
- Page sharing with permission levels (owner/editor/viewer)
- Database pages with table view and properties (rename, delete, reorder, hide/show columns per view)
- Save/revert default database view config (filters, sort, hidden columns, property order) for all users
- Image upload (file picker + clipboard paste) with BLOB storage
- Notion export import (ZIP upload with pages, databases, images, and inline formatting)
- Quick search (Ctrl+K) across pages, block content, and database properties
- Configurable storage (JSON/SQLite or PostgreSQL)
- Demo mode for static hosting without a backend (all data in localStorage)

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

## Demo Mode

Demo mode lets the app run entirely in the browser without a backend. Useful for hosting a static demo site where users can try the app immediately — no login, no server, all data in localStorage.

```bash
# Build for demo mode
VITE_DEMO_MODE=true pnpm --filter @nonotion/web build

# Serve the static build
npx serve apps/web/dist
```

**What works in demo mode:** Page/block CRUD, database filtering/sorting, search (Ctrl+K), drag-and-drop, slash commands, all block types.

**What's disabled:** File upload, Notion import, user management, sharing, "Save as default" view config.

Demo data is seeded on first load: a book database with 10 rows, a formatting showcase page, and a getting started page. Changes persist in localStorage across page refreshes but not across browsers or devices.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | JWT signing secret (required) | - |
| `ADMIN_EMAIL` | Email that gets admin role | First user |
| `RESET_ADMIN_PASSWORD` | Reset admin password on startup | - |
| `REQUIRE_USER_APPROVAL` | Require admin approval for new users | `true` |
| `AUTH_MODES` | Authentication methods: `db`, `google`, or `db,google` | `db` |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID (required when AUTH_MODES includes `google`) | - |
| `STORAGE_TYPE` | `sqlite` (default) or `postgres` | `sqlite` |
| `DATABASE_URL` | PostgreSQL connection URL | - |
| `PORT` | API server port | `3001` |
| `CORS_ORIGINS` | Allowed origins (comma-separated) | `localhost:5173,localhost:3000` |
| `MAX_FILE_SIZE_MB` | Maximum file upload size in MB | `10` |
| `MAX_IMPORT_SIZE_MB` | Maximum Notion import ZIP size in MB | `100` |
| `WEB_PORT` | Web server port (Docker only) | `80` |
| `VITE_DEMO_MODE` | Enable demo mode (frontend-only, no backend) | `false` |
| `RATE_LIMIT_ENABLED` | Enable/disable rate limiting (auto-disabled on Vercel) | `true` |
| `RATE_LIMIT_GLOBAL_MAX` | Global: max requests per window per IP | `100` |
| `RATE_LIMIT_GLOBAL_WINDOW_MINUTES` | Global: window duration in minutes | `1` |
| `RATE_LIMIT_AUTH_MAX` | Auth endpoints: max attempts per window | `10` |
| `RATE_LIMIT_AUTH_WINDOW_MINUTES` | Auth: window duration in minutes | `15` |
| `RATE_LIMIT_UPLOAD_MAX` | File upload: max requests per window | `10` |
| `RATE_LIMIT_UPLOAD_WINDOW_MINUTES` | Upload: window duration in minutes | `1` |
| `RATE_LIMIT_IMPORT_MAX` | Import: max requests per window | `3` |
| `RATE_LIMIT_IMPORT_WINDOW_MINUTES` | Import: window duration in minutes | `1` |
| `RATE_LIMIT_SEARCH_MAX` | Search: max requests per window | `30` |
| `RATE_LIMIT_SEARCH_WINDOW_MINUTES` | Search: window duration in minutes | `1` |

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
| GET | `/api/auth/config` | Get auth config (public) |
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login (email/password) |
| POST | `/api/auth/google` | Login with Google ID token |
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

### Users (admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List all users |
| PATCH | `/api/users/:id/role` | Update user role |
| PATCH | `/api/users/:id/owner` | Grant/revoke owner status |
| PATCH | `/api/users/:id/approve` | Approve/revoke user |
| POST | `/api/users/:id/reset-password` | Reset user password |
| DELETE | `/api/users/:id` | Delete user |

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

## Google OAuth Setup

To enable Google login:

1. Go to [Google Cloud Console](https://console.cloud.google.com/) > **APIs & Services** > **Credentials**
2. Create an **OAuth 2.0 Client ID** (application type: Web application)
3. Under **Authorized JavaScript origins**, add:
   - `http://localhost:5173` (development)
   - Your production domain (e.g., `https://nonotion.example.com`)
4. Copy the **Client ID** and set it as `GOOGLE_CLIENT_ID` in your environment
5. Set `AUTH_MODES=db,google` (or `AUTH_MODES=google` for Google-only)

When both modes are enabled, the login page shows a Google button and an email/password form. Users signing in with Google are auto-linked if their email matches an existing account.

## Rate Limiting

The API includes built-in rate limiting powered by `@fastify/rate-limit`. It is enabled by default with sensible limits:

| Endpoint | Max Requests | Window |
|----------|-------------|--------|
| All routes (global) | 100 | 1 min |
| Login / Register / Google auth | 10 | 15 min |
| File upload | 10 | 1 min |
| Notion import | 3 | 1 min |
| Search | 30 | 1 min |
| Health check | exempt | — |

All limits are configurable via environment variables (see table above). Set `RATE_LIMIT_ENABLED=false` to disable rate limiting entirely.

Rate limiting uses an in-memory store keyed by client IP. It is automatically disabled on Vercel serverless deployments (where in-memory state doesn't persist between invocations) — use Vercel Firewall / WAF rules for rate limiting in that environment.

## User Roles

Nonotion has three access levels:

| Role | Description |
|------|-------------|
| **User** | Standard access — can only see pages explicitly shared with them |
| **Admin** | Can manage users (approve, change roles, reset passwords) but only sees shared pages |
| **Owner** | Admin + full access to all pages/databases in the workspace |

**How the first owner is created:** The first user to register automatically becomes an admin and owner. On upgrade from a previous version, the oldest admin is automatically promoted to owner via database migration.

**Owner management:** Owners can grant or revoke owner status for other admins via the admin panel. At least one owner must always exist. An owner must be an admin — granting owner status auto-promotes to admin; demoting an admin to user is blocked while they are an owner.

## License

MIT
