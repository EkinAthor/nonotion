import { z } from 'zod';

export const blockTypeSchema = z.enum([
  'heading',
  'heading2',
  'heading3',
  'paragraph',
  'bullet_list',
  'numbered_list',
  'checklist',
  'code_block',
  'image',
  'divider',
]);

export const headingContentSchema = z.object({
  text: z.string(),
  level: z.literal(1),
}).strict();

export const heading2ContentSchema = z.object({
  text: z.string(),
  level: z.literal(2),
}).strict();

export const heading3ContentSchema = z.object({
  text: z.string(),
  level: z.literal(3),
}).strict();

export const paragraphContentSchema = z.object({
  text: z.string(),
}).strict();

export const bulletListContentSchema = z.object({
  text: z.string(),
  indent: z.number().int().nonnegative().optional(),
}).strict();

export const numberedListContentSchema = z.object({
  text: z.string(),
  indent: z.number().int().nonnegative().optional(),
}).strict();

export const checklistContentSchema = z.object({
  text: z.string(),
  checked: z.boolean(),
  indent: z.number().int().nonnegative().optional(),
}).strict();

export const codeBlockContentSchema = z.object({
  code: z.string(),
  language: z.string().optional(),
}).strict();

export const imageContentSchema = z.object({
  url: z.string(),
  alt: z.string().optional(),
  caption: z.string().optional(),
}).strict();

export const dividerContentSchema = z.object({}).strict();

export const blockContentSchema = z.union([
  checklistContentSchema,
  bulletListContentSchema,
  numberedListContentSchema,
  headingContentSchema,
  heading2ContentSchema,
  heading3ContentSchema,
  codeBlockContentSchema,
  imageContentSchema,
  dividerContentSchema,
  paragraphContentSchema,
]);

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
