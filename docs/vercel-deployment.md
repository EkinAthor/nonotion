# Nonotion Vercel Deployment Guide

This guide covers deploying the Nonotion monorepo to Vercel, connecting it to an existing Supabase PostgreSQL database.

## Prerequisites

1.  **Vercel Account**: Sign up at [vercel.com](https://vercel.com).
2.  **Supabase Project**: An active Supabase project with a PostgreSQL database.
3.  **Vercel CLI (Optional)**: Useful for local testing and manual deployments.

---

## 1. Supabase Preparation

Ensure your Supabase database is ready:
1.  Go to your Supabase Project Settings > Database.
2.  Navigate to the **Connection** menu and select connection method "transaction pooler" (Vercel cannot resolve direct IPv6 from Supabase).
3.  Copy the **Connection string** (URI). It should look like:
    `postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-us-west-2.pooler.supabase.com:6543/postgres`

---

## 2. Deploying the API (apps/api)

The API is a Fastify application that will run as a Vercel Serverless Function.

1.  **Create a New Project** in Vercel.
2.  **Connect your Repository**.
3.  **Project Settings**:
    *   **Project Name**: `your-nonotion-project-api`
    *   **Framework Preset**: `Other`
    *   **Root Directory**: `apps/api`
    *   **Build Command**: `pnpm --filter @nonotion/api... build`
    *   **Output Directory**: _(leave empty)_ — the API is a serverless function, not a static site
    *   **Install Command**: `pnpm install`
4.  **Routing Configuration**:
    The repo includes `apps/api/vercel.json` and `apps/api/api/index.ts` which together route all requests to the Fastify serverless handler. No changes needed — just ensure these files are present.
5.  **Environment Variables**:
    Add the following variables in the API project settings:
    *   `STORAGE_TYPE`: `postgres`
    *   `DATABASE_URL`: Your Supabase connection string.
    *   `JWT_SECRET`: A secure random string (32+ characters). **Required** — the API will refuse to start without it.
    *   `CORS_ORIGINS`: The URL of your Web deployment (e.g., `https://your-nonotion-project-web.vercel.app`).
    *   `ADMIN_EMAIL`: Your initial admin email.
    *   `RESEND_API_KEY` + `EMAIL_FROM`: Required only if you use email two-factor authentication (see the Resend note below).
    *   `MCP_ENABLED` + `MCP_PUBLIC_URL` + `FRONTEND_URL`: Required only if you enable the MCP server (see the MCP note below).

> [!NOTE]
> Vercel sets `NODE_ENV=production` automatically for all deployments. The API requires `JWT_SECRET` in production and will throw a startup error if it is missing.

> [!NOTE]
> **Email 2FA (Resend).** The email two-factor auth feature sends codes via [Resend](https://resend.com), a native Vercel Marketplace integration. Install it from **Vercel → Marketplace → Resend** to auto-provision `RESEND_API_KEY` into your project, then set `EMAIL_FROM` to a Resend-verified sender address. Both are required for 2FA to work; without them, login for any 2FA-enabled account will fail at the code-sending step.

> [!NOTE]
> The API automatically runs Drizzle migrations on startup when `STORAGE_TYPE=postgres` is set.

> [!NOTE]
> **Rate Limiting:** The built-in rate limiting is automatically disabled on Vercel because it uses an in-memory store that doesn't persist between serverless invocations. For production rate limiting on Vercel, configure [Vercel Firewall / WAF rules](https://vercel.com/docs/security/firewall) to set IP-based rate limits at the edge.

> [!NOTE]
> **MCP Server (Claude integration).** To enable the read-only MCP server (see `docs/mcp.md`), set on the API project:
> *   `MCP_ENABLED`: `true`
> *   `MCP_PUBLIC_URL`: The public URL of the **API** deployment (e.g., `https://your-nonotion-project-api.vercel.app`) with no trailing slash. This is the OAuth issuer and token audience — claude.ai will refuse to connect if it doesn't match the URL you enter as the connector.
> *   `FRONTEND_URL`: The URL of the **Web** deployment (used for the OAuth consent screen redirect).
>
> Details that matter on Vercel:
> *   The MCP endpoints live at the **root** of the API (`/mcp`, `/mcp/oauth/*`, `/.well-known/oauth-*`), not under `/api`. The existing `apps/api/vercel.json` rewrite (`/(.*)` → serverless handler) already covers them — if you customize routing or put a proxy/CDN in front, make sure these root paths reach the API function.
> *   All OAuth state (clients, codes, refresh tokens) is stored in Postgres, so the stateless serverless model works out of the box. The MCP transport runs in JSON-response mode (no SSE).
> *   Because in-app rate limiting is disabled on Vercel, add Vercel Firewall rules for `/mcp` and `/mcp/oauth/*` (the token and registration endpoints are unauthenticated by design and should be rate-limited at the edge).
> *   Long tool calls (large `query_database` responses, `get_image`) must fit within your Vercel function timeout.

---

## 3. Deploying the Web Client (apps/web)

The Web client is a Vite/React SPA.

1.  **Create another New Project** in Vercel.
2.  **Connect your Repository**.
3.  **Project Settings**:
    *   **Project Name**: `your-nonotion-project-web`
    *   **Framework Preset**: `Other` — do **not** use the "Vite" preset, as it overrides the SPA rewrite rules in `vercel.json`
    *   **Root Directory**: `apps/web`
    *   **Build Command**: `pnpm --filter @nonotion/web... build`
    *   **Output Directory**: `dist`
4.  **SPA Routing**:
    The repo includes `apps/web/vercel.json` with a rewrite rule that sends all paths to `index.html`, allowing React Router to handle client-side routing.
5.  **Environment Variables**:
    *   `VITE_API_URL`: The URL of your API deployment (e.g., `https://your-nonotion-project-api.vercel.app/api`). Note: the `/api` suffix is required because all routes are registered under `/api/`.

---

## 4. Troubleshooting

*   **Build Failures (Missing Shared Package)**: Ensure you are using the `pnpm --filter ...` command. Vercel automatically detects the monorepo root and includes necessary workspace files even when the **Root Directory** is set to a subfolder.
*   **Output Directory**: The API project's Output Directory should be left **empty** (it runs as a serverless function). Only the Web project should use `dist` as its Output Directory.
*   **CORS Errors**: Verify `CORS_ORIGINS` is set on the API project to your Web deployment URL (without a trailing slash). Check that the API function is actually running by hitting the `/health` endpoint.

---

## 5. Updates & Migrations

Whenever you push changes:
1.  Vercel will automatically redeploy.
2.  Schema changes are applied automatically by the API server on boot.
