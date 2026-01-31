# CLAUDE.md - AI Assistant Guide for Nonotion

## Project Overview

Nonotion is a Notion-like workspace application with block-based page editing. It's a pnpm monorepo with a Fastify backend and React frontend.

**Current Phase**: Phase 1 (baseline) - Single user, local JSON storage, H1 + Paragraph blocks only.

## Architecture

```
nonotion/
├── packages/shared/     # @nonotion/shared - Types, schemas, utilities
├── apps/api/            # @nonotion/api - Fastify REST API (port 3001)
├── apps/web/            # @nonotion/web - React SPA (port 5173)
├── e2e/                 # @nonotion/e2e - Playwright tests
└── data/                # Runtime JSON storage (gitignored)
```

### Data Flow
```
React Components → Zustand Stores → API Client → Fastify Routes → Services → JSON Storage
```

## Key Patterns

### 1. Block Registry Pattern
New block types are added as plugins in `apps/web/src/components/blocks/registry/`. Each block needs:
- An edit component (TipTap-based)
- Entry in `registry/index.ts`
- Backend support for the block type in shared schemas

### 2. Storage Adapter Pattern
`apps/api/src/storage/storage-adapter.ts` defines the interface. Currently implemented by `JsonFileStorage`. Future: swap to database without changing API layer.

### 3. Entity IDs
All entities use prefixed IDs for type safety:
- Pages: `pg_xxxxxxxxxxxx`
- Blocks: `blk_xxxxxxxxxxxx`
- Users: `usr_xxxxxxxxxxxx`

### 4. Optimistic Updates
Zustand stores update UI immediately, then sync with backend. On error, refetch to restore correct state.

### 5. LWW Sync Preparation
All entities have `version` and `updatedAt` fields for future last-write-wins conflict resolution.

### 6. Block Context Pattern
`apps/web/src/contexts/BlockContext.tsx` provides block-level operations to edit components:
- `createBlockBelow()` - Create new block after current
- `changeBlockType()` - Change block type (heading/paragraph)
- `focusPreviousBlock()` / `focusNextBlock()` - Navigate between blocks

### 7. Slash Commands
Typing `/` at the start of an empty block opens a command menu. Shortcuts like `/h1`, `/p` filter and select block types.

## Critical Files

| File | Purpose |
|------|---------|
| `packages/shared/src/types/block.ts` | Block type definitions - drives the entire block system |
| `packages/shared/src/schemas/block.ts` | Zod validation for block API requests |
| `apps/api/src/storage/json-storage.ts` | Storage implementation with caching and atomic writes |
| `apps/web/src/stores/pageStore.ts` | Page state management with tree operations |
| `apps/web/src/stores/blockStore.ts` | Block state with optimistic updates |
| `apps/web/src/components/blocks/BlockCanvas.tsx` | Main editing surface with drag-and-drop |
| `apps/web/src/lib/tiptap/useBlockEditor.ts` | Shared TipTap editor hook with auto-save, keyboard handling, slash commands |
| `apps/web/src/contexts/BlockContext.tsx` | Context for block operations (create, change type, navigate) |
| `apps/web/src/components/blocks/SlashCommandMenu.tsx` | Slash command popup for changing block types |
| `apps/web/src/components/blocks/registry/index.ts` | Block type registry with shortcuts |

## Commands

```bash
# Development
pnpm dev                              # Start all (API + Web)
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
Delete files in `data/pages/` and `data/blocks/`, restart API.

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
- Authentication (currently auto-logged in as admin)
- Real-time collaboration (WebSocket)
- Additional block types (lists, code, images, tables)
- Database storage (Supabase)
- Rich text formatting (bold, italic, etc.)

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
Kill existing processes on ports 3001 (API) or 5173 (Web).

### Blocks not saving
Check browser console for API errors. Verify API is running. Auto-save has 500ms debounce.

### Drag and drop not working
Requires mouse movement of 8px to activate (prevents accidental drags).
