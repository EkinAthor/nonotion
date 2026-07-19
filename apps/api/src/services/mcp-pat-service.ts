import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { McpPersonalAccessToken, McpTokenMeta, CreateMcpTokenResponse } from '@nonotion/shared';
import { generateMcpTokenId, now } from '@nonotion/shared';
import { getMcpStorage } from '../storage/storage-factory.js';

// Token format: nmcp_{tokenId12}{secret40hex}
// The token id is embedded so verification is a single indexed lookup; only the
// sha256 of the 160-bit random secret is stored (no stretching needed).
const TOKEN_PREFIX = 'nmcp_';
const TOKEN_ID_LENGTH = 12;
const SECRET_HEX_LENGTH = 40;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function createToken(userId: string, name: string): Promise<CreateMcpTokenResponse> {
  const id = generateMcpTokenId(); // mcpt_xxxxxxxxxxxx
  const secret = randomBytes(SECRET_HEX_LENGTH / 2).toString('hex');
  const token = `${TOKEN_PREFIX}${id.slice('mcpt_'.length)}${secret}`;

  const row: McpPersonalAccessToken = {
    id,
    userId,
    name,
    tokenHash: sha256Hex(secret),
    tokenSuffix: secret.slice(-4),
    lastUsedAt: null,
    createdAt: now(),
  };
  await getMcpStorage().createMcpToken(row);
  return { token, meta: toMeta(row) };
}

export async function listTokens(userId: string): Promise<McpTokenMeta[]> {
  const rows = await getMcpStorage().listMcpTokens(userId);
  return rows
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toMeta);
}

export async function revokeToken(id: string, userId: string): Promise<boolean> {
  return getMcpStorage().deleteMcpToken(id, userId);
}

/**
 * Verify a bearer PAT. Returns the token row on success (caller loads the
 * user and enforces account state) or null for any malformed/unknown token.
 */
export async function verifyToken(token: string): Promise<McpPersonalAccessToken | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const rest = token.slice(TOKEN_PREFIX.length);
  if (rest.length !== TOKEN_ID_LENGTH + SECRET_HEX_LENGTH) return null;

  const id = `mcpt_${rest.slice(0, TOKEN_ID_LENGTH)}`;
  const secret = rest.slice(TOKEN_ID_LENGTH);

  const row = await getMcpStorage().getMcpToken(id);
  if (!row) return null;

  const expected = Buffer.from(row.tokenHash, 'hex');
  const actual = Buffer.from(sha256Hex(secret), 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  // Fire-and-forget usage timestamp — not worth failing the request over.
  getMcpStorage()
    .touchMcpTokenUsed(id, now())
    .catch(() => {});

  return row;
}

function toMeta(row: McpPersonalAccessToken): McpTokenMeta {
  return {
    id: row.id,
    name: row.name,
    tokenSuffix: row.tokenSuffix,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
  };
}
