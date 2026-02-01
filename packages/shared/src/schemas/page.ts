import { z } from 'zod';

export const pageSchema = z.object({
  id: z.string().startsWith('pg_'),
  title: z.string(),
  ownerId: z.string().startsWith('usr_'),
  parentId: z.string().startsWith('pg_').nullable(),
  childIds: z.array(z.string().startsWith('pg_')),
  icon: z.string().nullable(),
  isStarred: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().positive(),
});

export const createPageInputSchema = z.object({
  title: z.string().min(1).max(255),
  parentId: z.string().startsWith('pg_').nullable().optional(),
  icon: z.string().max(10).nullable().optional(),
});

export const updatePageInputSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  parentId: z.string().startsWith('pg_').nullable().optional(),
  icon: z.string().max(10).nullable().optional(),
  isStarred: z.boolean().optional(),
  childIds: z.array(z.string().startsWith('pg_')).optional(),
});

export type PageSchema = z.infer<typeof pageSchema>;
export type CreatePageInputSchema = z.infer<typeof createPageInputSchema>;
export type UpdatePageInputSchema = z.infer<typeof updatePageInputSchema>;
