# Phase 1 Implementation Plan: Nonotion Workspace Platform

## Overview

Building the baseline of a Notion-like workspace application with:
- Local JSON file storage (single user)
- Sidebar with recursive page tree
- Block-based page editor (H1 + Paragraph only)
- Drag-and-drop block reordering
- Admin user auto-logged in
- Architecture prepared for future collaboration, plugins, and multi-user support

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + Vite + TypeScript |
| Editor | TipTap (ProseMirror-based) |
| State | Zustand |
| Styling | Tailwind CSS |
| Backend | Node.js + Fastify + TypeScript |
| Storage | Local JSON files |
| Structure | pnpm monorepo + Turborepo |
| E2E Testing | Playwright |

---

## Project Structure

```
nonotion/
├── package.json                 # Root with pnpm workspaces
├── turbo.json                   # Turborepo config
├── tsconfig.base.json           # Shared TS config
├── progress.txt                 # Implementation progress tracking
├── docs/
│   ├── implementation-plan.md   # This plan
│   └── prd.json                 # Product requirements document
├── packages/
│   └── shared/                  # Shared types & utilities
│       └── src/
│           ├── types/           # Page, Block, User, API types
│           ├── schemas/         # Zod validation schemas
│           └── utils/           # ID generation, timestamps
├── apps/
│   ├── api/                     # Fastify backend
│   │   └── src/
│   │       ├── routes/          # pages.ts, blocks.ts
│   │       ├── services/        # Business logic
│   │       └── storage/         # JSON file adapter
│   └── web/                     # React frontend
│       └── src/
│           ├── components/
│           │   ├── layout/      # Sidebar, MainLayout
│           │   ├── page/        # PageView, PageHeader
│           │   └── blocks/      # BlockCanvas, registry/
│           ├── stores/          # Zustand stores
│           ├── api/             # API client
│           └── lib/tiptap/      # Editor config
├── e2e/                         # Playwright tests
│   ├── playwright.config.ts
│   └── tests/
│       ├── pages.spec.ts
│       ├── blocks.spec.ts
│       └── navigation.spec.ts
└── data/                        # Local JSON storage
    ├── pages/                   # {pageId}.json
    ├── blocks/                  # {pageId}.json
    └── metadata.json
```

---

## Data Models

### Page
```typescript
interface Page {
  id: string;                    // "pg_xxxxx"
  title: string;
  parentId: string | null;       // null = root page
  childIds: string[];            // Ordered children
  icon: string | null;           // Emoji
  isStarred: boolean;
  createdAt: string;             // ISO 8601
  updatedAt: string;
  version: number;               // For LWW sync
}
```

### Block
```typescript
interface Block {
  id: string;                    // "blk_xxxxx"
  type: 'heading' | 'paragraph';
  pageId: string;
  order: number;                 // Position in page
  content: {
    text: string;
    level?: 1;                   // For heading
  };
  version: number;               // For LWW sync
}
```

---

## API Endpoints

### Pages
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pages` | List all pages |
| GET | `/api/pages/:id` | Get page with metadata |
| POST | `/api/pages` | Create page |
| PATCH | `/api/pages/:id` | Update page |
| DELETE | `/api/pages/:id` | Delete page + children |

### Blocks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pages/:pageId/blocks` | Get blocks for page |
| POST | `/api/pages/:pageId/blocks` | Create block |
| PATCH | `/api/blocks/:id` | Update block content |
| DELETE | `/api/blocks/:id` | Delete block |
| PATCH | `/api/pages/:pageId/blocks/reorder` | Reorder blocks |

---

## Frontend Architecture

### Component Hierarchy
```
App
└── MainLayout
    ├── Sidebar
    │   ├── StarredSection
    │   ├── PageTree (recursive)
    │   │   └── PageTreeItem
    │   └── NewPageButton
    └── PageView
        ├── PageBreadcrumb
        ├── PageHeader (editable title + icon)
        └── BlockCanvas
            └── BlockWrapper (per block)
                ├── BlockDragHandle
                └── HeadingEdit / ParagraphEdit
```

### Zustand Stores
- **pageStore**: Pages map, current page, expanded nodes, CRUD actions
- **blockStore**: Blocks by page, selected block, drag state, CRUD actions
- **uiStore**: Sidebar state, theme (future)

### Block Registry Pattern
Each block type is a plugin with:
- `EditComponent` - TipTap-based editor
- `RenderComponent` - Read-only view
- `defaultContent` - Initial state
- `icon` and `label` - For future slash command menu

---

## TipTap Integration

Using individual TipTap micro-editors per block:
- Clean block boundaries for drag-and-drop
- Isolated state simplifies implementation
- Easy extension for future collaboration

Phase 1 config:
- StarterKit with most features disabled
- Only basic text input
- Placeholder extension
- 500ms debounced auto-save

---

## Storage Implementation

**JsonFileStorage** class implementing **StorageAdapter** interface:
- In-memory cache for fast reads
- Atomic writes with temp file + rename
- Write locks to prevent corruption
- Blocks grouped by page for efficiency

Future: Swap to SupabaseStorage without changing API layer.

---

## Future Extensibility Built-In

1. **Plugin System**: Block registry pattern allows adding new block types
2. **LWW Sync**: All entities have `version` and `updatedAt` for conflict resolution
3. **Storage Abstraction**: Adapter pattern for JSON/Supabase backends
4. **User System**: Types defined, admin auto-login as placeholder
5. **API Versioning**: `/api/v1/` prefix structure

---

## Implementation Order

### 1. Project Setup
- Initialize monorepo with pnpm + Turborepo
- Configure TypeScript, ESLint, Prettier
- Set up shared types package

### 2. Backend Foundation
- Fastify server with CORS
- JSON storage adapter with caching
- Page CRUD endpoints
- Block CRUD endpoints

### 3. Frontend Foundation
- Vite + React + Tailwind setup
- API client (fetch wrapper)
- Zustand stores (page, block, UI)

### 4. Sidebar & Navigation
- MainLayout with sidebar
- PageTree with recursive rendering
- Page expand/collapse
- Starred section
- New page creation

### 5. Page View
- PageView component
- Editable PageHeader (title + icon)
- Breadcrumb navigation

### 6. Block System
- Block registry with plugin interface
- HeadingEdit block (TipTap)
- ParagraphEdit block (TipTap)
- BlockCanvas rendering
- Block CRUD with auto-save

### 7. Drag & Drop
- @dnd-kit/core integration
- BlockDragHandle component
- Block reordering API

### 8. E2E Testing (Playwright)
- Setup Playwright with MCP integration
- Page management tests
- Block editing tests
- Navigation tests

### 9. Polish
- Loading states
- Error handling
- Empty states
- Keyboard navigation basics

---

## Critical Files

| File | Purpose |
|------|---------|
| `packages/shared/src/types/block.ts` | Core block types driving the plugin system |
| `apps/api/src/storage/json-storage.ts` | Storage adapter with caching and atomic writes |
| `apps/web/src/components/blocks/registry/index.ts` | Block plugin registry |
| `apps/web/src/stores/blockStore.ts` | Block state with optimistic updates |
| `apps/web/src/components/blocks/BlockCanvas.tsx` | Main editing surface |

---

## Verification Plan

### Backend API Testing
Test with curl/Postman:
- Create/read/update/delete pages
- Create/read/update/delete blocks
- Verify JSON files are written correctly

### Frontend Integration Testing
Manual verification:
- Sidebar shows page tree
- Can create/delete pages
- Can navigate between pages

### Block Editing Testing
Manual verification:
- Can add H1 and paragraph blocks
- Content saves automatically (debounced)
- Can delete blocks

### Drag & Drop Testing
Manual verification:
- Can reorder blocks
- Order persists after refresh

### E2E Testing with Playwright MCP

**Page Management Tests** (`e2e/tests/pages.spec.ts`):
```typescript
- test('can create a new page')
- test('can rename a page')
- test('can delete a page')
- test('can create a sub-page')
- test('can star/unstar a page')
```

**Block Editing Tests** (`e2e/tests/blocks.spec.ts`):
```typescript
- test('can add a heading block')
- test('can add a paragraph block')
- test('can edit block content')
- test('can delete a block')
- test('block content persists after refresh')
```

**Drag & Drop Tests** (`e2e/tests/navigation.spec.ts`):
```typescript
- test('can reorder blocks via drag and drop')
- test('block order persists after refresh')
- test('can navigate between pages')
- test('breadcrumb navigation works')
```

### Full E2E Flow Test
Automated with Playwright:
1. Create a page
2. Add heading + paragraphs
3. Reorder blocks
4. Refresh - verify all content persists
5. Create sub-page, verify tree structure
6. Navigate via sidebar and breadcrumbs
