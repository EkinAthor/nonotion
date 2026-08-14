# File Attachments

Optional feature: upload files to pages via a `file` block that renders a chip with
Open / Download actions. Disabled by default; enable with `FILE_ATTACHMENTS_ENABLED=true`.

## Backends

Attachment **metadata always lives in the app database** (`files` table). Only the bytes
move between backends, selected with `FILE_STORAGE_BACKEND`:

| | `db` (default) | `supabase` |
|---|---|---|
| Bytes | BLOB in the `files` row | Private Supabase Storage bucket |
| Upload path | multipart through the API | browser PUTs directly to Supabase via signed upload URL |
| Download path | tokenized API URL (short-lived JWT) | Supabase signed URL |
| Encryption | inherit from DB hosting | AES-256 at rest (always on, Supabase-managed) |
| Vercel | uploads capped at ~4.5MB (function body limit) | no size issue (bytes bypass the function) |

Rows record their own `storage_backend`, so switching backends later keeps existing
files served from where they live.

## Supabase setup

1. In your Supabase project: **Storage → New bucket** → name it `nonotion-files`
   (or whatever `FILE_BUCKET` is set to), **public OFF**.
2. Optionally set a bucket-level file size limit matching `FILE_MAX_SIZE_MB`
   (defense-in-depth — the app also verifies size at confirm time).
3. Reuse the existing `SUPABASE_URL` and `SUPABASE_SECRET_KEY` env vars (same ones
   Realtime uses; Realtime does not need to be enabled).
4. Set `FILE_STORAGE_BACKEND=supabase`.

Encryption at rest is automatic (AES-256, provider-managed). Backups: the bucket is
reachable over Supabase's S3-compatible API, so any S3 tooling (rclone, aws-cli)
can mirror it; DB backups already cover metadata (and bytes on the `db` backend).

## Upload / download flows

**Supabase**: `POST /api/files/attachments/initiate` (validates extension + size,
requires edit permission on the page, creates a `pending` row, returns a signed
upload URL) → browser `PUT`s the raw file → `POST /api/files/attachments/:id/confirm`
(verifies the object exists and its real size; over-limit uploads are deleted).

**db**: initiate returns `mode: "direct"` → browser POSTs multipart to
`POST /api/files/attachments/:id/content` (terminal, no confirm).

**Download** (both): `GET /api/files/:id/download-url?disposition=attachment|inline`
permission-checks (`canRead` on the linked page) and returns a short-lived URL —
either a Supabase signed URL or `GET /api/files/:id/download?token=...` (JWT-authorized
public route with proper `Content-Disposition`, `nosniff`, `no-store`). `inline` is
only honored for safe MIME types (pdf, plain text, non-SVG images); everything else
downloads.

## Lifecycle / cleanup

- Deleting a file block marks the attachment `detached_at` (undo within 24h keeps
  the file alive — re-creating the block clears the mark).
- Deleting a page hard-deletes its attachments (blob + row) immediately.
- An opportunistic GC sweep (triggered on initiate) removes `pending` rows and
  detached rows older than 24h.

## Security notes

- Extensions are allowlisted (`FILE_ALLOWED_EXTENSIONS`); `html`, `svg`, `js` and
  friends are rejected unconditionally (stored-XSS on the API origin).
- Downloads of attachments are authorized per-file via the linked page's permissions.
  (Legacy embedded-image rows predate the page linkage and keep their original
  any-authenticated-user behavior.)
- Download tokens are single-purpose JWTs (`aud: file-download`) — they are rejected
  by the application API's auth middleware.

## MCP

The per-database **Allow file access** toggle (MCP popover on the database toolbar)
gates the `get_file` tool. `get_page` renders file blocks as `[name](file: file_x)`
when allowed, or an omission notice otherwise. `get_file` re-checks scope, grant,
page permission, and that the page actually references the file; files over 4MB are
refused (message-size limits). Text-like files return as text, everything else as a
base64 resource.

## Turning the feature off

Existing file blocks still render, but download URLs can no longer be issued —
chips show "File unavailable". Attachment rows are kept; re-enabling restores access.

## Appendix: Google Drive as a storage backend (investigated, not implemented)

- Service accounts have a **0-byte storage quota** (since June 2023) — uploading to a
  service account's own Drive fails with `storageQuotaExceeded`.
- Viable patterns, if ever revisited:
  1. **Workspace shared drive + service account** — requires a paid Google Workspace
     org; storage comes from the org pool.
  2. **Admin-connected OAuth storage account** — a dedicated Google account connected
     via OAuth (`drive.file` scope), refresh token stored server-side; all transfers
     proxied through the API. Re-introduces the ~4.5MB Vercel cap, hinges on one
     revocable refresh token, and is subject to per-user API quotas.
- Compared to Supabase Storage (already in the stack, encrypted, signed URLs, S3
  backup surface), Drive adds fragility without capability — not pursued.
