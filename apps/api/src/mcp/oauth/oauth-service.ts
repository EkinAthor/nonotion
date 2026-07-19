import { createHash, randomBytes } from 'crypto';
import type {
  McpOAuthClient,
  McpOAuthCode,
  McpOAuthRefreshToken,
  McpConsentInput,
} from '@nonotion/shared';
import { generateMcpClientId, generateMcpRefreshTokenId, now } from '@nonotion/shared';
import { getMcpStorage } from '../../storage/storage-factory.js';
import { loadMcpConfig } from '../../config/mcp.js';

export const MCP_SCOPE = 'mcp:read';
const REFRESH_TOKEN_PREFIX = 'nmcr_';

export class OAuthError extends Error {
  constructor(
    /** RFC 6749 error code, e.g. invalid_request, invalid_grant, invalid_client */
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'OAuthError';
  }
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function base64UrlSha256(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

// ─── Dynamic client registration (RFC 7591) ─────────────────────────────────

export interface RegisterClientInput {
  redirect_uris?: unknown;
  client_name?: unknown;
}

export function validateRedirectUri(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.protocol === 'https:') return true;
  // Loopback redirect URIs are allowed over http (Claude Code / Desktop callbacks).
  return (
    parsed.protocol === 'http:' &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1')
  );
}

export async function registerClient(input: RegisterClientInput): Promise<McpOAuthClient> {
  const uris = input.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || !uris.every((u) => typeof u === 'string')) {
    throw new OAuthError('invalid_client_metadata', 'redirect_uris must be a non-empty array of strings');
  }
  for (const uri of uris) {
    if (!validateRedirectUri(uri)) {
      throw new OAuthError(
        'invalid_redirect_uri',
        `redirect_uri must be https or loopback http: ${uri}`
      );
    }
  }
  const name =
    typeof input.client_name === 'string' && input.client_name.trim()
      ? input.client_name.trim().slice(0, 200)
      : 'MCP client';

  const client: McpOAuthClient = {
    id: generateMcpClientId(),
    name,
    redirectUris: uris as string[],
    tokenEndpointAuthMethod: 'none',
    createdAt: now(),
  };
  await getMcpStorage().createOAuthClient(client);
  return client;
}

// ─── Authorization request validation ───────────────────────────────────────

export interface AuthorizeParams {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
  scope?: string;
}

/**
 * Validates client_id + redirect_uri (the "never redirect on failure" part).
 * Throws OAuthError when the request must be answered with a 400 page.
 */
export async function validateClientAndRedirect(
  clientId: string | undefined,
  redirectUri: string | undefined
): Promise<McpOAuthClient> {
  if (!clientId) throw new OAuthError('invalid_request', 'client_id is required');
  const client = await getMcpStorage().getOAuthClient(clientId);
  if (!client) throw new OAuthError('invalid_client', 'Unknown client_id');
  if (!redirectUri) throw new OAuthError('invalid_request', 'redirect_uri is required');
  // Exact string match against registered URIs.
  if (!client.redirectUris.includes(redirectUri)) {
    throw new OAuthError('invalid_request', 'redirect_uri is not registered for this client');
  }
  return client;
}

/**
 * Validates the remaining authorize params (safe to report via redirect).
 * Returns an RFC 6749 error code or null when valid.
 */
export function validateAuthorizeParams(params: AuthorizeParams): string | null {
  if (params.response_type !== 'code') return 'unsupported_response_type';
  if (!params.code_challenge) return 'invalid_request';
  if (params.code_challenge_method !== 'S256') return 'invalid_request';
  if (params.scope && params.scope !== MCP_SCOPE) return 'invalid_scope';
  return null;
}

// ─── Consent → authorization code ───────────────────────────────────────────

export async function issueAuthorizationCode(
  userId: string,
  input: McpConsentInput
): Promise<string> {
  const config = loadMcpConfig();
  const storage = getMcpStorage();

  // Re-validate everything server-side — the consent request comes from the SPA.
  const client = await validateClientAndRedirect(input.clientId, input.redirectUri);
  const paramError = validateAuthorizeParams({
    response_type: 'code',
    client_id: client.id,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    code_challenge_method: input.codeChallengeMethod,
    scope: input.scope,
  });
  if (paramError) throw new OAuthError(paramError, 'Invalid authorization parameters');

  const code = randomBytes(32).toString('base64url');
  const timestamp = now();
  const record: McpOAuthCode = {
    codeHash: sha256Hex(code),
    clientId: client.id,
    userId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: 'S256',
    scope: MCP_SCOPE,
    expiresAt: new Date(Date.now() + config.authCodeTtlMinutes * 60 * 1000).toISOString(),
    usedAt: null,
    createdAt: timestamp,
  };
  await storage.createOAuthCode(record);
  // Opportunistic GC — keeps the tables tidy without a scheduler (serverless-safe).
  storage.deleteExpiredOAuthRows(timestamp).catch(() => {});
  return code;
}

// ─── Token endpoint ─────────────────────────────────────────────────────────

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  scope: string;
}

export interface AccessTokenSigner {
  sign(payload: { userId: string; mcpScope: 'read'; aud: string }, options: { expiresIn: string }): string;
}

export async function exchangeAuthorizationCode(
  signer: AccessTokenSigner,
  params: { code?: string; redirect_uri?: string; client_id?: string; code_verifier?: string }
): Promise<IssuedTokens> {
  if (!params.code || !params.client_id || !params.redirect_uri || !params.code_verifier) {
    throw new OAuthError('invalid_request', 'code, client_id, redirect_uri and code_verifier are required');
  }

  const record = await getMcpStorage().consumeOAuthCode(sha256Hex(params.code), now());
  if (!record) throw new OAuthError('invalid_grant', 'Authorization code is invalid, expired, or already used');
  if (record.clientId !== params.client_id) {
    throw new OAuthError('invalid_grant', 'Authorization code was issued to a different client');
  }
  if (record.redirectUri !== params.redirect_uri) {
    throw new OAuthError('invalid_grant', 'redirect_uri does not match the authorization request');
  }
  // PKCE (S256 only).
  if (base64UrlSha256(params.code_verifier) !== record.codeChallenge) {
    throw new OAuthError('invalid_grant', 'PKCE verification failed');
  }

  return issueTokens(signer, record.userId, record.clientId);
}

export async function exchangeRefreshToken(
  signer: AccessTokenSigner,
  params: { refresh_token?: string; client_id?: string }
): Promise<IssuedTokens> {
  if (!params.refresh_token || !params.client_id) {
    throw new OAuthError('invalid_request', 'refresh_token and client_id are required');
  }
  const storage = getMcpStorage();
  const record = await storage.getOAuthRefreshTokenByHash(sha256Hex(params.refresh_token));
  if (!record || record.clientId !== params.client_id) {
    throw new OAuthError('invalid_grant', 'Refresh token is invalid');
  }
  if (record.revokedAt) {
    // Rotation reuse — likely token theft. Revoke the whole successor chain.
    await revokeRotationChain(record);
    throw new OAuthError('invalid_grant', 'Refresh token has been revoked');
  }
  if (record.expiresAt <= now()) {
    throw new OAuthError('invalid_grant', 'Refresh token has expired');
  }

  const tokens = await issueTokens(signer, record.userId, record.clientId, record.id);
  return tokens;
}

/**
 * A revoked refresh token being presented again means the rotation chain
 * leaked — revoke every successor so the stolen chain dies with it.
 */
async function revokeRotationChain(start: McpOAuthRefreshToken): Promise<void> {
  const storage = getMcpStorage();
  let current: McpOAuthRefreshToken | null = start;
  for (let hops = 0; current?.rotatedToId && hops < 64; hops++) {
    const next = await storage.getOAuthRefreshTokenById(current.rotatedToId);
    if (!next) break;
    await storage.revokeOAuthRefreshToken(next.id, next.rotatedToId ?? undefined);
    current = next;
  }
}

async function issueTokens(
  signer: AccessTokenSigner,
  userId: string,
  clientId: string,
  rotatedFromId?: string
): Promise<IssuedTokens> {
  const config = loadMcpConfig();
  const storage = getMcpStorage();

  const refreshToken = REFRESH_TOKEN_PREFIX + randomBytes(32).toString('hex');
  const refreshRecord: McpOAuthRefreshToken = {
    id: generateMcpRefreshTokenId(),
    tokenHash: sha256Hex(refreshToken),
    clientId,
    userId,
    scope: MCP_SCOPE,
    expiresAt: new Date(Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000).toISOString(),
    revokedAt: null,
    rotatedToId: null,
    createdAt: now(),
  };
  await storage.createOAuthRefreshToken(refreshRecord);

  if (rotatedFromId) {
    await storage.revokeOAuthRefreshToken(rotatedFromId, refreshRecord.id);
  }

  const expiresInSeconds = config.accessTokenTtlMinutes * 60;
  const accessToken = signer.sign(
    { userId, mcpScope: 'read', aud: 'nonotion-mcp' },
    { expiresIn: `${config.accessTokenTtlMinutes}m` }
  );

  return { accessToken, refreshToken, expiresInSeconds, scope: MCP_SCOPE };
}
