# MCP Server — Connect Claude to Nonotion

Nonotion ships a built-in **read-only MCP (Model Context Protocol) server** that lets Claude (claude.ai web, Claude Desktop, Claude Code) query your databases, read page content, follow references between databases, search, and fetch embedded images.

- **Transport**: Streamable HTTP at `POST {API}/mcp`, stateless (serverless-safe)
- **Auth**: OAuth 2.1 (claude.ai / Claude Desktop / Claude Code) **or** personal access tokens (Claude Code, scripts)
- **Access model**: per-user, per-database opt-in on top of normal page permissions
- **Write operations**: none — the server exposes read-only tools

## 1. Enabling the server

Set on the API:

```bash
MCP_ENABLED=true
MCP_PUBLIC_URL=https://api.your-domain.com   # public URL of the API (required in production)
FRONTEND_URL=https://app.your-domain.com     # web app URL (consent screen); defaults to first CORS_ORIGINS entry
```

Optional tuning: `MCP_ACCESS_TOKEN_TTL_MINUTES` (60), `MCP_REFRESH_TOKEN_TTL_DAYS` (30), `MCP_AUTH_CODE_TTL_MINUTES` (10), `RATE_LIMIT_MCP_MAX`/`RATE_LIMIT_MCP_WINDOW_MINUTES` (60/1min).

When `MCP_ENABLED` is not `true`, no MCP routes are registered and all MCP UI is hidden — zero overhead.

## 2. Choosing what Claude can see

MCP access is **per user and per database**, and always additive to normal permissions — you can only expose databases you can read, and revoked shares immediately disappear from MCP too.

- **Enable a database**: open the database → toolbar → **MCP** button → toggle *Available to Claude via MCP*.
  - *Allow image access* — additionally lets clients fetch images embedded in pages (base level is page text + properties only).
  - *Allow file access* — reserved; uploads are currently images-only.
- **Overview / revocation**: user menu → **Account settings** → *Claude / MCP access* lists your tokens and every MCP-enabled database.

### References between databases

If a database has a `reference` property pointing at another database:

- Both databases MCP-enabled → Claude sees referenced names + ids and can traverse into them with `get_page`.
- Only the parent enabled (but you can read the target) → Claude still sees names + ids, clearly marked *"referenced database is not enabled for MCP — get_page on these ids will fail"*, so the agent knows the pages exist but are off-limits.
- Target not readable by you at all → the property is redacted entirely (no names).

## 3. Connecting from Claude

### claude.ai (web) — custom connector

1. **Settings → Connectors → Add custom connector** (requires a plan with custom connectors).
2. URL: `https://api.your-domain.com/mcp`
3. Claude discovers the OAuth endpoints automatically, opens the Nonotion login (if needed) and the consent screen. Approve to connect.

The API must be reachable over public HTTPS and `MCP_PUBLIC_URL` must exactly match the URL you enter (it is the OAuth issuer and token audience).

### Claude Desktop — custom connector

**Settings → Connectors → Add custom connector**, same URL and OAuth flow as claude.ai.

### Claude Code

Option A — OAuth (same flow as above):

```bash
claude mcp add --transport http nonotion https://api.your-domain.com/mcp
# then inside Claude Code: /mcp → Authenticate
```

Option B — personal access token (no browser needed, works for scripts/CI):

1. Account settings → *Claude / MCP access* → **Create token** (copy it — shown once, format `nmcp_…`).
2. ```bash
   claude mcp add --transport http nonotion https://api.your-domain.com/mcp \
     --header "Authorization: Bearer nmcp_..."
   ```

Revoking the token in Account settings kills access immediately.

### MCP Inspector (debugging)

```bash
npx @modelcontextprotocol/inspector
```

Point it at `{API}/mcp`; both the OAuth flow and a pasted `Bearer nmcp_…` header work.

## 4. Tools exposed

| Tool | Purpose |
|------|---------|
| `list_databases` | Discover MCP-enabled databases: ids, row counts, full property schema (select options, reference targets + their MCP accessibility), image allowance. |
| `query_database` | Fetch rows with filters/sort/pagination. Accepts property **names** and option **names** (mapped server-side). Operators: `eq, neq, contains, empty, not_empty, gte, lte, in, all, any`. Returns humanized values and reference items with `accessible`/`mcpAccessible` flags. |
| `get_page` | Full page as markdown: properties, body (headings, lists, code, links), embedded image references, child pages. Works for rows, referenced pages, and sub-pages. |
| `search` | Full-text search across titles, content, and properties — scoped to MCP-enabled databases. |
| `get_image` | Fetch an embedded image (`pageId` + `fileId` from `get_page`) as an image block. Requires *Allow image access*; capped at 4 MB; SVG excluded. |

Typical agent flow: `list_databases` → `query_database` (filter e.g. `Status = "In Progress"`) → `get_page` on interesting rows → follow reference ids with further `get_page` calls → `get_image` for embedded diagrams.

## 5. Security model

- **Token separation**: MCP OAuth tokens (JWT with `aud: nonotion-mcp`) are rejected by the app API, and app session tokens are rejected by `/mcp`. PATs (`nmcp_…`, SHA-256 at rest, shown once) are accepted only by `/mcp`.
- **Fresh authorization on every call**: the user row (existence, approval) is re-fetched per request; every tool call re-checks `canRead` **and** the MCP enablement of the page's database — revoking either takes effect immediately.
- **OAuth hardening**: PKCE S256 only, exact-match redirect URIs (https or localhost), single-use authorization codes (atomic consume, 10-min TTL, hashed at rest), refresh-token rotation with reuse detection (presenting a rotated-out token revokes the whole successor chain).
- **Scope**: single read-only scope `mcp:read`. No write tools exist.
- **Images**: fetching a file requires that an image block on the (readable, MCP-enabled) page references that exact file id — file ids alone grant nothing.

## 6. Endpoints reference

| Endpoint | Purpose |
|----------|---------|
| `POST /mcp` | MCP Streamable HTTP endpoint (JSON-RPC) |
| `GET /.well-known/oauth-protected-resource[/mcp]` | RFC 9728 resource metadata (starts OAuth discovery) |
| `GET /.well-known/oauth-authorization-server` | RFC 8414 authorization server metadata |
| `POST /mcp/oauth/register` | RFC 7591 dynamic client registration |
| `GET /mcp/oauth/authorize` | Authorization endpoint → redirects to the web app consent screen |
| `POST /mcp/oauth/token` | Token endpoint (`authorization_code`, `refresh_token`; form-encoded) |
| `GET/PUT/DELETE /api/mcp/access[/:databaseId]` | Per-database MCP settings (session auth) |
| `GET/POST/DELETE /api/mcp/tokens[/:id]` | PAT management (session auth) |
| `POST /api/mcp/oauth/consent` | Consent approval → issues the authorization code (session auth) |

Note that `/mcp*` and `/.well-known/*` are **root-level** routes (not under `/api`) — reverse proxies must forward them to the API.

## 7. Local development quick test

```bash
MCP_ENABLED=true pnpm --filter @nonotion/api dev
# create a PAT in Account settings, then:
curl -s http://localhost:3001/mcp \
  -H "Authorization: Bearer nmcp_..." \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_databases","arguments":{}}}'
```

claude.ai / Claude Desktop connectors require a deployed HTTPS instance; local verification is limited to curl, MCP Inspector, and Claude Code.
