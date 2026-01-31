# Nonotion

A Notion-like workspace application with block-based page editing, built as a pnpm monorepo.

## Features

- Recursive page tree with nested subpages
- Block-based editor (Heading 1 + Paragraph)
- Drag-and-drop block reordering
- Auto-save with 500ms debounce
- Star/unstar pages
- Breadcrumb navigation
- Local JSON file storage

## Tech Stack

- **Frontend**: React, Vite, TypeScript, Tailwind CSS, Zustand, TipTap
- **Backend**: Node.js, Fastify, TypeScript
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
└── data/               # JSON file storage
```

## Scripts

```bash
# Development
pnpm dev                # Start all dev servers
pnpm --filter @nonotion/api dev   # Start API only
pnpm --filter @nonotion/web dev   # Start frontend only

# Build
pnpm build              # Build all packages

# Testing
pnpm --filter @nonotion/e2e test:e2e      # Run E2E tests
pnpm --filter @nonotion/e2e test:e2e:ui   # Run E2E tests with UI
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pages` | List all pages |
| POST | `/api/pages` | Create page |
| PATCH | `/api/pages/:id` | Update page |
| DELETE | `/api/pages/:id` | Delete page |
| GET | `/api/pages/:pageId/blocks` | Get blocks for page |
| POST | `/api/pages/:pageId/blocks` | Create block |
| PATCH | `/api/blocks/:id` | Update block |
| DELETE | `/api/blocks/:id` | Delete block |
| PATCH | `/api/pages/:pageId/blocks/reorder` | Reorder blocks |

## License

MIT
