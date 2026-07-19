# CLAUDE.md - AI Assistant Guide for Nonotion

## Project Overview

Nonotion is a Notion-like workspace application with block-based page editing. It's a pnpm monorepo with a Fastify backend and React frontend.

**Current Phase**: Phase 2 - Multi-user, SQLite/PostgreSQL storage, Block editing with Auth. User roles: `admin` (manage users), `user` (standard access), plus `isOwner` flag (admin with workspace-wide access to all pages).

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

Targeted page queries: `getPagesByParent(parentId)` (children of one page/database, uses `idx_pages_parent_id`) and `getPagesByIds(ids)` (bulk fetch, chunked on SQLite). **Never call `getAllPages()` in request hot paths** — it scans the whole workspace; use the targeted methods.

**Optional SQL fast-path methods** (the optional method itself is the capability flag — Postgres implements them, SQLite/JSON storage omit them and services fall back to the JS path): `queryDatabaseRows(query)` (see Performance Patterns) and `findNearestPermission(pageId, userId)` (recursive-CTE permission lookup). When adding one, keep the JS fallback behaviorally identical — demo-client mirrors the JS semantics.

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

### 11. Google OAuth Login
`AUTH_MODES` env var controls which authentication methods are available: `db` (email/password, default), `google`, or `db,google`. The frontend fetches auth config from `GET /api/auth/config` (public, no auth) to determine which login UI to render.

- **Backend**: `google-auth-library` verifies Google ID tokens. `POST /api/auth/google` accepts a credential, verifies it, and issues a JWT via existing `@fastify/jwt`. Auto-links if Google email matches an existing user. New Google users get `passwordHash: ''`.
- **Frontend**: `@react-oauth/google` renders the Sign-In button. `AuthConfigProvider` wraps the app in `GoogleOAuthProvider` when Google is enabled. `GoogleLoginButton` handles the credential flow.
- **Admin**: Google-only users display a "Google" badge in the admin panel. "Reset Password" becomes "Set Password" (sets a password, enabling dual login).
- **Env vars**: `AUTH_MODES` (default: `db`), `GOOGLE_CLIENT_ID` (required when `AUTH_MODES` includes `google`).

Types: `GoogleLoginInput`, `AuthMode`, `AuthConfigResponse` in `packages/shared/src/types/user.ts`. Zod: `googleLoginInputSchema` in `packages/shared/src/schemas/user.ts`.

### 12. Demo Mode
`VITE_DEMO_MODE=true` at build time swaps the API client from `real-client.ts` (HTTP fetch) to `demo-client.ts` (localStorage). The conditional re-export in `client.ts` means **no stores or components import the client directly** — only the API boundary is swapped.

- **`client.ts`**: Exports `IS_DEMO_MODE` flag and conditionally re-exports all API namespaces from either `real-client` or `demo-client`
- **`demo-storage.ts`**: Synchronous localStorage CRUD with `nonotion_demo_` key prefix
- **`demo-data.ts`**: Seed content — book database (10 rows, 9 properties), formatting showcase (all block types), getting started page. Uses stable IDs (`pg_demo_*`, `blk_demo_*`)
- **`demo-client.ts`**: Full mock implementations of `authApi`, `pagesApi`, `blocksApi`, `databaseApi`, `filesApi`, `searchApi`, `importApi`, `usersApi`, `sharesApi`. Includes client-side `applyFilter`/`applySort` ported from `database-service.ts`
- **`demo-init.ts`**: Called in `main.tsx` before render — seeds demo data if not already seeded, writes auth store to localStorage
- **UI adjustments**: `AuthGuard` and `AuthConfigProvider` skip auth checks, `DemoBanner` shows at top, import button disabled, "Save as default" hidden, user menu shows "Demo Mode" label instead of sign-out

Disabled features: file upload, Notion import, sharing, user management, "Save as default" view config.

### 13. Owner Account
`isOwner: boolean` field on User — an owner is an admin with access to **all** workspace pages/databases, bypassing page-level permission checks.

- **Data model**: `isOwner` boolean on `User`/`PublicUser`. Invariant: `isOwner: true` requires `role: 'admin'`. All existing `role === 'admin'` checks continue working for owners.
- **First owner**: The first admin registered automatically becomes owner. On migration, the oldest existing admin is promoted.
- **Multiple owners**: Supported. Owners can grant/revoke owner status via `PATCH /api/users/:id/owner`. At least one owner must always exist.
- **Permission bypass**: `PermissionOptions.isWorkspaceOwner` short-circuits `canRead`, `canEdit`, `canShare`, `canDelete` to return `true`. `getUserAccessiblePages` returns all pages for owners.
- **JWT**: `isOwner` is included in JWT payload. Old JWTs without `isOwner` are treated as `false` (`=== true` checks).
- **Protection**: Cannot demote owner to `user` role (must remove owner first). Cannot delete an owner (must remove owner first). Cannot remove the last owner.
- **Frontend**: Amber "Owner" badge in UserMenu and admin panel. "Make Owner"/"Remove Owner" buttons visible only to owners for admin users.

### 14. Rate Limiting
`@fastify/rate-limit` provides IP-based rate limiting with tiered per-route overrides. Config lives in `apps/api/src/config/rate-limit.ts`.

- **Global safety net**: 100 req / 1 min (all routes). Health check is exempt (`config: { rateLimit: false }`).
- **Auth tier** (login, register, google): 10 req / 15 min — prevents credential brute-force.
- **Upload tier** (POST /api/files): 10 req / 1 min — prevents storage exhaustion.
- **Import tier** (POST /api/import): 3 req / 1 min — heavy operation.
- **Search tier** (GET /api/search): 30 req / 1 min — expensive DB queries.
- **Env config**: All limits tunable via `RATE_LIMIT_*` env vars. `RATE_LIMIT_ENABLED=false` disables entirely.
- **Vercel auto-skip**: Detected via `VERCEL` env var — in-memory store is useless in serverless. Use Vercel Firewall instead.
- **Error format**: Returns `{ success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message } }` matching existing API error format.
- **CORS**: `exposedHeaders` includes `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`, `retry-after`.
- **Per-route config**: Routes use `config.rateLimit` option with values from `fastify.rateLimitConfig` (decorated on boot). When disabled, routes set `config: { rateLimit: false }` for zero overhead.

### 15. Kanban View
`DatabaseViewType = 'table' | 'kanban'` controls which view renders in `DatabaseView` and inline `DatabaseViewEdit`. The view type is stored in `ViewConfig.viewType` (localStorage) and optionally in `DefaultViewConfig.viewType` (server-saved).

- **State**: `ViewConfig` has `viewType` (default `'table'`) and optional `KanbanConfig { groupByPropertyId, hiddenOptionIds }`. Actions: `setViewType()`, `setKanbanGroupBy()`, `toggleKanbanColumnVisibility()`, `moveCardToColumn()`, `getSelectProperties()`.
- **Grouping**: Rows are grouped by a `select` property's value. Each option becomes a column. Rows with `null` value appear in a "No Value" column. Hidden options are excluded.
- **DnD**: `@dnd-kit/core` with `useDroppable` columns and `useDraggable` cards. `pointerWithin` collision detection. On drag end, calls `moveCardToColumn()` which delegates to `updateRowProperties()` (optimistic).
- **Toolbar**: View switcher (table/kanban icons), "Group by" dropdown (lists `select` properties), "Columns" popover (eye/hide toggles per option). Kanban button disabled when no `select` property exists.
- **Cards**: Show static title (click navigates to row page) + non-empty property values via `CellRenderer` (no labels — property name shown on hover tooltip). Empty properties are hidden. The entire card is a drag handle; cell edit targets use `stopPropagation` to carve out interactive zones. "+ New" in each column creates a row with the column's option pre-set.
- **Inline editing**: When `canEdit=true`, property cells on cards are editable inline (same `CellRenderer` components as table view). Title remains static/non-editable on cards.
- **Shared colors**: `apps/web/src/lib/select-colors.ts` exports `COLOR_CLASSES` used by `SelectCell`, `MultiSelectCell`, `FilterPopover`, and `KanbanView`.

Types: `DatabaseViewType`, `KanbanConfig` in `packages/shared/src/types/database.ts`. Zod: `databaseViewTypeSchema`, `kanbanConfigSchema` in `packages/shared/src/schemas/database.ts`.

### 16. Email Two-Factor Authentication
Password-authenticated users can opt into email-based 2FA. When enabled, login requires the password **and then** a random 6-digit code emailed to the account address. The option is **hidden for Google-only accounts** (`hasPassword === false`); they delegate MFA to Google.

- **Two-step login**: `POST /api/auth/login` verifies the password; if `twoFactorEnabled`, it emails a code (bcrypt-hashed on the user row with a 10-min expiry + attempt counter) and returns `{ twoFactorRequired: true, pendingToken }` (a short-lived JWT with a `twoFactorPending` claim) **instead of** a session token. `POST /api/auth/login/verify-2fa` exchanges `pendingToken` + code for the real JWT. `authMiddleware` **rejects** any token carrying `twoFactorPending`, so a pending token can't access protected routes.
- **Self-service enable (with confirmation)**: `POST /api/auth/2fa/initiate` emails a code; `POST /api/auth/2fa/confirm` verifies it and sets `twoFactorEnabled = true` (confirming the mailbox is reachable, preventing lockout). `POST /api/auth/2fa/disable` turns it off and requires the current password. All three use `authMiddleware`. UI: `AccountSettingsModal` opened from `UserMenu` → "Account settings".
- **Admin override**: `PATCH /api/users/:id/two-factor` (`adminMiddleware`, body `{ enabled }`) flips a user's flag directly (no email confirmation) — an administrative override and lockout safety valve; disabling clears any pending challenge. Rejected for password-less (Google-only) accounts. UI: "Enable/Disable 2FA" button + "2FA" status badge in `UserManagementPage`, shown only when `user.hasPassword`.
- **Codes**: 6 digits, bcrypt-hashed, 10-min TTL, max 5 attempts. Verify endpoints use the **auth rate-limit tier**.
- **Email transport**: `apps/api/src/services/email-service.ts` wraps the Resend SDK. `RESEND_API_KEY` + `EMAIL_FROM` are **required** (no fallback). Outside production the code is also `console.log`ged for local/automated testing (debug aid, not a delivery fallback). Resend is a native Vercel Marketplace integration that auto-provisions `RESEND_API_KEY`.
- **Data model**: `User` gains `twoFactorEnabled` + ephemeral challenge fields (`twoFactorCodeHash`, `twoFactorCodeExpiresAt`, `twoFactorCodeAttempts`, `twoFactorCodePurpose`); `PublicUser` gains `twoFactorEnabled` + derived `hasPassword`. Columns added to both `db/schema.ts` (SQLite) and `db/pg-schema.ts` (Postgres) with migrations in `drizzle/` and `drizzle-pg/`.
- **Store**: `authStore` adds transient `twoFactorPending`/`pendingToken` (not persisted — a refresh restarts login) and actions `verifyTwoFactor`, `cancelTwoFactor`, `initiateTwoFactor`, `confirmTwoFactor`, `disableTwoFactor`. `LoginPage` renders a code-entry step when `twoFactorPending`.
- **Env vars**: `RESEND_API_KEY` (required for 2FA), `EMAIL_FROM` (sender address).

Types: `TwoFactorCodePurpose`, `TwoFactorChallengeResponse`, `LoginResponse`, `Verify/Confirm/DisableTwoFactorInput`, `AdminSetTwoFactorInput` in `packages/shared/src/types/user.ts`. Zod: `verify/confirm/disableTwoFactorInputSchema`, `adminSetTwoFactorInputSchema` in `packages/shared/src/schemas/user.ts`.
### 16. Database Pagination
Backend `getRows` supports `limit`/`offset` params. Table and kanban views paginate differently.

**Table view** (global, offset-based):
- `fetchRows()` sends `limit: PAGE_SIZE (50), offset: 0`. Resets rows on each call (filter/sort change).
- `loadMore()` sends `offset: rows.length` with the same sort/filter. Appends new rows with dedup by ID.
- UI shows a global "Load more — Showing X of Y" button when `rows.length < total`.

**Kanban view** (per-column, client-side slicing):
- `fetchRows()` sends `limit: KANBAN_FETCH_LIMIT (10000)` to fetch all rows at once.
- Each column is sliced to `KANBAN_COLUMN_PAGE_SIZE = 30` items. `kanbanColumnLimits: Record<string, number>` in `DatabaseInstanceContext` tracks per-column display limits.
- `loadMoreInColumn(columnKey)` bumps a column's display limit by 30. Each column shows its own "Load more — X of Y" button when sliced rows < total column rows.
- Column header count shows the real total (not the sliced count).
- `kanbanColumnLimits` resets to `{}` on: filter change, sort change, view type switch, group-by change, revert to default, clear database.

**Shared**: Changing filters or sort resets pagination (via `fetchRows()`). Switching view type triggers a re-fetch with the appropriate limit.

### 17. Title Property Filter
`applySingleFilter()` (backend + demo-client) checks if the filter targets a title-type property via `schema`. If so, constructs `propValue` from `row.title` instead of `row.properties[propId]`. This mirrors the existing title handling in `applySort()`.

### 18. Real-time Collaboration (Optional)
Supabase Realtime-powered presence and live editing. Enabled via `REALTIME_ENABLED=true` + Supabase env vars. Completely disabled by default (zero overhead).

- **Backend Broadcaster Adapter**: `apps/api/src/realtime/` — `RealtimeBroadcaster` interface with `SupabaseBroadcaster` (uses service role key) and `NoopBroadcaster` implementations. Factory in `realtime-factory.ts` (singleton pattern matching storage-factory). Config in `apps/api/src/config/realtime.ts`.
- **Backend Broadcasting**: Routes (`blocks.ts`, `pages.ts`, `databases.ts`) fire-and-forget broadcast after successful writes. Services are NOT modified — broadcasting happens at the route level to keep services storage-agnostic.
- **Token Endpoint**: `GET /api/realtime/token` — issues short-lived JWT (1h) signed with **ES256** using `SUPABASE_JWT_PRIVATE_KEY` (JWK format — JSON Web Key string). JWT header includes `alg: 'ES256'` and `kid` (matching the signing key imported into Supabase). Payload contains `sub` (userId), `role: 'authenticated'`, `is_owner` (boolean). The private key is parsed once at module scope via `importJWK()` and cached. Also returns `supabaseUrl` and `supabasePublishableKey` so the frontend doesn't need its own env vars.
- **Frontend Adapter**: `apps/web/src/lib/realtime/` — `RealtimeAdapter` interface with `SupabaseAdapter` implementation. All channels use `{ config: { private: true } }` for RLS-based authorization.
- **RealtimeManager**: Singleton in `realtime-manager.ts`, lives outside React. Calls `getState()` on Zustand stores. Handles: init, token refresh (50min timer), page/database join/leave, active block tracking (debounced 300ms), self-echo filtering, visibility change re-fetch.
- **Presence Store**: `apps/web/src/stores/presenceStore.ts` — `pageUsers` (who's on the page) and derived `activeBlockEditors` (Map<blockId, PresenceUser>).
- **Database Instance Registry**: `apps/web/src/stores/databaseInstanceRegistry.ts` — global Map so RealtimeManager can push events to the correct database instance store.
- **Presence UI**: `PresenceAvatarBar` (avatar circles in page top bar), `BlockEditIndicator` (colored left border + name tag on blocks being edited by others). Soft lock: visual only, doesn't prevent editing.
- **Channel structure**: `page:{pageId}` (broadcast + presence), `database:{databaseId}` (broadcast only). Private channels with RLS policy on `realtime.messages`.
- **Demo mode**: `isRealtimeEnabled()` returns `false` when `IS_DEMO_MODE` is true. Zero impact.
- **Env vars**: `REALTIME_ENABLED`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_PRIVATE_KEY`, `SUPABASE_JWT_KID`. Uses modern Supabase primitives (publishable/secret API keys + ES256 JWT signing key) — legacy anon/service_role/HS256 not supported.
- **Key generator**: `apps/api/scripts/generate-jwt-signing-key.mjs` is a Node.js helper that generates an ES256 key pair using `jose.generateKeyPair()`, exports PKCS#8 PEM, and walks the user through the Supabase import + rotate flow. Cross-platform, no openssl dependency.

### 19. Database References
A `reference` property type links records to rows in **another** database (many-to-many, one-directional). The cell displays each referenced row's title and is clickable → navigates to `/page/:id`.

- **Canonical value**: `{ type: 'reference'; value: string[] }` — an array of referenced row page ids — stored in the row's `properties` JSON blob (mirrors `multi_select`). The property definition carries `referencedDatabaseId` (the target database page id). Types/Zod in `packages/shared/src/{types,schemas}/database.ts` (`referenceValueSchema`, `ResolvedReference`).
- **Write-through index** (`page_references` table — `references` is a SQL reserved word): a denormalized junction `(sourceRowId, propertyId, targetRowId)`, indexed on both ends, kept in sync on every reference write via `StorageAdapter.setRowReferences`. Derived data — the JSON blob stays the source of truth. Used only for indexed cascade cleanup and future reverse lookups; never read on the getRows hot path. Rebuildable via `backfillReferenceIndex()` (runs at boot in `index.ts`). Storage methods: `setRowReferences`/`getReferencesToTarget`/`deleteReferencesBySource`/`deleteReferencesByTarget` in `sqlite-full-storage.ts` + `postgres-storage.ts`.
- **Per-viewer resolution + `#ref` redaction**: `reference-service.ts` `resolveReferencesForRows` populates `DatabaseRow.referenceData` (`Record<propId, { accessible, items:[{id,name}] }>`). Access is decided once per referenced database via `permissionService.canRead(referencedDatabaseId)`. If the viewer can't read it, the property is redacted (`accessible: false`) and the frontend (`ReferenceCell.tsx`) renders non-clickable `#ref` chips that can't be searched/filtered. `getRows` takes a `viewer` param; the databases route passes `{ userId, isOwner }`.
- **Search** (`search-service.ts`): reference values are searched by referenced row name, but only for rows present in the viewer's `accessiblePages` (redacted refs are not searchable — reuses `getUserAccessiblePages`).
- **Filter**: pick referenced records from a searchable list (`FilterPopover.tsx` `ReferenceFilterInput`), emitting `any`/`all` with comma-joined ids; `applySingleFilter` handles reference arrays alongside `multi_select`. Disabled when the referenced DB is inaccessible.
- **Cascade cleanup**: deleting a row/database calls `page-service.ts` `cleanupReferencesTo` inside recursive `deletePage`, using the index for an O(refs) reverse lookup, stripping the id from every referencing row's blob (version bump) and keeping the index in sync.
- **Add property**: `PropertiesPanel.tsx` offers a `Reference` type → second step picks the target database (from `pageStore`, `type === 'database'`).
- **Export-compat (future)**: value stays IDs-only; `referenceData` resolves `{ id, name }` — the shape a future export serializes (name + referenced record id).
- **Demo mode**: no permissions/SQL — `demo-client.ts` resolves names from localStorage (`accessible: true` always), replicates the `any`/`all` filter, name search, and blob-scan cascade on delete.

### 20. Deleting Pages (Database View + Page View)
Two entry points for deleting pages, both guarded by a shared confirmation modal (`apps/web/src/components/common/ConfirmDialog.tsx` — generic controlled `{ isOpen, title, message, confirmLabel, destructive, busy, onConfirm, onCancel }`, Esc/backdrop cancel). Database rows *are* pages, so both flows ultimately hit `pagesApi.delete` → backend `pageService.deletePage`, which already cascades to children and calls `cleanupReferencesTo`. **No backend/shared changes** — demo mode works automatically.

- **Bulk delete from the table view** (table view only, not Kanban): a selection checkbox column is prepended in `TableView.tsx` (header select-all + per-row checkboxes, shown only when `canEdit`). Selection state lives in the `DatabaseInstanceContext` store: `selectedRowIds: Set<string>` and `selectAllAcross: boolean` (the header checkbox escalates to "all rows matching the current filter, including non-loaded pages"). Actions: `toggleRowSelection`, `toggleSelectAll`, `clearSelection`, `deleteSelectedRows`. Selection is cleared by every view-reset action (`fetchRows`, `clearDatabase`, and transitively `setSort`/`setFilters`/`setViewType`/`revertToDefault`).
- **`deleteSelectedRows`**: resolves target IDs (for `selectAllAcross`, fetches all matching IDs via `databaseApi.getRows` with a large limit + the current filter, reusing the `buildQueryStrings` helper), optimistically drops rows + decrements `total`, closes the peek panel if it shows a deleted row, then fires `pagesApi.delete` per id with bounded concurrency (`runWithConcurrency`, limit 8); reverts `rows`/`total` on failure.
- **Selection bar** (`DatabaseSelectionBar.tsx`): rendered by `DatabaseView.tsx` between the toolbar and the view when the table view is active and a selection exists. Shows the count, a "Select all {total}" escalation link (when all loaded rows are picked but more pages exist), a red Delete button (→ `ConfirmDialog`), and a clear (✕) button. Future bulk actions (move, export) belong here.
- **Delete from the page view** (`PageContent.tsx`): a trash button next to the star in the top bar, shown when `canEdit`. On confirm calls `pageStore.deletePage`; **full view** → `navigate('/')` (welcome/empty state), **peek/split view** → `onClose()` (returns to the full page behind the single-level peek panel).

### 22. Unified Option Picker (multi_select + reference cells)
`apps/web/src/components/database/cells/OptionPickerMenu.tsx` is a shared dropdown shell that gives the `multi_select` and `reference` cell editors a consistent, search-first, keyboard-navigable UI. It owns the portal + fixed positioning (flip-above, `main`-scroll/`window`-resize reposition), click-outside, the auto-focused search input, keyboard navigation, the inline "Create new" row, and clear-search-and-refocus-on-select. Parents own filtering, item rendering, and the select/create handlers, so the shell stays generic. **No backend/shared/`CellRenderer` changes** — both cells keep the `value: string[]` / `onChange(value: string[])` contract, so demo mode works unchanged.

- **Behavior**: search on top (auto-focused); below it a live-filtered, `maxRendered`-capped list; below that a "Create *<text>*" row shown only when the trimmed search is non-empty and the parent reports no exact match (`createText = null` hides it). ArrowDown from the input moves the highlight into the list (create row is the last navigable entry), Enter activates the highlighted row (or the top row when highlight is `-1`), Escape closes. Selecting a row (Enter/click) clears the search and refocuses it, keeping the menu open (multi-value semantics; `closeOnSelect` reserved for future single-select adoption).
- **Props**: `open`, `anchorRef`, `onClose`, `search`/`onSearchChange`, `items: OptionPickerItem[]` (`{ id, render(state), isSelected?, disabledNav? }`), `onSelect`, `createText`/`onCreate`/`createLabel`, `loading`, `emptyLabel`, `maxRendered` (100), `minWidth`.
- **`MultiSelectCell.tsx`**: filters `options` by name client-side, renders color badges + hover rename/delete (isDefault-locked); the search doubles as the create source. **Create now also selects** (`updatePropertyOptions(...)` then `onChange([...value, newId])`). The editing row is `disabledNav` so inline-rename keystrokes don't hit shell nav.
- **`ReferenceCell.tsx`**: **server-side search** — resolves the referenced DB's title property id once via `pagesApi.get(referencedDatabaseId)`, then debounced (~200ms) `databaseApi.getRows(refDbId, { filter: `${titlePropId}:contains:${q}`, limit: 100 })` (unfiltered when `q` empty); a request-id ref drops stale responses. A `nameCache` (id→name) accumulates from `resolved.items` + every fetched candidate so selected chips keep their names outside the current result set. "Create page *<text>*" calls `pageStore.createPage({ title, parentId: referencedDatabaseId })`, seeds the cache, and selects the new page. Redaction (`#ref`) and clickable navigate-chips unchanged.
### 21. New Page from Database Toolbar
`DatabaseToolbar.tsx` renders a top-level **New** button (editor-only, left of the view switcher, shared by table + kanban). `handleNewPage` mirrors `TableView.handleAddRow` — `createPage({ title: 'Untitled', parentId: activeDatabaseId })` (pageStore) → `addRow(...)` (optimistic insert) — then calls `openPeekPanel(page.id)` (`uiStore`) to open the new page in split view immediately. No backend/store changes; works in demo mode. In kanban the new row has no select value and lands in the "No Value" column.

### 23. Performance Patterns (Storage Hot Paths)
Postgres-first optimizations behind optional adapter methods; SQLite keeps the JS paths (correct, slower). All were measured against `seed:perf` data (~5.6k pages, 2000-row database).

- **`getRows` SQL fast path vs JS path** (`database-service.ts`): when there is **no sort** and the filter is **absent or exactly one `contains` on the title property** (the shape of every default table/kanban fetch and of the reference-picker keystroke search), `storage.queryDatabaseRows()` runs one PG query — `WHERE parent_id = $db [AND title ILIKE $pattern]` with childIds ordering via `LEFT JOIN unnest($childIds) WITH ORDINALITY` (hash join — do NOT use `array_position()`, it rescans the array per row), `COUNT(*) OVER()`, `LIMIT/OFFSET`. LIKE metacharacters (`% _ \`) are escaped (JS treats them literally). Any other filter/sort → JS path over `getPagesByParent()` (semantics unchanged, mirrored by demo-client).
- **Permission lookup**: `getEffectivePermission` checks a request-scoped cache, then `findNearestPermission` (PG recursive CTE anchored on the literal pageId, `ORDER BY depth LIMIT 1` = nearest-ancestor-wins, depth cap 64), then falls back to the per-level JS walk (SQLite).
- **Request-scoped permission memoization** (`apps/api/src/services/request-context.ts`): `AsyncLocalStorage<Map<pageId:userId, level|null>>` installed by an `onRequest` hook in `index.ts`. Permission mutations (`sharePage`, `unshare`, `createOwnerPermission`, `deletePagePermissions`, `inheritParentPermissions`) call `clearPermissionCache()`. Code outside requests (scripts/seed) has no store — lookups just hit storage.
- **`getUserAccessiblePages`**: Map-based parent lookup + per-node accessibility memoization (shared ancestor chains walked once). Was O(N²·depth) via `allPages.find()`.
- **Reference title resolution** (`reference-service.ts`): referenced row ids are collected from the current page of rows and bulk-fetched via `getPagesByIds` — never resolve from a full-workspace map.
- **Batched block reorder**: `updateBlockOrders(pageId, orders)` — single `unnest`-driven UPDATE on PG, one transaction on SQLite. Used by `reorderBlocks`, `deleteBlock` renumbering, and mid-page inserts in `block-service.ts`.
- **Perf dataset**: `pnpm --filter @nonotion/api seed:perf` seeds ~3.1k document pages + a 2000-row database (all property types incl. references into a 500-row second database) + `perf-user@example.com` (password `perfperf`) with one inherited grant. Idempotent (`_perf_` id infix, marker setting); `-- --clean` removes everything, `-- --force` re-runs past the marker. Never part of demo data.

Deferred (assessed, not implemented): full jsonb filter/sort push-down (revisit >5-10k rows/database with active filters), GIN index on `properties` (rejected — queries are parent_id-bounded and GIN wouldn't serve path-extraction predicates), accessible-pages CTE (JS fix sufficient <50k pages).

### 24. MCP Server (Claude integration)
Read-only Model Context Protocol server for Claude clients (claude.ai custom connectors, Claude Desktop, Claude Code). Gated by `MCP_ENABLED=true` — when off, no routes are registered and all UI is hidden (`AuthConfigResponse.mcpEnabled`). Docs: `docs/mcp.md`.

- **Endpoint**: `POST /mcp` — Streamable HTTP transport (`@modelcontextprotocol/sdk`), **stateless**: a fresh `McpServer` + `StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })` per request, wired via `reply.hijack()` + `transport.handleRequest(request.raw, reply.raw, request.body)` (serverless-safe, no SSE). `GET/DELETE /mcp` → 405. Note `/mcp*` and `/.well-known/*` are root-level routes, not under `/api`.
- **Auth (two kinds, strictly separated)**: `mcp/mcp-auth.ts` accepts PATs (`nmcp_{tokenId12}{secret40hex}` — id embedded for O(1) lookup, SHA-256 at rest, managed in Account settings) and MCP OAuth JWTs (existing `JWT_SECRET`, claims `aud:'nonotion-mcp'` + `mcpScope:'read'`, 1h). `authMiddleware`/`optionalAuthMiddleware` reject any token with `mcpScope`; `/mcp` rejects session tokens. The user row is re-fetched every request (approval/existence). 401s carry `WWW-Authenticate: Bearer resource_metadata=...` which triggers client OAuth discovery.
- **OAuth 2.1 AS built-in** (`mcp/oauth/`): RFC 9728 + 8414 metadata, RFC 7591 dynamic registration (public clients, PKCE S256 only, https/loopback redirect URIs, exact match), `GET /mcp/oauth/authorize` → validates then 302 → SPA `/mcp/consent` (`McpConsentPage.tsx`, AuthGuard preserves query via `state.from`) → `POST /api/mcp/oauth/consent` (session auth, re-validates, issues single-use code — atomic `consumeOAuthCode`, hashed, 10-min TTL) → `POST /mcp/oauth/token` (formbody; code+PKCE or refresh grant). Refresh tokens rotate on use; reuse of a revoked token revokes the successor chain. All OAuth state is DB-backed (works on Vercel).
- **Access model**: per-user per-database grants in `mcp_database_access` (`enabled`, `allowImages`, `allowFiles` reserved) — `mcp-access-service.ts`. Always additive to `canRead`, re-checked on every tool call (`getEffectiveAccess`). UI: "MCP" button in `DatabaseToolbar` → `McpAccessPopover` (any viewer, per-user); overview + PATs in `AccountSettingsModal` → `McpSettingsSection`.
- **Tools** (`mcp/tools/`, one file each + `tool-helpers.ts`): `list_databases` (schemas incl. reference targets with `mcpAccessible` flag), `query_database` (property/option **names** mapped to ids, then delegates to `databaseService.getRows` — reuses filter engine + SQL fast path), `get_page` (markdown via `mcp/block-markdown.ts`; scope rule: nearest database ancestor must be MCP-enabled), `search` (scoped variant — `search-service.ts` takes optional `limit` + `scopeDatabaseIds`, filtering **before** scoring so results aren't starved), `get_image` (authorized by scanning the page's image blocks for the file id; `allowImages` gate, 4MB cap, no SVG). References: reference-service redaction (`accessible`) is never weakened; MCP adds `mcpAccessible = accessible && mcpEnabled(targetDb)` — names/ids shown when readable but not traversable, with an explicit note.
- **Storage**: `McpStorageAdapter` (`storage/mcp-storage-adapter.ts`) implemented by both storages, `getMcpStorage()` in the factory. Tables (both schemas + migrations): `mcp_database_access`, `mcp_personal_access_tokens`, `mcp_oauth_clients`, `mcp_oauth_codes`, `mcp_oauth_refresh_tokens`. Expired-row GC is opportunistic (on code creation).
- **CORS**: delegate in `index.ts` — permissive for `/mcp*` + `/.well-known/*`, fixed origin list otherwise. Rate limiting: `mcp` tier on `POST /mcp`; auth tier on register/token; metadata exempt.
- **Demo mode**: `mcpApi` stub in `demo-client.ts`; UI hidden (`mcpEnabled: false`).

Env vars: `MCP_ENABLED`, `MCP_PUBLIC_URL` (issuer/audience, required in prod), `FRONTEND_URL`, `MCP_ACCESS_TOKEN_TTL_MINUTES`, `MCP_REFRESH_TOKEN_TTL_DAYS`, `MCP_AUTH_CODE_TTL_MINUTES`, `RATE_LIMIT_MCP_*`. Types/Zod: `packages/shared/src/{types,schemas}/mcp.ts`.

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
| `apps/web/src/api/client.ts` | Conditional re-export hub (`IS_DEMO_MODE` switches between real and demo client) |
| `apps/web/src/api/real-client.ts` | Real API client with fetch-based HTTP requests |
| `apps/web/src/api/demo-client.ts` | Mock API client backed by localStorage (demo mode) |
| `apps/web/src/api/demo-storage.ts` | Low-level localStorage CRUD layer for demo mode |
| `apps/web/src/api/demo-data.ts` | Hardcoded demo seed content (book database, formatting showcase) |
| `apps/web/src/api/demo-init.ts` | One-time demo mode initialization (seed data + auth store) |
| `apps/api/src/services/import/import-service.ts` | Notion import orchestrator (ZIP → pages/databases/blocks) |
| `apps/api/src/services/import/md-parser.ts` | Markdown parser with inline formatting → HTML conversion |
| `apps/api/src/services/import/entity-creator.ts` | Three-pass entity creation with reference resolution |
| `apps/api/src/routes/import.ts` | `POST /api/import` multipart endpoint (100MB limit) |
| `apps/web/src/components/layout/ImportDialog.tsx` | Import dialog with drag-and-drop ZIP upload |
| `apps/api/src/services/search-service.ts` | Server-side search across pages, blocks, and properties |
| `apps/api/src/routes/search.ts` | `GET /api/search?q=...` endpoint with auth |
| `apps/web/src/components/database/PropertiesPanel.tsx` | Properties panel with drag reorder, rename, visibility, delete, add (incl. reference target-DB picker) |
| `apps/web/src/components/common/ConfirmDialog.tsx` | Reusable confirmation modal for destructive actions (page/row deletion) |
| `apps/web/src/components/database/DatabaseSelectionBar.tsx` | Bulk-action bar for selected table rows (count, select-all escalation, delete) |
| `apps/web/src/components/database/TableView.tsx` | Table view with row selection checkboxes, drag reorder, cell rendering |
| `apps/api/src/services/reference-service.ts` | Per-viewer reference name resolution + `#ref` redaction + `page_references` backfill |
| `apps/api/src/services/request-context.ts` | Request-scoped permission cache (AsyncLocalStorage) |
| `apps/api/src/scripts/seed-perf-data.ts` | Synthetic perf dataset seeder (`seed:perf`, `--clean`/`--force` flags) |
| `apps/api/src/storage/storage-adapter.ts` | Storage interfaces incl. optional SQL fast-path methods (`queryDatabaseRows`, `findNearestPermission`) |
| `apps/web/src/components/database/cells/ReferenceCell.tsx` | Reference cell: clickable chips, `#ref` redaction, server-side search + create-page editor (via `OptionPickerMenu`) |
| `apps/web/src/components/database/cells/MultiSelectCell.tsx` | Multi_select cell: color-badge tags, rename/delete, search + create-and-select editor (via `OptionPickerMenu`) |
| `apps/web/src/components/database/cells/OptionPickerMenu.tsx` | Shared search-first, keyboard-navigable dropdown shell for the multi_select + reference editors |
| `apps/api/src/db/schema.ts` / `pg-schema.ts` | Includes `page_references` write-through index table |
| `apps/web/src/components/layout/SearchModal.tsx` | Ctrl+K command-palette modal with keyboard navigation |
| `apps/api/src/services/auth-service.ts` | Auth service with email/password + Google login, auth mode helpers, email 2FA challenge/enable/disable |
| `apps/api/src/services/email-service.ts` | Resend-backed email sender (`sendTwoFactorCode`) for 2FA codes |
| `apps/api/src/routes/auth.ts` | Auth routes including `GET /auth/config`, `POST /auth/google`, 2FA login verify + enable/confirm/disable |
| `apps/web/src/components/auth/AccountSettingsModal.tsx` | Account settings modal with the email 2FA toggle + change-password |
| `apps/web/src/components/auth/AuthConfigProvider.tsx` | Fetches auth config, wraps app in GoogleOAuthProvider |
| `apps/web/src/components/auth/GoogleLoginButton.tsx` | Google Sign-In button component |
| `apps/web/src/components/layout/DemoBanner.tsx` | Demo mode banner (dismissible, sessionStorage) |
| `apps/api/src/routes/users.ts` | User management routes including `PATCH /api/users/:id/owner` |
| `apps/api/src/config/rate-limit.ts` | Rate limiting config, Fastify type augmentation, registration helper |
| `apps/api/src/config/realtime.ts` | Realtime config loader from env vars |
| `apps/api/src/realtime/realtime-broadcaster.ts` | `RealtimeBroadcaster` interface |
| `apps/api/src/realtime/realtime-factory.ts` | Broadcaster singleton factory (Supabase or Noop) |
| `apps/api/src/routes/realtime.ts` | `GET /api/realtime/token` endpoint |
| `apps/web/src/components/database/KanbanView.tsx` | Kanban board with DnD columns, cards, and property previews |
| `apps/web/src/lib/select-colors.ts` | Shared `COLOR_CLASSES` map for select option badge colors |
| `apps/web/src/lib/realtime/realtime-manager.ts` | Singleton coordinator — bridges Supabase events to Zustand stores |
| `apps/web/src/lib/realtime/supabase-adapter.ts` | Supabase Realtime adapter (private channels, presence, broadcast) |
| `apps/web/src/stores/presenceStore.ts` | Presence state (pageUsers, activeBlockEditors) |
| `apps/web/src/stores/databaseInstanceRegistry.ts` | Global registry for database instance stores |
| `apps/web/src/components/presence/PresenceAvatarBar.tsx` | Avatar bar component for page top bar |
| `apps/web/src/components/presence/BlockEditIndicator.tsx` | Soft lock border + name tag on blocks |
| `apps/api/src/mcp/mcp-routes.ts` | `POST /mcp` — stateless Streamable HTTP endpoint (hijack + per-request transport) |
| `apps/api/src/mcp/mcp-auth.ts` | Bearer auth for /mcp: PAT + MCP JWT verification, token separation |
| `apps/api/src/mcp/mcp-server.ts` | Builds the per-request McpServer and registers the five tools |
| `apps/api/src/mcp/block-markdown.ts` | Block[] → markdown serializer (TipTap inline HTML → md) |
| `apps/api/src/mcp/tools/tool-helpers.ts` | Name→id mapping, filter building, row humanization, scope walk, MCP access cache |
| `apps/api/src/mcp/oauth/oauth-service.ts` | DCR, PKCE, auth codes, token issue + refresh rotation/reuse detection |
| `apps/api/src/mcp/oauth/oauth-routes.ts` | Well-known metadata, register, authorize, token endpoints |
| `apps/api/src/services/mcp-access-service.ts` | Per-user per-database MCP grants + effective-access checks |
| `apps/api/src/services/mcp-pat-service.ts` | Personal access tokens (create/list/revoke/verify) |
| `apps/api/src/routes/mcp-settings.ts` | `/api/mcp/*` REST for settings UI + OAuth consent endpoint |
| `apps/api/src/config/mcp.ts` | MCP env config loader (`isMcpEnabled`, `loadMcpConfig`) |
| `apps/web/src/pages/McpConsentPage.tsx` | OAuth consent screen (approve/deny, database overview) |
| `apps/web/src/components/auth/McpSettingsSection.tsx` | PAT management + MCP database overview in Account settings |
| `apps/web/src/components/database/McpAccessPopover.tsx` | Per-database MCP toggle + image/file options popover |

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
VITE_DEMO_MODE=true pnpm --filter @nonotion/web build  # Demo mode (no backend)

# Seed
pnpm --filter @nonotion/api seed:demo  # Seed demo data into backend
pnpm --filter @nonotion/api seed:perf  # Seed large synthetic dataset for perf testing (-- --clean to remove)

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
- Additional block types (tables)
- S3/external file storage backend (currently BLOB in DB)

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
