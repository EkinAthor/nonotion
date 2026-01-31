import { z } from 'zod';

export const blockTypeSchema = z.enum(['heading', 'heading2', 'heading3', 'paragraph']);

export const headingContentSchema = z.object({
  text: z.string(),
  level: z.literal(1),
});

export const heading2ContentSchema = z.object({
  text: z.string(),
  level: z.literal(2),
});

export const heading3ContentSchema = z.object({
  text: z.string(),
  level: z.literal(3),
});

export const paragraphContentSchema = z.object({
  text: z.string(),
});

export const blockContentSchema = z.union([headingContentSchema, heading2ContentSchema, heading3ContentSchema, paragraphContentSchema]);

export const blockSchema = z.object({
  id: z.string().startsWith('blk_'),
  type: blockTypeSchema,
  pageId: z.string().startsWith('pg_'),
  order: z.number().int().nonnegative(),
  content: blockContentSchema,
  version: z.number().int().positive(),
});

export const createBlockInputSchema = z.object({
  type: blockTypeSchema,
  pageId: z.string().startsWith('pg_'),
  content: blockContentSchema,
  order: z.number().int().nonnegative().optional(),
});

export const updateBlockInputSchema = z.object({
  type: blockTypeSchema.optional(),
  content: blockContentSchema.optional(),
  order: z.number().int().nonnegative().optional(),
});

export const reorderBlocksInputSchema = z.object({
  blockIds: z.array(z.string().startsWith('blk_')),
});

export type BlockTypeSchema = z.infer<typeof blockTypeSchema>;
export type BlockSchema = z.infer<typeof blockSchema>;
export type CreateBlockInputSchema = z.infer<typeof createBlockInputSchema>;
export type UpdateBlockInputSchema = z.infer<typeof updateBlockInputSchema>;
export type ReorderBlocksInputSchema = z.infer<typeof reorderBlocksInputSchema>;
