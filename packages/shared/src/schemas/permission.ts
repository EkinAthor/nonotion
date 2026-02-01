import { z } from 'zod';

export const permissionLevelSchema = z.enum(['owner', 'full_access', 'editor', 'viewer']);

export const pagePermissionSchema = z.object({
  pageId: z.string().startsWith('pg_'),
  userId: z.string().startsWith('usr_'),
  level: permissionLevelSchema,
  grantedBy: z.string().startsWith('usr_'),
  grantedAt: z.string().datetime(),
});

export const sharePageInputSchema = z.object({
  userId: z.string().startsWith('usr_'),
  level: permissionLevelSchema.refine(
    (level) => level !== 'owner',
    { message: 'Cannot share with owner permission level' }
  ),
});

export const updateShareInputSchema = z.object({
  level: permissionLevelSchema.refine(
    (level) => level !== 'owner',
    { message: 'Cannot update to owner permission level' }
  ),
});

export type PermissionLevelSchema = z.infer<typeof permissionLevelSchema>;
export type PagePermissionSchema = z.infer<typeof pagePermissionSchema>;
export type SharePageInputSchema = z.infer<typeof sharePageInputSchema>;
export type UpdateShareInputSchema = z.infer<typeof updateShareInputSchema>;
