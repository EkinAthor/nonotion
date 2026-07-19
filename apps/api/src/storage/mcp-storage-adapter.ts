import type {
  McpDatabaseAccess,
  McpPersonalAccessToken,
  McpOAuthClient,
  McpOAuthCode,
  McpOAuthRefreshToken,
} from '@nonotion/shared';

/**
 * Storage interface for the MCP server: per-user database access grants,
 * personal access tokens, and OAuth entities. All state is DB-backed so the
 * OAuth flow works on serverless (no in-memory session state).
 */
export interface McpStorageAdapter {
  // Per-database access grants
  getMcpDatabaseAccess(userId: string, databaseId: string): Promise<McpDatabaseAccess | null>;
  listMcpDatabaseAccess(userId: string): Promise<McpDatabaseAccess[]>;
  upsertMcpDatabaseAccess(access: McpDatabaseAccess): Promise<McpDatabaseAccess>;
  deleteMcpDatabaseAccess(userId: string, databaseId: string): Promise<boolean>;

  // Personal access tokens
  createMcpToken(token: McpPersonalAccessToken): Promise<McpPersonalAccessToken>;
  getMcpToken(id: string): Promise<McpPersonalAccessToken | null>;
  listMcpTokens(userId: string): Promise<McpPersonalAccessToken[]>;
  deleteMcpToken(id: string, userId: string): Promise<boolean>;
  touchMcpTokenUsed(id: string, when: string): Promise<void>;

  // OAuth clients (dynamic client registration)
  createOAuthClient(client: McpOAuthClient): Promise<McpOAuthClient>;
  getOAuthClient(id: string): Promise<McpOAuthClient | null>;

  // OAuth authorization codes
  createOAuthCode(code: McpOAuthCode): Promise<void>;
  /**
   * Atomically fetch-and-mark-used a code by hash. Returns null when the code
   * is missing, expired, or already used — this is the single-use guarantee
   * and must be one atomic statement/transaction.
   */
  consumeOAuthCode(codeHash: string, now: string): Promise<McpOAuthCode | null>;

  // OAuth refresh tokens
  createOAuthRefreshToken(token: McpOAuthRefreshToken): Promise<void>;
  getOAuthRefreshTokenByHash(tokenHash: string): Promise<McpOAuthRefreshToken | null>;
  getOAuthRefreshTokenById(id: string): Promise<McpOAuthRefreshToken | null>;
  revokeOAuthRefreshToken(id: string, rotatedToId?: string): Promise<void>;

  /** Opportunistic GC of expired codes and refresh tokens. */
  deleteExpiredOAuthRows(now: string): Promise<void>;
}
