# PostgreSQL Storage Implementation

This document describes the PostgreSQL storage backend implementation for Nonotion.

## Overview

Nonotion supports two storage backends:
1. **sqlite** (default): SQLite for data
2. **postgres**: PostgreSQL for all data (pages, blocks, users, permissions)

The storage backend is selected via the `STORAGE_TYPE` environment variable.

## Architecture

### Storage Adapter Pattern

Both storage backends implement the same interfaces:
- `StorageAdapter` - Pages and blocks operations
- `UserStorageAdapter` - Users and permissions operations

The `PostgresStorage` class implements both interfaces, providing a unified storage layer.

### Storage Factory

The `storage-factory.ts` module provides:
- `initializeStorage(config)` - Initialize the storage backend
- `getStorage()` - Get the StorageAdapter instance
- `getUserStorage()` - Get the UserStorageAdapter instance
- `getStorageType()` - Get the current storage type

## Configuration

### Environment Variables

```bash
# Storage backend type
STORAGE_TYPE=json-sqlite  # or 'postgres'

# PostgreSQL connection URL (required when STORAGE_TYPE=postgres)
DATABASE_URL=postgresql://user:password@host:5432/database
```

### Docker Compose

Two docker-compose files are provided:
- `docker-compose.yml` - Default configuration (json-sqlite storage)
- `docker-compose.postgres.yml` - PostgreSQL configuration

## Database Schema

### PostgreSQL Tables

| Table | Description |
|-------|-------------|
| `users` | User accounts with authentication data |
| `pages` | Document and database pages |
| `blocks` | Content blocks within pages |
| `permissions` | Page access permissions |

### Key Design Decisions

1. **JSONB columns** for flexible data:
   - `pages.database_schema` - Database page configuration
   - `pages.properties` - Database row property values
   - `blocks.content` - Block content (varies by type)

2. **TEXT[] array** for `pages.child_ids` - Ordered list of child page IDs

3. **Timestamps with timezone** (`TIMESTAMPTZ`) for all date fields

4. **Indexes** on frequently queried columns:
   - `idx_pages_owner_id`, `idx_pages_parent_id`, `idx_pages_type`
   - `idx_blocks_page_id`, `idx_blocks_page_order`
   - `idx_permissions_user_id`

## Migration

### From JSON/SQLite to PostgreSQL

Use the migration script to transfer existing data:

```bash
DATABASE_URL=postgresql://... pnpm --filter @nonotion/api migrate:to-postgres
```

The script:
1. Reads all data from JSON files and SQLite
2. Writes to PostgreSQL
3. Preserves original data (manual cleanup required)

### Drizzle Migrations

Generate and apply PostgreSQL migrations:

```bash
# Generate migrations from schema changes
pnpm --filter @nonotion/api db:generate:pg

# Apply migrations
pnpm --filter @nonotion/api db:migrate:pg

# Open Drizzle Studio for debugging
pnpm --filter @nonotion/api db:studio:pg
```

## Local Development with PostgreSQL

### Using Docker Compose

```bash
# Start PostgreSQL and services
docker-compose -f docker-compose.postgres.yml up -d

# View logs
docker-compose -f docker-compose.postgres.yml logs -f

# Stop services
docker-compose -f docker-compose.postgres.yml down
```

### Without Docker

1. Start a PostgreSQL instance
2. Set environment variables:
   ```bash
   export STORAGE_TYPE=postgres
   export DATABASE_URL=postgresql://nonotion:nonotion@localhost:5432/nonotion
   ```
3. Run migrations: `pnpm --filter @nonotion/api db:migrate:pg`
4. Start the API: `pnpm --filter @nonotion/api dev`

## Supabase Compatibility

The PostgreSQL storage is compatible with Supabase. Use your Supabase connection string:

```bash
DATABASE_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
```

## Files

| File | Purpose |
|------|---------|
| `apps/api/src/db/pg-schema.ts` | PostgreSQL Drizzle schema |
| `apps/api/src/db/migrate-pg.ts` | Migration runner |
| `apps/api/src/storage/postgres-storage.ts` | PostgresStorage class |
| `apps/api/src/storage/storage-factory.ts` | Storage backend selection |
| `apps/api/drizzle.pg.config.ts` | Drizzle Kit configuration |
| `apps/api/drizzle-pg/` | PostgreSQL migrations |
| `docker-compose.postgres.yml` | Docker configuration |

## Verification

After implementation, verify:

1. **Default mode (json-sqlite)**:
   ```bash
   pnpm dev  # Should work normally
   ```

2. **PostgreSQL mode**:
   ```bash
   # Start PostgreSQL
   docker-compose -f docker-compose.postgres.yml up -d postgres

   # Run with PostgreSQL
   STORAGE_TYPE=postgres DATABASE_URL=postgresql://nonotion:nonotion@localhost:5432/nonotion pnpm --filter @nonotion/api dev
   ```

3. **Health check**:
   ```bash
   curl http://localhost:3001/health
   # Should return: {"status":"ok","storageType":"postgres"}
   ```
