# Simple Export

Download a database as a **self-contained markdown ZIP**: every row-page as a
`.md` file, an `index.md` for quick Ctrl+F search, and all referenced images and
file attachments embedded in the archive. The export contains **no entity IDs**
anywhere — not in filenames, not inside pages. References become archive-relative
paths (when the target is inside the export) or plain-text names.

## Enabling / disabling

Enabled by **default** — unlike other feature flags. Disable with:

```bash
SIMPLE_EXPORT_ENABLED=false
```

When disabled, the export route is never registered (a direct request returns
404) and the toolbar button is hidden (via `GET /api/auth/config` →
`simpleExportEnabled`). Not available in demo mode.

## Using it

Any user with **read** access to a database sees an **Export** button in the
database toolbar (full-screen and embedded views). Clicking it downloads
`<database-title>-export-<YYYY-MM-DD>.zip`.

## Archive layout

```
my_database-export-2026-08-24.zip
├── index.md               # - [Title](pages/title_2026-01-05.md) — 2026-01-05 — tags: In Progress, urgent
└── pages/                 # single folder: page markdown AND file/image assets
    ├── title_2026-01-05.md
    ├── title_1_2026-01-05.md   # duplicate titles get a number before the date
    └── photo.png               # assets keep their original (sanitized) filename
```

- **index.md** lists every page with a relative link, its creation date, and its
  "tags" (all `select` and `multi_select` option names) — nothing else, so the
  file stays grep-friendly.
- **Page files** contain the title as an `# H1`, the page's properties as
  `**Name:** value` lines (empty values omitted, `Created` date included), a
  `---` divider, and the block content rendered as markdown.
- Filenames are sanitized (no path separators, no characters illegal on
  Windows/macOS, whitespace → `_`, unicode letters kept, ~80-char cap) and
  deduplicated case-insensitively across pages **and** assets.

## Reference / link handling

| Source | Target inside the export | Target outside the export |
| --- | --- | --- |
| Reference property | `[Title](title_2026-01-05.md)` | plain-text title |
| Page link block / @-mention | same | plain-text title |
| Image block | `![alt](photo.png)` | external URLs pass through |
| File block | `[report.pdf](report.pdf)` | — |
| Pasted internal link (`/page/pg_x`, `/api/files/file_x`) | rewritten like the above | plain text |

- Reference properties the viewer **cannot read** (the UI's `#ref` redaction)
  are **omitted entirely** — no ids leak.
- Missing/deleted images render as `*[image unavailable]*`; file attachments
  whose bytes can't be loaded (feature disabled, upload never completed,
  storage missing) render as the plain filename. A broken file never fails the
  export.
- Embedded database views render as `[Embedded database: Title]` (not
  traversed).

## Permissions & limits

- Server enforces `canRead` on the database (404 otherwise, matching the
  anti-enumeration convention).
- The route uses the **import rate-limit tier** (default 3 req/min) — the export
  is built fully in memory (ZIP + all file bytes), consistent with the Notion
  import path. Very large databases with many big attachments will use
  correspondingly large memory per request.
