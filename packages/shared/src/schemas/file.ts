import { z } from 'zod';

export const attachmentInitiateInputSchema = z.object({
  pageId: z.string().startsWith('pg_'),
  filename: z.string().min(1).max(255),
  size: z.number().int().positive(),
  mimeType: z.string().min(1).max(255),
});

export const fileDownloadDispositionSchema = z.enum(['attachment', 'inline']);

export type AttachmentInitiateInputSchema = z.infer<typeof attachmentInitiateInputSchema>;
