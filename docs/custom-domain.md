# Running Nonotion on a Custom Domain

This guide covers moving an existing Vercel deployment (see [Vercel Deployment Guide](./vercel-deployment.md)) from the default `*.vercel.app` URLs to a custom domain — for example a subdomain of a domain you already own:

- **Web app**: `https://nonotion.example.com`
- **API**: `https://api.nonotion.example.com`

The domain can be registered anywhere (GoDaddy, Namecheap, Cloudflare, …); your registrar stays the DNS host — you only add two CNAME records. No application code changes are needed: every URL the app uses flows through environment variables.

## Prerequisites

1. Both Vercel projects (API + Web) deployed and working per the [Vercel Deployment Guide](./vercel-deployment.md).
2. A domain, with access to its DNS management at the registrar.

---

## 1. Add the Domains in Vercel

1. **Web project** → Settings → **Domains** → Add `nonotion.example.com`.
2. **API project** → Settings → **Domains** → Add `api.nonotion.example.com`.

For each, Vercel will report the domain as misconfigured and show the DNS record to create — for subdomains this is a CNAME to `cname.vercel-dns.com` (use the exact target Vercel displays).

## 2. Create DNS Records at Your Registrar

At your DNS host (GoDaddy example: My Products → your domain → **DNS**), add two CNAME records:

| Type | Name | Value |
|------|------|-------|
| CNAME | `nonotion` | `cname.vercel-dns.com` |
| CNAME | `api.nonotion` | `cname.vercel-dns.com` |

Multi-level subdomains like `api.nonotion` are ordinary CNAME records — the record **Name** is just `api.nonotion`.

Wait until both domains show **Valid Configuration** in Vercel (usually minutes, occasionally longer for DNS propagation). Vercel issues TLS certificates automatically.

## 3. Update API Project Environment Variables

On the **API** project (Settings → Environment Variables, Production):

| Variable | Value | Notes |
|----------|-------|-------|
| `CORS_ORIGINS` | `https://nonotion.example.com,https://your-nonotion-project-web.vercel.app` | Comma-separated, exact match, **no trailing slashes**. Keep the old `*.vercel.app` web origin in the list during (or after) the cutover so the old URL keeps working. |
| `FRONTEND_URL` | `https://nonotion.example.com` | Set explicitly. If unset, the MCP consent redirect silently falls back to the *first* `CORS_ORIGINS` entry. |
| `MCP_PUBLIC_URL` | `https://api.nonotion.example.com` | Only if MCP is enabled. This is the OAuth issuer/audience — see step 7. |

Then **Redeploy** the API project (env changes only take effect on a new deployment).

## 4. Update Web Project Environment Variable and Redeploy

On the **Web** project:

- `VITE_API_URL` = `https://api.nonotion.example.com/api` — the `/api` suffix is required.

Then **Redeploy** the Web project. This is mandatory: `VITE_API_URL` is baked into the JavaScript bundle at **build time**, so changing the variable without redeploying does nothing.

## 5. Google OAuth (if `AUTH_MODES` includes `google`)

In [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → your OAuth 2.0 Client ID → **Authorized JavaScript origins** → add `https://nonotion.example.com`.

The app uses the Google Identity Services ID-token flow, so **Authorized redirect URIs** are not involved — only the JavaScript origin matters. Changes can take a few minutes to propagate on Google's side.

## 6. Email Sender Domain — Resend (optional)

The 2FA emails contain only a numeric code (no links), so nothing in the emails depends on the app domain. The only consideration is the **sending** address:

- If you keep your current Resend-verified `EMAIL_FROM`, nothing changes.
- If you want to send from your custom domain (e.g. `no-reply@example.com`), verify the domain in Resend (Resend → Domains → Add) and add the SPF/DKIM DNS records it gives you at your registrar. Then update `EMAIL_FROM` on the API project and redeploy.

## 7. MCP Server (if `MCP_ENABLED=true`)

`MCP_PUBLIC_URL` is the OAuth **issuer and token audience** for MCP clients. Changing it means every previously connected client is talking to a different issuer:

- **claude.ai custom connectors** must be **removed and re-added** with the new URL: `https://api.nonotion.example.com/mcp`. The URL entered must exactly match `MCP_PUBLIC_URL` + `/mcp`. Users re-approve the consent screen once.
- **Claude Code / Claude Desktop** configs pointing at the old URL must be updated the same way.
- **Personal access tokens (PATs)** are not issuer-bound — they keep working unchanged (just point the client at the new URL).

Also confirm **Deployment Protection stays disabled** on the API project — a protection challenge returns a 401 without CORS headers, which browsers report as a CORS error.

## 8. Cutover Caveats

- **All users are signed out once.** Auth tokens live in `localStorage`, which is per-origin — the new domain starts empty. Local view configs, recent-page lists, and demo-mode data reset the same way. Server-side data is untouched.
- **The old web `*.vercel.app` URL** keeps working only while its origin remains in `CORS_ORIGINS`. Once you remove it, visits to the old URL will fail with CORS errors — remove it only when you're done with the transition (or keep it permanently).
- **The old API `*.vercel.app` URL keeps working** regardless (Vercel serves both domains), so previously built web deployments don't break mid-cutover.
- Supabase (Postgres, Realtime, Storage) needs **no reconfiguration** — the browser reaches Supabase directly via URLs delivered at runtime, and Supabase does not origin-allowlist these requests.

## 9. Verification Checklist

1. `curl https://api.nonotion.example.com/health` → 200.
2. Open `https://nonotion.example.com` → login page loads; DevTools Network tab shows API calls going to the new API domain with no CORS errors.
3. Log in with email/password; if 2FA is enabled, the code email arrives.
4. Google Sign-In button renders and logs in.
5. Real-time: open the same page in two browser windows → presence avatars appear.
6. File attachments (if `FILE_STORAGE_BACKEND=supabase`): upload a file on a page.
7. MCP: `https://api.nonotion.example.com/.well-known/oauth-protected-resource` returns metadata referencing the new domain; the re-added claude.ai connector completes OAuth and `list_databases` works.
8. The old web URL still works (while its origin is kept in `CORS_ORIGINS`).
