// ─── Config types ───────────────────────────────────────────────────────────

export interface McpConfig {
  enabled: boolean;
  /** Public base URL of this API — OAuth issuer + resource base (no trailing slash). */
  publicUrl: string;
  /** Frontend base URL for the OAuth consent redirect (no trailing slash). */
  frontendUrl: string;
  accessTokenTtlMinutes: number;
  refreshTokenTtlDays: number;
  authCodeTtlMinutes: number;
}

// ─── Loader ─────────────────────────────────────────────────────────────────

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function isMcpEnabled(): boolean {
  return process.env.MCP_ENABLED === 'true';
}

export function loadMcpConfig(): McpConfig {
  const enabled = isMcpEnabled();

  const publicUrl = stripTrailingSlash(process.env.MCP_PUBLIC_URL ?? 'http://localhost:3001');
  if (enabled && process.env.NODE_ENV === 'production' && !process.env.MCP_PUBLIC_URL) {
    throw new Error('MCP_PUBLIC_URL is required in production when MCP_ENABLED=true');
  }

  // Default the consent-screen URL to the first CORS origin (the web app).
  const firstCorsOrigin = process.env.CORS_ORIGINS?.split(',')[0]?.trim();
  const frontendUrl = stripTrailingSlash(
    process.env.FRONTEND_URL ?? firstCorsOrigin ?? 'http://localhost:5173'
  );

  return {
    enabled,
    publicUrl,
    frontendUrl,
    accessTokenTtlMinutes: envInt('MCP_ACCESS_TOKEN_TTL_MINUTES', 60),
    refreshTokenTtlDays: envInt('MCP_REFRESH_TOKEN_TTL_DAYS', 30),
    authCodeTtlMinutes: envInt('MCP_AUTH_CODE_TTL_MINUTES', 10),
  };
}
