// MCP (Model Context Protocol) server types.
// Per-user, per-database access grants + personal access tokens + OAuth entities.

/** Per-user grant exposing one database via MCP. Page text is the base level. */
export interface McpDatabaseAccess {
  userId: string;
  databaseId: string;
  enabled: boolean;
  allowImages: boolean;
  /** Reserved: raw file/attachment downloads once non-image uploads exist. */
  allowFiles: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SetMcpAccessInput {
  enabled: boolean;
  allowImages?: boolean;
  allowFiles?: boolean;
}

/** PAT metadata safe to show in the UI (never includes the hash or secret). */
export interface McpTokenMeta {
  id: string; // mcpt_xxx
  name: string;
  tokenSuffix: string; // last 4 chars of the secret, for display
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreateMcpTokenInput {
  name: string;
}

export interface CreateMcpTokenResponse {
  /** Full token (nmcp_...). Shown exactly once at creation. */
  token: string;
  meta: McpTokenMeta;
}

// --- Server-side entity rows (stored hashed; kept here for storage adapter typing) ---

export interface McpPersonalAccessToken {
  id: string; // mcpt_xxx
  userId: string;
  name: string;
  tokenHash: string; // sha256 hex of the secret half
  tokenSuffix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface McpOAuthClient {
  id: string; // mcpc_xxx
  name: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: string; // 'none' (public clients + PKCE)
  createdAt: string;
}

export interface McpOAuthCode {
  codeHash: string; // sha256 hex of the authorization code
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  scope: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export interface McpOAuthRefreshToken {
  id: string; // mcprt_xxx
  tokenHash: string; // sha256 hex
  clientId: string;
  userId: string;
  scope: string;
  expiresAt: string;
  revokedAt: string | null;
  rotatedToId: string | null;
  createdAt: string;
}

// --- OAuth consent flow (frontend <-> API) ---

/** Public info about an OAuth client shown on the consent screen. */
export interface McpOAuthClientInfo {
  clientId: string;
  name: string;
  redirectHost: string;
}

export interface McpConsentInput {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state?: string;
  scope?: string;
}

export interface McpConsentResponse {
  /** Full redirect URL (redirect_uri + code + state) the SPA navigates to. */
  redirectUrl: string;
}
