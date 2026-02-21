# CLAUDE.md - AI Assistant Guide for Nonotion

## Project Overview

Nonotion is a Notion-like workspace application with block-based page editing. It's a pnpm monorepo with a Fastify backend and React frontend.

**Current Phase**: Phase 2 - Multi-user, SQLite/PostgreSQL storage, Block editing with Auth.

## Architecture

```
nonotion/
├── packages/shared/     # @nonotion/shared - Types, schemas, utilities
├── apps/api/            # @nonotion/api - Fastify REST API (port 3001)
├── apps/web/            # @nonotion/web - React SPA (port 5173)
├── e2e/                 # @nonotion/e2e - Playwright tests
└── data/                # Runtime SQLite database (gitignored)
```

### Data Flow
```
React Components → Zustand Stores → API Client → Fastify Routes → Services → SQLite/PostgreSQL Storage
```

## Key Patterns

### 1. Block Registry Pattern
New block types are added as plugins in `apps/web/src/components/blocks/registry/`. Each block needs:
- An edit component (TipTap-based)
- Entry in `registry/index.ts`
- Backend support for the block type in shared schemas

### 2. Storage Adapter Pattern
`apps/api/src/storage/storage-adapter.ts` defines the `StorageAdapter` and `UserStorageAdapter` interfaces. `apps/api/src/storage/file-storage-adapter.ts` defines the `FileStorageAdapter` interface for file/image BLOB storage. All three are implemented by `SqliteFullStorage` (default, single `nonotion.db` file) and `PostgresStorage`. The storage factory (`storage-factory.ts`) selects the backend based on `STORAGE_TYPE` env var.

### 3. Entity IDs
All entities use prefixed IDs for type safety:
- Pages: `pg_xxxxxxxxxxxx`
- Blocks: `blk_xxxxxxxxxxxx`
- Users: `usr_xxxxxxxxxxxx`
- Files: `file_xxxxxxxxxxxx`

### 4. Optimistic Updates
Zustand stores update UI immediately for mutations, then sync with backend. On error, revert to previous state (surgical snapshot restore, no full refetch).

**Block creation** uses client-generated temp IDs (`generateBlockId()`) so new blocks appear instantly. A module-scoped `tempToRealId` map in `blockStore.ts` translates temp IDs to server IDs for API calls. A `pendingCreates` map lets `updateBlock`/`deleteBlock` wait for the create API to finish before making dependent calls. The temp ID remains the canonical key in the store (no React remount).

**Page creation** awaits the server (not optimistic) because pages need real IDs for navigation and permission checks. Components show a loading indicator during creation.

**Page updates** (rename, icon, star) are optimistic: snapshot previous state, apply immediately, fire API in background, revert on error. Same for **page deletion**.

**Database operations**: `updateRowProperties` and `updatePropertyOptions` (rename/delete tags) are optimistic. `updateSchema` with `addProperties` awaits the server (avoids fake property IDs); updates/removals/reorders are optimistic.

### 5. LWW Sync Preparation
All entities have `version` and `updatedAt` fields for future last-write-wins conflict resolution.

### 6. Block Context Pattern
`apps/web/src/contexts/BlockContext.tsx` provides block-level operations to edit components:
- `createBlockBelow()` - Create new block after current
- `changeBlockType()` - Change block type (heading/paragraph)
- `focusPreviousBlock()` / `focusNextBlock()` - Navigate between blocks
- `pasteImage(file)` - Upload image from clipboard and create image block below

### 7. Slash Commands
Typing `/` at the start of an empty block opens a command menu. Shortcuts like `/h1`, `/p` filter and select block types.

### 8. Database Properties Management
`apps/web/src/components/database/PropertiesPanel.tsx` provides a comprehensive properties panel for database views:
- **Rename**: Inline edit property names (schema-level change, affects all views)
- **Delete**: Remove properties (schema-level, title protected)
- **Reorder**: Drag-and-drop via `@dnd-kit/sortable` (view-local, persisted in `ViewConfig.propertyOrder`)
- **Visibility**: Toggle column visibility per-view (persisted in `ViewConfig.hiddenPropertyIds`). Title cannot be hidden.
- **Add**: Type picker for new properties (text, select, multi_select, date, checkbox, url, person)

View-local settings (`hiddenPropertyIds`, `propertyOrder`) are stored in localStorage per database instance. Schema changes (rename, delete, add) go through `updateSchema()` and affect all views.

### 9. Search (Ctrl+K)
`apps/api/src/services/search-service.ts` implements server-side search across page titles, block content, and database row properties. Results are scored (title-starts-with > title-contains > block-match > property-match, starred bonus), deduplicated by page, and capped at 20. `apps/api/src/routes/search.ts` exposes `GET /api/search?q=...` with auth middleware. `StorageAdapter.getBlocksByPages(pageIds)` fetches blocks in bulk to avoid N+1 queries.

Frontend: `SearchModal.tsx` is a command-palette modal opened via Ctrl+K/Cmd+K (listener in `MainLayout.tsx`) or the sidebar search button. Uses 250ms debounced API calls, keyboard navigation (arrows/enter/escape), and shows recent pages (starred first) when the query is empty. State lives in `uiStore.ts` (`searchOpen`, `toggleSearch`).

### 9. Notion Import Pipeline
`apps/api/src/services/import/` implements a multi-stage Notion export ZIP import:
1. **zip-extractor** — Extracts ZIP to temp dir, handles double-zipping (outer ZIP containing inner ZIPs)
2. **notion-scanner** — Recursively walks export, categorizes files (`.md`, `.csv`, `_all.csv`, images), extracts 32-char hex UIDs from filenames
3. **csv-parser** — Parses CSV with BOM stripping (PapaParse)
4. **md-parser** — Two-phase: page metadata extraction + body-to-blocks conversion. Converts inline markdown (`**bold**`, `*italic*`, `` `code` ``, `[links](url)`) to HTML for TipTap
5. **type-inferrer** — Infers database property types from CSV column data (title, text, select, multi_select, date, checkbox, url)
6. **hierarchy-builder** — Builds tree of pages/databases/row-pages from scanned files
7. **entity-creator** — Three-pass creation: pages/databases → images → blocks. Resolves `pending:uid` references for page links and database views
8. **import-service** — Orchestrator with temp directory cleanup in `finally`

Frontend: `ImportDialog.tsx` provides drag-and-drop ZIP upload via sidebar button. API: `POST /api/import` (multipart, 100MB default limit via `MAX_IMPORT_SIZE_MB`).

### 10. Database Default View Config
Admins can save the current database view configuration (filters, sort, hidden columns, property order) as a server-side default via `DatabaseToolbar`'s "Save as default" button. The default is stored inside `DatabaseSchema.defaultViewConfig` (no extra tables/endpoints).

- **Save as default**: Extracts current `ViewConfig` (minus `columnWidths`) into a `DefaultViewConfig`, sends via `updateSchema({ defaultViewConfig })`. Optimistic update.
- **Revert to default**: Replaces local `ViewConfig` with the server default and persists to localStorage.
- **Seeding**: On `loadDatabase`, if no localStorage config exists for that database, the store seeds `viewConfig` from the server default (without persisting to localStorage, so future server updates are picked up).
- **Local override**: Once a user changes any view setting (creating a localStorage entry), their local config takes precedence over the server default on subsequent loads.

Types: `SortConfig`, `DefaultViewConfig` in `packages/shared/src/types/database.ts`. Zod: `sortConfigSchema`, `defaultViewConfigSchema` in `packages/shared/src/schemas/database.ts`.

## Critical Files

| File | Purpose |
|------|---------|
| `packages/shared/src/types/block.ts` | Block type definitions - drives the entire block system |
| `packages/shared/src/schemas/block.ts` | Zod validation for block API requests |
| `apps/api/src/storage/sqlite-full-storage.ts` | Unified SQLite storage for all entities (pages, blocks, users, permissions, files) |
| `apps/web/src/stores/pageStore.ts` | Page state with optimistic update/delete |
| `apps/web/src/stores/blockStore.ts` | Block state with optimistic updates + temp ID mapping |
| `apps/web/src/stores/databaseStore.ts` | Database state with optimistic row/property updates |
| `apps/web/src/components/blocks/BlockCanvas.tsx` | Main editing surface with drag-and-drop |
| `apps/web/src/lib/tiptap/useBlockEditor.ts` | Shared TipTap editor hook with auto-save, keyboard handling, slash commands |
| `apps/web/src/contexts/BlockContext.tsx` | Context for block operations (create, change type, navigate) |
| `apps/web/src/components/blocks/SlashCommandMenu.tsx` | Slash command popup for changing block types |
| `apps/web/src/components/blocks/registry/index.ts` | Block type registry with shortcuts |
| `apps/api/src/storage/file-storage-adapter.ts` | `FileStorageAdapter` interface for file BLOB storage |
| `apps/api/src/services/file-service.ts` | File upload validation, MIME checks, size limits |
| `apps/api/src/routes/files.ts` | File upload/download endpoints (`@fastify/multipart`) |
| `apps/web/src/api/client.ts` | API client including `filesApi` for uploads and auth-fetched blob URLs |
| `apps/api/src/services/import/import-service.ts` | Notion import orchestrator (ZIP → pages/databases/blocks) |
| `apps/api/src/services/import/md-parser.ts` | Markdown parser with inline formatting → HTML conversion |
| `apps/api/src/services/import/entity-creator.ts` | Three-pass entity creation with reference resolution |
| `apps/api/src/routes/import.ts` | `POST /api/import` multipart endpoint (100MB limit) |
| `apps/web/src/components/layout/ImportDialog.tsx` | Import dialog with drag-and-drop ZIP upload |
| `apps/api/src/services/search-service.ts` | Server-side search across pages, blocks, and properties |
| `apps/api/src/routes/search.ts` | `GET /api/search?q=...` endpoint with auth |
| `apps/web/src/components/database/PropertiesPanel.tsx` | Properties panel with drag reorder, rename, visibility, delete, add |
| `apps/web/src/components/layout/SearchModal.tsx` | Ctrl+K command-palette modal with keyboard navigation |

## Commands

```bash
# Development
pnpm dev                              # Start all (API + Web)
pnpm dev:status                       # Check if servers are running
pnpm dev:stop                         # Stop servers (manual kill)
pnpm --filter @nonotion/api dev       # API only
pnpm --filter @nonotion/web dev       # Web only

# Build
pnpm --filter @nonotion/shared build  # Must build first!
pnpm build                            # Build all

# Test
pnpm --filter @nonotion/e2e test:e2e  # Run Playwright tests
```

## Code Conventions

### TypeScript
- Strict mode enabled
- Use `interface` for object shapes, `type` for unions/intersections
- Import types with `import type { }` when possible
- Use `.js` extensions in shared package imports (ESM)

### React
- Functional components only
- Zustand for state (no prop drilling)
- TipTap for rich text editing
- Tailwind for styling (no CSS files)

### API
- All responses wrapped: `{ data: T, success: true }` or `{ error: { code, message }, success: false }`
- Zod validation on all inputs
- Services contain business logic, routes are thin

### Naming
- Files: kebab-case (`page-store.ts`) or PascalCase for components (`PageView.tsx`)
- Variables/functions: camelCase
- Types/interfaces: PascalCase
- Constants: SCREAMING_SNAKE_CASE

## Adding a New Block Type

1. Add type to `packages/shared/src/types/block.ts`:
   ```typescript
   export type BlockType = 'heading' | 'paragraph' | 'newtype';
   ```

2. Add content interface and update `BlockContent` union

3. Add Zod schema in `packages/shared/src/schemas/block.ts`

4. Rebuild shared: `pnpm --filter @nonotion/shared build`

5. Create edit component in `apps/web/src/components/blocks/registry/NewTypeEdit.tsx`

6. Register in `apps/web/src/components/blocks/registry/index.ts` with:
   - `type`, `label`, `icon`, `shortcuts` (for slash commands)
   - `EditComponent` reference
   - `defaultContent` for new blocks

## Common Tasks

### Debug API
```bash
curl http://localhost:3001/api/pages | jq
curl http://localhost:3001/api/pages/pg_xxx/blocks | jq
```

### Reset Data
Delete `data/nonotion.db`, restart API. Migrations will recreate all tables.

### Check TypeScript Errors
```bash
pnpm --filter @nonotion/web tsc --noEmit
pnpm --filter @nonotion/api tsc --noEmit
```

## Things to Avoid

- **Don't** modify `node_modules` or `dist` directories
- **Don't** commit files in `data/pages/` or `data/blocks/`
- **Don't** use `any` type - use `unknown` and type guards
- **Don't** add new dependencies without checking bundle size impact
- **Don't** put business logic in route handlers - use services
- **Don't** skip Zod validation on API inputs
- **Don't** use `useEffect` for data fetching in components - use stores

## Future Considerations

These are planned but NOT yet implemented:
- Real-time collaboration (WebSocket)
- Additional block types (tables)
- S3/external file storage backend (currently BLOB in DB)
- Database storage (Supabase)

When implementing these, check `docs/implementation-plan.md` for architectural guidance.

## Testing Strategy

- **E2E (Playwright)**: User flows - page CRUD, block editing, navigation
- **Unit tests**: Not yet implemented - add for complex utility functions
- **API tests**: Use curl/Postman for manual verification

## Troubleshooting

### "Module not found" errors
```bash
pnpm --filter @nonotion/shared build
```

### Port already in use
Run `pnpm dev:stop` to kill existing processes on ports 3001 (API) or 5173 (Web).

### Blocks not saving
Check browser console for API errors. Verify API is running. Auto-save has 500ms debounce.

### Drag and drop not working
Requires mouse movement of 8px to activate (prevents accidental drags).
