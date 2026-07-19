import { z } from 'zod';

export const setMcpAccessInputSchema = z.object({
  enabled: z.boolean(),
  allowImages: z.boolean().optional(),
  allowFiles: z.boolean().optional(),
});

export const createMcpTokenInputSchema = z.object({
  name: z.string().min(1).max(100),
});

export const mcpConsentInputSchema = z.object({
  clientId: z.string().startsWith('mcpc_'),
  redirectUri: z.string().url(),
  codeChallenge: z.string().min(43).max(128),
  codeChallengeMethod: z.literal('S256'),
  state: z.string().max(2048).optional(),
  scope: z.string().max(256).optional(),
});
