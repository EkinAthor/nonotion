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
- **Write-through index** (`page_references` table — `references` is a SQL reserved word): a denormalized junction `(sourceRowId, propertyId, targetRowId)`, indexed on both ends, kept in sync on every reference write via `StorageAdapter.setRowReferences`. Derived data — the JSON blob stays the source of truth. Used only for indexed cascade cleanup and future reverse lookups; never read on the getRows hot path. Rebuildable via `backfillReferenceIndex()` (called at boot in `index.ts`, but **marker-gated** via the `settings` KV — runs once per `REFERENCE_BACKFILL_VERSION`, not on every cold start; bump the constant to force a re-run). Storage methods: `setRowReferences`/`getReferencesToTarget`/`deleteReferencesBySource`/`deleteReferencesByTarget` in `sqlite-full-storage.ts` + `postgres-storage.ts`.
- **Per-viewer resolution + `#ref` redaction**: `reference-service.ts` `resolveReferencesForRows` populates `DatabaseRow.referenceData` (`Record<propId, { accessible, items:[{id,name}] }>`). Access is decided once per referenced database via `permissionService.canRead(referencedDatabaseId)`. If the viewer can't read it, the property is redacted (`accessible: false`) and the frontend (`ReferenceCell.tsx`) renders non-clickable `#ref` chips that can't be searched/filtered. `getRows` takes a `viewer` param; the databases route passes `{ userId, isOwner }`.
- **Targeted fetch-by-ids (`ids` query param on `GET /api/databases/:id/rows`)**: comma-separated row page ids (Zod cap 200). Bypasses filter/sort/search/pagination; returns rows in requested order via `getPagesByIds`, **restricted to `parentId === databaseId`** (security: a readable database can't be used to read arbitrary pages); unknown ids silently dropped; `total = rows.length`. Consumers: `ReferenceCell`'s no-`resolved` fallback (row page detail — fetches exactly the referenced ids, so names resolve at any referenced-DB size) and `FilterPopover` `ReferenceFilterInput` chip-name resolution (independent of the dropdown's first-1000 candidate fetch; `titleFor` never renders a raw id — `…` while in flight, `Untitled` for deleted refs). Mirrored in `demo-client.ts`. Known follow-up: the filter dropdown's candidate list is still capped at the first 1000 rows with client-side search.
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
- **Sidebar payload — `GET /api/pages` returns *navigable* pages only** (`pageService.filterNavigablePages`, applied in `routes/pages.ts` after `getUserAccessiblePages`): drops database **row-pages** (a page whose parent is a `type === 'database'`) **except starred ones**, so the sidebar tree isn't shipped ~every row + its `properties` blob (the bulk of the payload at `seed:perf` scale — ~5.6k pages → ~3.1k, all `properties` gone). Databases keep their `databaseSchema`; documents keep `childIds`. Mirrored in `demo-client.ts` `pagesApi.getAll`. **Lazy single-page load**: rows are fetched on demand — `pageStore.loadPage(id)` (dedup via a module `inFlightPageLoads` set) inserts a single page via `pagesApi.get(id)`, called by `PageContent` when `pages.get(pageId)` is absent (covers the full page and the split-view peek panel). `getBreadcrumbs`/`useSyncWithPageStore`/`patchPageLocal` all no-op safely on rows not yet loaded. **Sidebar databases are leaf nodes** — `pageStore.getPageTree`'s `buildTree` returns `children: []` for `type === 'database'`, so a lazily-loaded row never reappears under its database and databases show no expand chevron.
- **Reference title resolution** (`reference-service.ts`): referenced row ids are collected from the current page of rows and bulk-fetched via `getPagesByIds` — never resolve from a full-workspace map.
- **Batched block reorder**: `updateBlockOrders(pageId, orders)` — single `unnest`-driven UPDATE on PG, one transaction on SQLite. Used by `reorderBlocks`, `deleteBlock` renumbering, and mid-page inserts in `block-service.ts`.
- **Serverless cold start** (Vercel): module top-level boot must stay cheap — the two boot backfills are marker-gated (see §19/§27), pg migrations reuse the storage pool (`getPostgresStorage().getDb()`), and the `PostgresStorage` pool sets `connectionTimeoutMillis: 10s`, `max: 3` + `allowExitOnIdle` on Vercel (10 elsewhere). `apps/api/vercel.json` sets `maxDuration: 60`. A slow boot returns a platform 504 **without CORS headers** — browsers report it as a CORS error (see `docs/vercel-deployment.md` troubleshooting).
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

### 25. Split View (Peek Panel) URL Persistence
The split view (`SidePanel` + `PageContent variant="peek"`) is reflected in the URL as a `?peek=<pageId>` search param, so it survives page reloads and can be shared/opened via a copied link. `uiStore.peekPageId` remains the in-memory source of truth for rendering; the URL is a synced mirror. **No backend/store contract changes** — pure client routing state, so demo mode is unaffected.

- **Store seeded from URL**: `uiStore` initializes `peekPageId` from `?peek=` at creation (`loadInitialPeek()` reads `window.location.search`), so the store and URL agree on the very first render (panel shows immediately, no flash, no mount-time reconciliation conflict).
- **Bidirectional sync** lives in `MainLayout.tsx` (the always-mounted protected-route layout) as two idempotent effects:
  - **URL → store** (keyed on `?peek`): reload, pasted link, back/forward, or sidebar nav to a page without a peek param. Reads fresh store state via `useUiStore.getState()` and calls `openPeekPanel`/`closePeekPanel`.
  - **store → URL** (keyed **only** on `peekPageId`, never on `searchParams`, so navigating between pages can't re-add a stale peek): **pushes** a history entry when opening/switching a peek (`peekPageId` set) and **replaces** when closing (`peekPageId` null) — `setSearchParams(..., { replace: !peekPageId })`. So Back/Forward step through peek states in order (Back from an open peek closes the split view, staying on the current page), while an explicit dismiss (X / Esc / delete) leaves no forward entry that reopens the panel.
  - **`syncingFromUrl` ref guards against echo**: the URL→store effect sets `syncingFromUrl.current = true` before applying a URL-originated change (back/forward/reload/pasted link); the store→URL effect consumes-and-skips when it sees the flag, so a Back/Forward pop never triggers a spurious history **push** back. (`window.location.search` reads unreliably during react-router's popstate transition, so the flag — not a location compare — is the source of truth for "did this change come from the URL?".)
  - Both effects no-op when already consistent, so React StrictMode's double-invoked effects are harmless.
- **Call sites unchanged**: `TableView`/`KanbanView`/`DatabaseToolbar`/`SidePanel`/`PageContent` still call `openPeekPanel`/`closePeekPanel`; the URL follows. `PageView` no longer force-closes the peek on `pageId` change — the URL→store effect handles closing when a target URL has no `peek` param.

### 26. Undo/Redo (Document-Wide)
Google-Docs-style unified undo/redo for the page canvas: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y. One per-page, in-memory history covering text edits AND structural ops (create/delete/split/merge, type changes, reorder, multi-delete). Page title and database ops are NOT covered. History clears on navigate-away/reload (`undoManager.clearPage` in `PageContent`'s per-pageId effect cleanup). Frontend-only — no backend/shared changes, demo mode works automatically.

- **UndoManager** (`apps/web/src/lib/undo/undo-manager.ts`): plain module (not Zustand — no reactive consumers, callable from store module scope). Per-page undo/redo stacks of `UndoEntry { steps: UndoStep[], focusBefore }`; step kinds: `text_edit` (before/after HTML or code string), `create`/`delete` (full `BlockSnapshot`, `delete` also carries `orderedIdsBefore`), `content_set`, `type_change`, `reorder`. Cap 100 entries/page. Applying undo/redo replays inverse ops through blockStore mutations with `{ history: 'skip' }`, so optimistic updates, `pendingCreates` sequencing, and the API boundary are reused. Per-page serial queue for rapid Ctrl+Z. `idRemap` chain: undoing a delete re-creates the block (hard deletes — new id minted); all step ids resolve through the chain at apply time.
- **Recording** happens ONLY inside blockStore local mutations (`createBlock`/`updateBlock`/`deleteBlock`/`reorderBlocks`/`changeBlockType`), in the synchronous optimistic section, guarded by `shouldRecord(opts)` (`history: 'skip'` + `undoManager.isApplying()`). `applyRemote*`/`fetchBlocks` never record → remote users' changes are never undoable locally (own-changes-only under realtime, by construction).
- **Text bursts**: TipTap's per-block StarterKit history is DISABLED (`history: false` in `useBlockEditor`). Typing coalesces into one `text_edit` step per burst — committed on ~1s pause, blur, structural op, or undo keypress. `commitBurst` force-saves un-flushed editor content to the store (`history:'skip'`) and records baseline→current. **Invariant**: `record()` of a structural step and `transact()` call `flushBursts()` first, and store methods that snapshot before-state flush before capturing — so snapshots are always fresh. `CodeBlockEdit` mirrors the burst pattern for its textarea (native undo suppressed via keydown intercept).
- **Grouping**: `undoManager.transact(pageId, fn)` folds all steps recorded in `fn` into one entry. Call sites: Enter-split (`useBlockEditor` Enter handler), Backspace-merge (`BlockWrapper.deleteAndMergeToPrevious`), multi-line paste, slash conversion (`selectSlashCommand`), `deleteSelectedBlocks`.
- **Conflict rule (skip)**: each step apply checks the block's current state matches the step's expected state (text/content/type equality); mismatch (remote edit, failed create) → step silently skipped. Never overwrites others' work despite server LWW.
- **Key interception**: `BlockKeyboardExtension` Mod-z/Shift-Mod-z/Mod-y (always consume, even on empty stack, to suppress native contenteditable undo); document-level capture fallback in `BlockCanvas` for no-focus/multi-select states (bails out for contenteditable/textarea/input/select); `CodeBlockEdit` textarea keydown.
- **Store id invariant (bug fixed here)**: `reorderBlocks`' success path must MERGE server order/version into existing store blocks — never replace the array with the server response, which would swap canonical temp ids for real ids (remounting editors and breaking undo's id chain).
- **Dev introspection**: `window.__undoDebug` (DEV only) exposes `stacks(pageId)`/`detail(pageId)` for tests/debugging.

### 27. Created-Time System Property
Every database schema contains a read-only `created_time` system property (`{ id: 'prop_created_time', name: 'Created', type: 'created_time' }` — fixed sentinel id + factory `createCreatedTimeProperty(order)` in `packages/shared/src/utils/system-properties.ts`). Its value is the row page's `createdAt` — **synthesized at read time, never stored in the `properties` blob** (mirrors the title pattern: title lives on `row.title`, created lives on `row.createdAt`).

- **Provisioning**: seeded in `createDefaultSchema()` (backend + demo-client), boot-time `backfillCreatedTimeProperty()` in `database-service.ts` (called from `index.ts`, idempotent, mirrors `backfillReferenceIndex` — **marker-gated** via the `settings` KV, runs once per `CREATED_TIME_BACKFILL_VERSION`), appended by the Notion import's `buildSchema()`, and reconciled in `demo-init.ts` for already-seeded demo users.
- **Sort/filter special-casing** (backend `applySort`/`applySingleFilter` + demo-client mirrors): sort compares full ISO `createdAt` (time-precision); filters compare **date-only** (`createdAt.slice(0, 10)`) because the filter UI emits `YYYY-MM-DD` — a full timestamp would fail same-day `lte`/`eq`. Sorting always uses the JS path (the SQL fast path requires no sort).
- **Immutability**: `updateSchema` blocks delete and name/options updates (width allowed); `addPropertyInputSchema` uses `addablePropertyTypeSchema` (excludes `created_time`) so it can't be added manually; `updateRowProperties` strips `created_time` values before merging. All mirrored in demo-client.
- **Hidden by default — `ViewConfig.shownSystemPropertyIds`**: system properties use *inverted* visibility semantics (visible only when listed), so localStorage configs and server defaults saved before the property existed keep it hidden. `togglePropertyVisibility` and `getVisibleProperties` in `DatabaseInstanceContext.tsx` branch on `type === 'created_time'`; the optional field round-trips through `DefaultViewConfig` (save-as-default/revert).
- **UI**: `CellRenderer` renders it via `DateCell` with `canEdit` forced false (date-only display of the full timestamp); PropertiesPanel shows it with a static name, no delete button, but a working eye toggle; FilterPopover reuses `DateRangeInput`; Kanban cards synthesize the value via `getCardValue()`. Column-header click sorting works unchanged.
- **Page view parity** (`PageProperties.tsx`): the row-page property list creates its instance store with the parent database id as persistence key (same key as `DatabaseView`), so it loads the same localStorage view config and applies the same visibility + property order as the database view (hidden columns stay hidden on the row page; changes reflect on next mount of the row page). It synthesizes the created_time value from `page.createdAt` like the table view.
- **MCP**: `humanizeRows` emits `row.createdAt` under the property name; filter values are normalized to date-only in `mapFilterValue`.
- Non-database pages already carry `createdAt`; no property surface exists for them yet (future use).

### 28. Prefill Row Properties from Active Filters
When a database view is filtered by concrete attribute values, a new row created in that view is pre-filled with those values so it satisfies the filter (and stays in view). Generalizes the Kanban-column pre-fill (`KanbanView.tsx` group-by select) to all filtered properties. Frontend-only — no backend/shared/demo changes.

- **`getPrefillFromFilters()`** (getter on the database instance store, `DatabaseInstanceContext.tsx`): reads `viewConfig.filters` + `schema`, returns `Record<propId, PropertyValue>`. Only "positive equality" rules produce a prefill: `text`/`url` ← `contains` (substring); `select`/`person` ← `in` **when exactly one id** (multiple is ambiguous → skipped); `multi_select` ← `any`/`all` (all ids); `reference` ← `any`/`in` (all ids); `checkbox` ← `eq` (`"true"`/`"false"` → boolean). Skipped: `neq`/`empty`/`not_empty`/`gte`/`lte`, `date`/`created_time` (ranges), `title`.
- **Wired into all three creation paths**: `TableView.handleAddRow`, `DatabaseToolbar.handleNewPage`, `KanbanView.handleAddRow` (merges prefill with the column's group-by value, column wins). Each passes the prefill to **both** `createPage({ properties })` (persists server-side in one request — `CreatePageInput.properties` already supported by `page-service.ts`, demo-client, and Zod) and `addRow({ properties })` (optimistic display).
- **Covers embedded views automatically**: the inline database block (`DatabaseViewEdit.tsx`) reuses the same `TableView`/`KanbanView`/`DatabaseToolbar` + store.

### 29. Save Status Indicator
A chip in the `PageContent` top bar (first child of the right-side cluster, so it appears on document pages, database pages, and the peek panel — all instances mirror one global store) showing auto-save state. Priority: `offline` (amber) > `saving` (pulsing blue) > `error` (red, tooltip carries the message) > `saved` (green = everything persisted, safe to close). Frontend-only; demo mode works automatically.

- **Store** (`apps/web/src/stores/saveStatusStore.ts`): aggregates `pendingCount` (in-flight tracked API mutations), `dirtyKeys` (block ids inside the 500ms autosave debounce window — typed but unsent), `lastError` (set by a failed mutation, cleared only by the next *successful* one), `online`. Pure selectors `selectSaveStatus` / `hasUnsavedWork`. `useSaveStatusGlobalListeners()` (mounted in `MainLayout`) wires `online`/`offline` events and a `beforeunload` warning while `hasUnsavedWork` (pending, dirty, or unresolved error — merely being offline doesn't warn).
- **API-boundary tracking** (`apps/web/src/api/save-tracking.ts`): `trackMutations(api, methods)` wraps an allowlist of mutation methods, applied in `client.ts` so real and demo clients are covered identically (handles the demo client's synchronous throws). Tracked: `pagesApi.create/update/delete/updateOrder`, `blocksApi.create/update/delete/reorder`, `databaseApi.updateSchema/updateProperties/updateKanbanCardOrder`, `filesApi.upload`. **New content-mutation API methods must be added to these allowlists.** Reads and `applyRemote*` (realtime echoes) are never tracked; undo/redo replays go through blockStore → wrapped `blocksApi` and are correctly counted.
- **Dirty-window protocol** (`useBlockEditor.ts` + `CodeBlockEdit.tsx`): `markDirty(blockId)` when the debounce is (re)scheduled; the timer callback clears `debounceRef` first and `clearDirty` runs in the save's `finally` guarded by `if (!debounceRef.current)` (a retype during the save keeps the block dirty). Every path that cancels the debounce (commitBurst, unmount flush, slash/markdown conversions, external-content sync) clears the flag when its replacement save settles — so status never shows "saved" between debounce-fire and API start.
- **Component** (`components/common/SaveIndicator.tsx`): dot + label chip, `data-save-status` attribute for tests; internal `useDisplayStatus` holds "saving" visible ≥300ms so near-instant saves (demo mode) don't flash.
- **Known limitation**: a half-typed, un-blurred page title or database cell shows "saved" until blur/Enter fires its save (those inputs commit on blur, no debounce — same as Notion).

### 30. Database Quicksearch
A search box in the `DatabaseToolbar` that full-text filters the current database view (table or kanban, full-screen or embedded) by **row title + page body text** (block content) — **not** properties. It combines **AND** on top of any active filter view, and is **transient**: not persisted to localStorage/server default, not part of `ViewConfig.filters`, and reset on view unmount. Server-side (so it searches the whole database, not just the loaded 50-row page); parity-mirrored in demo mode.

- **Wire format**: a new transient `search` query param on `GET /api/databases/:id/rows` (`DatabaseRowsQuery.search` + `databaseRowsQuerySchema` in `packages/shared`). Serialized in `real-client.ts` `databaseApi.getRows`; the route passes validated `parsed.data` straight through.
- **Backend** (`database-service.ts` `getRows`): a non-empty `search` **forces the JS path** — the title-only SQL fast path can't see block body text, so the guard is `!options.sort && !search && titleContains !== undefined`. `applySearch(rows, term)` runs **after `applyFilter`, before sort/paginate**, so `total` reflects the searched set. It keeps a row when `title` contains the term OR any of its blocks match — blocks are bulk-fetched once via `getStorage().getBlocksByPages(candidateIds)` (only for rows whose title didn't already match), text extracted with `getBlockText` + a local `stripHtml` (same as `search-service.ts`).
- **Store** (`DatabaseInstanceContext.tsx`): transient `searchQuery` state + `setSearch(query)` action (mirrors `setFilters`: resets kanban pagination, refetches from offset 0; no-ops when unchanged). `searchQuery` is threaded into the `databaseApi.getRows` calls in `fetchRows`, `loadMore`, and the select-all fetch in `deleteSelectedRows`, and cleared in `clearDatabase`. Deliberately excluded from `buildQueryStrings`, persisted config, and `getPrefillFromFilters`.
- **UI** (`DatabaseToolbar.tsx`): a compact debounced (250ms) `<input>` with magnifier icon + clear button, placed after the Filter button. Since there is a single `DatabaseView` for both full-screen and embedded, it appears in both automatically; kanban narrows cards across columns (column counts reflect the searched set).
- **Demo parity** (`demo-client.ts`): mirrored `applySearch` (title OR block text via `storage.getAllBlocks()`), applied after `applyFilter` before `slice`, so `total` matches.

### 31. File Attachments (Optional)
Upload arbitrary files to pages via a `file` block (chip with Open/Download actions). Env-gated: `FILE_ATTACHMENTS_ENABLED=true` registers `routes/attachments.ts` (dynamic import in `index.ts`, MCP pattern) and flips `AuthConfigResponse.fileAttachmentsEnabled` (+ `fileAllowedExtensions`, `fileMaxSizeMb`), which gates the slash-menu item (`SlashCommandMenu.tsx`) and the MCP "Allow file access" checkbox. Full docs: `docs/file-attachments.md`.

- **Metadata vs bytes**: metadata always in the `files` table (new columns `page_id`, `storage_backend` `'db'|'supabase'`, `status` `'pending'|'ready'`, `detached_at`; `data` now nullable). Bytes go through `AttachmentBlobBackend` (`storage/attachment-backend.ts`) — `DbAttachmentBackend` (BLOB, multipart through API) or `SupabaseAttachmentBackend` (private bucket, signed upload/download URLs, AES-256 at rest — the encryption story). Rows remember their own backend, so switching `FILE_STORAGE_BACKEND` keeps old files working. Legacy image rows have `page_id NULL` and are untouched (`POST /api/files` + `GET /api/files/:id` unchanged).
- **Upload flow**: `POST /api/files/attachments/initiate` (Zod `attachmentInitiateInputSchema`, extension allowlist + size + `canEdit(pageId)`, creates `pending` row) → supabase: browser PUTs to signed URL then `POST .../:id/confirm` (verifies object + real size, deletes on over-cap); db: multipart `POST .../:id/content` (terminal). All on the upload rate-limit tier. Frontend orchestration in one method: `filesApi.uploadAttachment(file, pageId)` (in the save-tracking allowlist).
- **Download flow**: `GET /api/files/:id/download-url?disposition=` — requires `canRead` on the linked page (fixes the any-authed-user hole for new files), returns a Supabase signed URL or a JWT-tokenized `GET /api/files/:id/download?token=` public route (`aud:'file-download'` tokens are rejected by `authMiddleware`; route sets `Content-Disposition`, `nosniff`, `no-store`; `inline` only for safe MIMEs). `FileEdit.tsx` never branches on backend.
- **Content shape**: `FileContent { fileId, filename, size, mimeType }` — deliberately **no `url` key** (`getBlockText()` keys off `'url'` for images; file blocks return `filename`, making them searchable).
- **Lifecycle**: block delete/replace → `markDetached` (undo-safe; block re-create calls `markReattached`); page delete → hard delete blob+row (`deleteAttachmentsByPage` in `page-service.deletePage`); opportunistic `gcSweep()` on initiate reaps pending/detached rows >24h. Hooks live in `block-service.ts`/`page-service.ts`.
- **Validation**: extension allowlist (`FILE_ALLOWED_EXTENSIONS`, default ~38 common extensions — office docs, text/data incl. xml, archives, images, audio/video; see `config/files.ts`), `FILE_MAX_SIZE_MB` (default 25), html/svg/js **always** rejected (stored-XSS). Config in `config/files.ts` (throw in prod / warn+fallback-to-db in dev when supabase creds missing).
- **MCP**: `get_file` tool (`mcp/tools/get-file.ts`, clone of get-image with `allowFiles` gate + fileId page-scan + 4MB cap; text MIMEs → text, else base64 resource). `block-markdown.ts` renders `[name](file: file_x)` or an omission notice via `ctx.allowFiles`. `McpAccessPopover` "Allow file access" checkbox is now live (disabled when the feature is off server-side).
- **Demo mode**: `uploadAttachment`/`getDownloadUrl` throw; config stub reports `fileAttachmentsEnabled: false` → slash item hidden.
- **Env vars**: `FILE_ATTACHMENTS_ENABLED`, `FILE_STORAGE_BACKEND` (`db` default; db+Vercel caps uploads ~4.5MB), `FILE_BUCKET`, `FILE_ALLOWED_EXTENSIONS`, `FILE_MAX_SIZE_MB`, `FILE_SIGNED_URL_TTL_SECONDS`; supabase backend reuses `SUPABASE_URL`/`SUPABASE_SECRET_KEY`.

### 32. Inline @-Mentions
Typing `@` in any TipTap text block (paragraph, heading/2/3, bullet/numbered list, checklist) opens a caret-anchored menu (`MentionMenu.tsx`, modeled on `SlashCommandMenu.tsx` — portal, flip-above, document-level keydown so the editor keeps focus) with **Users** and **Pages** sections plus an always-present "Keep as plain text" row. Selecting inserts an inline mention atom. **No backend/shared changes** — mentions live inside the block's HTML `text` string, so demo mode works with mirrored seed content.

- **Trigger rule**: opens only when the `@` is at block start or preceded by whitespace (`/(^|\s)@$/` against `doc.textBetween(1, from, '\n', mentionLeafText)`) — emails like `a@b` never trigger. Space right after `@` (or in the query) closes the menu leaving plain text. Detection lives in `useBlockEditor.ts` `onUpdate`, mirroring the slash-menu pattern (`mentionStartPosRef` holds the real `@` doc position, `mentionMenuOpenRef` for keyboard-extension closures; Enter consumed / Escape closes / arrows deferred to the menu's document listener). **`mentionLeafText` is load-bearing**: it maps every leaf atom to a 1-char `￼` (hard breaks to `\n`) so string offsets equal doc positions in blocks that already contain mentions.
- **Mention node** (`apps/web/src/lib/tiptap/mention-node.ts` — the repo's first custom TipTap node): inline atom serialized as `<span data-mention-type="page|user" data-mention-id="…">Label</span>` (label = text child → server search keeps working via its generic tag-strip). **Byte-stability invariant: `renderHTML` is the only writer of the persisted shape — fixed attribute order, no classes/extra attributes ever.** The pending-save echo check and undo `text_edit` steps compare exact HTML strings; all styling lives in the NodeView. The NodeView (plain JS) handles clicks in both editable and read-only editors: page → `openPeekPanel(id)` (replaces content if already open), user → `openUserMentionPopover(id, rect)` (uiStore) → `UserMentionPopover.tsx` (mounted once in `MainLayout`, PersonCell-style initials + name/email, "User no longer exists" on 404). The NodeView dom is an `<a href="/page/…">` for page mentions (span for users) so native open-in-new-tab works — see §34; the mousedown `preventDefault` is guarded to `button === 0`, and the persisted `renderHTML`/`parseHTML` span shape is unchanged (invariant intact). `index.css` overrides `.ProseMirror a[data-mention-type]` so mentions keep mention styling, not blue link styling.
- **Insertion** (`insertMention` in `useBlockEditor.ts`): `undoManager.transact` → `deleteRange(@query)` + `insertContent(mention + space)`; the normal onUpdate→debounce persists. Ctrl+Z restores the typed `@query`. Labels are baked at insert time (stale on rename — accepted; live resolution is future work).
- **Menu data**: Users = `usersApi.list()` filtered client-side by name/email (cap 5). Pages = instant local filter over `pageStore.pages` + debounced (250ms) `searchApi.search` merge for row-pages absent from the store (cap 5, results filtered to title matches). Empty query → 2 recents per section from `apps/web/src/lib/mention-recents.ts` (localStorage; pages recorded on open in `PageContent`, users on mention), padded with newest pages / first users.
- **Serializer touch-points** (update when changing the node's HTML): `clipboardTextSerializer` + node case (`useBlockEditor.ts`), `htmlToInlineMarkdown` (`html-markdown.ts`, user → `@Name`), MCP `htmlToMarkdown` (`block-markdown.ts`, page → `[Title](page: pg_x)` matching the page_link convention, user → `@Name`).
- **Deleted/inaccessible pages**: hard-deleted pages and no-access pages both 404 (anti-enumeration), so `PageContent`'s not-found state says "This page was deleted or you don't have access" (works in peek automatically).
- **Slash-menu guard**: the slash open condition gained `doc.content.size === 3` — `getText()` is blind to atoms, so without it typing `/` after a mention would open the slash menu with its hardcoded position pointing into the atom.
- **Demo**: mention showcase blocks (`blk_demo_mn_*`) seeded in `demo-data.ts` (shared factory `createMentionShowcaseBlocks`), retrofitted for already-seeded browsers via `ensureMentionShowcaseBlocks()` in `demo-init.ts` (end-append keeps orders identical), mirrored in `seed-demo-data.ts` with the runtime admin user id.

### 33. Simple Export (Database → Markdown ZIP)
`GET /api/databases/:id/export` builds a self-contained ZIP of a database in memory (`adm-zip`, already a dep): `index.md` (per-row link + created date + select/multi_select tag names — grep-friendly) and a **single `pages/` folder** holding every row-page as markdown **and** all referenced image/file assets. **No entity ids anywhere in the output** — references become archive-relative paths (targets inside the export) or plain-text names (outside). Env-gated by `SIMPLE_EXPORT_ENABLED` — **default ENABLED** (`!== 'false'`, inverted vs. every other flag's `=== 'true'`; don't "harmonize" it). Docs: `docs/simple-export.md`.

- **Serializer reuse — resolver hooks**: `mcp/block-markdown.ts` gained optional `BlocksToMarkdownContext.resolvers` (`ExportLinkResolvers { image(fileId), file(fileId), page(pageId, fallbackTitle?) }`) and an optional 2nd param on `htmlToMarkdown`. With resolvers set, images/files render as relative paths (null → `*[image unavailable]*` / plain filename), page links/mentions/pasted internal URLs (`/page/pg_x`, `/api/files/file_x`) resolve to local links or plain titles, and `database_view` renders `[Embedded database: Title]`. **Invariant: without resolvers, MCP output is byte-identical to before** — every branch is `ctx.resolvers ? … : <original>`.
- **Service** (`services/export/simple-export-service.ts`): rows via `getPagesByParent` ordered by `childIds` (no pagination), `resolveReferencesForRows` for per-viewer reference names, blocks via `getBlocksByPages` grouped by pageId. **Naming pass before rendering** so cross-row links resolve: `slug(title)_<YYYY-MM-DD>.md`, duplicate slugs numbered **before** the date (`slug_1_<date>.md`), one case-insensitive `NameAllocator` shared by pages and assets. File bytes are pre-fetched (resolvers are synchronous): `fileService.getFile` first, then `attachmentService.getAttachmentData` when `isFileAttachmentsEnabled()` — any miss degrades to text, never fails the export. Inaccessible references are omitted entirely (no `#ref`, no ids).
- **Route** (`routes/export.ts`, dynamic-import-registered in `index.ts`): databases-route middleware stack, `canRead` → 404 (anti-enumeration), import rate-limit tier, ZIP sent with `contentDisposition()` from `utils/http.ts` (extracted from attachments route, now shared).
- **Frontend**: `exportApi.exportDatabase(id)` in real-client (hand-rolled authed fetch → blob + filename from Content-Disposition; NOT in the save-tracking allowlist — it's a read), throwing stub in demo-client. Export button in `DatabaseToolbar` (MCP-button pattern: `simpleExportEnabled && !IS_DEMO_MODE && activeDatabaseId`, **not** gated on `canEdit` — read access suffices), anchor-click download with busy/error state.
- Flag exposed via `AuthConfigResponse.simpleExportEnabled` (`routes/auth.ts`, authStore fallback, demo-client `getConfig`).

### 34. Internal Page Links as Real Anchors
Internal page-navigation affordances render real `<a href="/page/<id>">` elements so the browser's native "Open in new tab" (context menu) and middle-click work. Helpers in `apps/web/src/lib/page-links.ts`: `pageHref(id)`, `isNewTabClick(e)` (non-primary button or ctrl/cmd/shift/alt → let the browser handle it), and capture-phase `suppressNativeNavForPlainClick` for anchors that contain interactive children. Plain left-clicks are intercepted and run the existing SPA behavior (`navigate()` or `openPeekPanel()`); the `href` is **always the full page**, even where left-click opens a peek. Frontend-only — no backend/shared changes, demo mode unaffected.

- **Converted sites**: sidebar rows (`SortablePageTreeItem`, `PageTreeItem`, `StarredSection`), kanban cards (`KanbanView` `SortableKanbanCard`), table "Open" buttons (`TableView`, both row paths), reference chips (`ReferenceCell`, read-only + editable paths — **redacted `#ref` chips stay `<span>`**), page @-mention NodeView (`mention-node.ts`, live editor DOM only — persisted HTML untouched, user mentions stay `<span>`).
- **Composite-anchor pattern**: rows/cards containing buttons or editable cells get `onClickCapture={suppressNativeNavForPlainClick}` — inner controls' `stopPropagation` does NOT cancel an anchor's native navigation (only `preventDefault` does), so the capture guard cancels it once for the whole subtree while modified/middle clicks pass through. React-created DOM isn't parser-restructured, so button-inside-anchor nesting is stable.
- **dnd-kit coexistence**: every converted anchor sets `draggable={false}` (suppresses native link-drag). The kanban card is the only site with `{...listeners}` on the anchor itself — `draggable={false}` and `role={undefined}` are placed **after** the spreads so they win; PointerSensor (distance 8) ignores non-primary buttons, and `onClick` `preventDefault`s when `isDragging`.
- **Styling**: Tailwind preflight resets anchors to `color/text-decoration: inherit`, so swaps are visually invisible — except inside `.ProseMirror`, where `index.css` adds `a[data-mention-type]` overrides (and widens the mention selection-ring selector to `span`+`a`).
- **New nav affordances should follow this pattern** (anchor + `pageHref` + `isNewTabClick` guard). Deliberately NOT converted this pass: `PageBreadcrumb`, `SearchModal`, `SidePanel`, `PageLinkEdit`, `DatabaseViewEdit`, `BlockWrapper` (still plain `navigate()` calls), and the table `<td>` background click.

### 35. Inline Emoji Picker
Typing `:` + ≥1 character at word start (start-of-text or after whitespace — `12:30`, `note:`, bare `:` never trigger) opens a searchable emoji menu, Slack/Notion-style. Selecting inserts the native emoji character as **plain text** — no custom TipTap node (deliberate contrast with §32's mention atom: no serializer touch-points, no byte-stability constraints, copy/paste and search work for free). Frontend-only except the icon schema bump; demo mode works automatically.

- **Dataset**: `@emoji-mart/data` (data-only, ~1.9k emoji, Slack-style shortcode ids), **lazy-loaded** via `import()` in `apps/web/src/lib/emoji/emoji-data.ts` — its JSON lives in its own async chunk (~82KB gzip, fetched on first trigger; main bundle unchanged). Everything downstream consumes the normalized **`EmojiItem { id, name, keywords, char, category }`** model — the swap point for future user-created custom emoji (an `imageUrl` variant) or a dataset change. `searchEmoji(data, query, limit, usage?)` ranks: exact id match first, then **most-used** (usage count desc, recency tiebreak), then match tier (id starts-with > id contains > name contains > keyword starts-with) in stable dataset order. No skin-tone selector (base skin only).
- **Usage tracking** (`apps/web/src/lib/emoji/emoji-usage.ts`): localStorage map `nonotion_emoji_usage` (`{id: {count, lastUsed}}`, pruned to top 100). Every selection on any surface calls `recordEmojiUsage(id)`; powers search ranking + the icon picker's "Most used" section.
- **Three surfaces**:
  1. **TipTap text blocks**: trigger arms in `useBlockEditor.ts` `onUpdate` mirror the mention pattern — open regex `/(^|\s):[^\s:￼]$/` (the `￼`/`ATOM_CHAR` exclusion keeps a mention atom from acting as the query char; all `textBetween` calls use `mentionLeafText`), `colonStartPosRef` re-validated each update, closes on space/newline/atom/second-`:`/backspace-to-bare-`:`. `insertEmoji` replaces `:query` via `undoManager.transact` (Ctrl+Z restores the typed text), **no trailing space**. `emojiMenuOpenRef` is OR'd into the keyboard extension's Enter/Escape/Arrow guards; external-content sync closes the menu. Rendered in the 7 text registry components (`CodeBlockEdit` excluded).
  2. **Page title input** (`PageHeader.tsx`): `apps/web/src/lib/emoji/useInputEmojiTrigger.ts` — regex `/(^|\s):([^\s:]+)$/` against `value.slice(0, selectionStart)` on every `onChange`; caret x approximated with canvas `measureText`; splice-insert restores the caret via rAF. `handleKeyDownCapture` runs first in the input's `onKeyDown` so Enter/Escape go to the menu, not save/revert.
  3. **Page-icon picker**: `EmojiPickerPopover.tsx` (button-anchored, own focused search input, "Most used" + category grids, Enter picks first result, "Remove icon" row) replaced the old hardcoded 12-emoji grid.
- **`EmojiMenu.tsx`** (caret surfaces): clone of `MentionMenu` mechanics (portal, fixed-position flip, document-level keydown so the editor/input keeps focus, `data-emoji-menu`). **Zero matches auto-close** (emoticons like `:-)` never leave a dead box). Container `onMouseDown` `preventDefault` keeps the title input focused during row clicks.
- **Schema**: `icon: z.string().max(32)` (was 10) in `packages/shared/src/schemas/page.ts` — ZWJ sequences (family emoji = 11 UTF-16 units) now accepted as page icons.
- Punted: `:shortcode:` closing-colon autocomplete (second `:` just closes the menu), skin tones, `TitleCell` trigger.

## Critical Files

| File | Purpose |
|------|---------|
| `packages/shared/src/types/block.ts` | Block type definitions - drives the entire block system |
| `packages/shared/src/schemas/block.ts` | Zod validation for block API requests |
| `apps/api/src/storage/sqlite-full-storage.ts` | Unified SQLite storage for all entities (pages, blocks, users, permissions, files) |
| `apps/web/src/stores/pageStore.ts` | Page state with optimistic update/delete |
| `apps/web/src/stores/blockStore.ts` | Block state with optimistic updates + temp ID mapping + undo recording |
| `apps/web/src/lib/undo/undo-manager.ts` | Document-wide undo/redo manager (per-page stacks, bursts, groups, id remap) |
| `apps/web/src/stores/databaseStore.ts` | Database state with optimistic row/property updates |
| `apps/web/src/components/blocks/BlockCanvas.tsx` | Main editing surface with drag-and-drop |
| `apps/web/src/lib/tiptap/useBlockEditor.ts` | Shared TipTap editor hook with auto-save, keyboard handling, slash commands |
| `apps/web/src/contexts/BlockContext.tsx` | Context for block operations (create, change type, navigate) |
| `apps/web/src/components/blocks/SlashCommandMenu.tsx` | Slash command popup for changing block types |
| `apps/web/src/lib/tiptap/mention-node.ts` | Inline @-mention TipTap atom node (byte-stable span serialization + click NodeView) |
| `apps/web/src/components/blocks/MentionMenu.tsx` | Caret-anchored @ menu (Users/Pages sections, recents, hybrid page search) |
| `apps/web/src/components/mentions/UserMentionPopover.tsx` | Info popover shown when a user mention is clicked |
| `apps/web/src/lib/mention-recents.ts` | localStorage recency tracking for the @ menu (pages on open, users on mention) |
| `apps/web/src/lib/emoji/emoji-data.ts` | Lazy-loaded emoji dataset (`@emoji-mart/data`) normalized to `EmojiItem` + ranked `searchEmoji` |
| `apps/web/src/lib/emoji/emoji-usage.ts` | localStorage usage-frequency tracking (most-used ranking + "Most used" section) |
| `apps/web/src/lib/emoji/useInputEmojiTrigger.ts` | ":" trigger hook for plain `<input>` surfaces (page title) |
| `apps/web/src/components/blocks/EmojiMenu.tsx` | Caret-anchored ":" emoji search menu (text blocks + title input) |
| `apps/web/src/components/common/EmojiPickerPopover.tsx` | Button-anchored searchable emoji picker (page icon) |
| `apps/web/src/components/blocks/registry/index.ts` | Block type registry with shortcuts |
| `apps/api/src/storage/file-storage-adapter.ts` | `FileStorageAdapter` interface (metadata + BLOB) incl. attachment lifecycle methods |
| `apps/api/src/storage/attachment-backend.ts` | `AttachmentBlobBackend` interface + per-kind singleton factory (db/supabase bytes path) |
| `apps/api/src/storage/supabase-attachment-backend.ts` | Supabase Storage backend (signed upload/download URLs, verify, delete) |
| `apps/api/src/services/attachment-service.ts` | Attachment validation, initiate/confirm, download authorization, detach + GC |
| `apps/api/src/routes/attachments.ts` | Attachment routes (initiate/content/confirm/download-url + public tokenized download) |
| `apps/api/src/config/files.ts` | File attachments env config (`isFileAttachmentsEnabled`, `loadFileAttachmentsConfig`) |
| `apps/web/src/components/blocks/registry/FileEdit.tsx` | File block: upload drop-zone + chip with Open/Download/Replace/Remove |
| `apps/api/src/mcp/tools/get-file.ts` | MCP get_file tool (allowFiles gate, 4MB cap, text/resource result) |
| `apps/api/src/services/export/simple-export-service.ts` | Simple export: database → markdown ZIP (naming/dedup, property rendering, asset embedding) |
| `apps/api/src/routes/export.ts` | `GET /api/databases/:id/export` (canRead, import rate tier, ZIP response) |
| `apps/api/src/utils/http.ts` | Shared `contentDisposition()` RFC 5987 helper (attachments + export) |
| `apps/api/src/services/file-service.ts` | File upload validation, MIME checks, size limits |
| `apps/api/src/routes/files.ts` | File upload/download endpoints (`@fastify/multipart`) |
| `apps/web/src/api/client.ts` | Conditional re-export hub (`IS_DEMO_MODE` switches between real and demo client); applies save-tracking allowlists |
| `apps/web/src/api/save-tracking.ts` | `trackMutations` wrapper reporting content-mutation API calls to the save-status store |
| `apps/web/src/stores/saveStatusStore.ts` | Global save-status state (pending mutations, dirty debounce windows, error, online) + unload guard |
| `apps/web/src/components/common/SaveIndicator.tsx` | Top-bar save-status chip (saved/saving/error/offline, min-visible hold) |
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
| `apps/web/src/lib/page-links.ts` | Real-anchor helpers for internal page navigation (`pageHref`, `isNewTabClick`, capture guard) |
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
- Embedded rendering of attachments (e.g. pptx as slideshow) — attachments are download/open links for now
- Migrating embedded images off DB BLOB storage (attachments already support Supabase Storage)

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
