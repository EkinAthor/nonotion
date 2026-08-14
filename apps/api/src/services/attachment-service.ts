import { generateFileId } from '@nonotion/shared';
import type {
  AttachmentInitiateInput,
  AttachmentInitiateResponse,
  AttachmentMeta,
  FileDownloadDisposition,
} from '@nonotion/shared';
import { getFileStorage } from '../storage/storage-factory.js';
import { getAttachmentBackend, getBackendForFile } from '../storage/attachment-backend.js';
import type { StoredFile } from '../storage/file-storage-adapter.js';
import { loadFileAttachmentsConfig } from '../config/files.js';
import * as permissionService from './permission-service.js';

export interface AttachmentViewer {
  userId: string;
  isOwner: boolean;
}

export class AttachmentError extends Error {
  constructor(
    public code: 'VALIDATION' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT',
    message: string
  ) {
    super(message);
  }
}

const GC_GRACE_MS = 24 * 60 * 60 * 1000;

/** Extensions that are never accepted regardless of FILE_ALLOWED_EXTENSIONS (stored-XSS / active content). */
// (xml is allowed: downloads are attachment-only + nosniff, and inline is
// restricted to SAFE_INLINE_MIME_TYPES, so it can never render on our origin.)
const FORBIDDEN_EXTENSIONS = new Set(['html', 'htm', 'xhtml', 'svg', 'js', 'mjs']);
const FORBIDDEN_MIME_TYPES = new Set(['text/html', 'application/xhtml+xml', 'image/svg+xml', 'text/javascript', 'application/javascript']);

/** MIME types allowed to render inline (open in a new tab); everything else downloads. */
const SAFE_INLINE_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

export function isSafeInlineMime(mimeType: string): boolean {
  return SAFE_INLINE_MIME_TYPES.has(mimeType.toLowerCase());
}

function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx <= 0 || idx === filename.length - 1) return '';
  return filename.slice(idx + 1).toLowerCase();
}

export function validateAttachment(filename: string, mimeType: string, size: number): void {
  const config = loadFileAttachmentsConfig();
  const ext = extensionOf(filename);
  if (!ext) {
    throw new AttachmentError('VALIDATION', 'Filename must have an extension');
  }
  if (FORBIDDEN_EXTENSIONS.has(ext) || FORBIDDEN_MIME_TYPES.has(mimeType.toLowerCase())) {
    throw new AttachmentError('VALIDATION', `File type .${ext} is not allowed`);
  }
  if (!config.allowedExtensions.includes(ext)) {
    throw new AttachmentError(
      'VALIDATION',
      `File type .${ext} is not allowed. Accepted: ${config.allowedExtensions.map((e) => '.' + e).join(', ')}`
    );
  }
  const maxBytes = config.maxSizeMb * 1024 * 1024;
  if (size > maxBytes) {
    throw new AttachmentError(
      'VALIDATION',
      `File too large: ${(size / 1024 / 1024).toFixed(1)}MB. Maximum: ${config.maxSizeMb}MB`
    );
  }
}

export async function initiateUpload(
  input: AttachmentInitiateInput,
  viewer: AttachmentViewer
): Promise<AttachmentInitiateResponse> {
  // Opportunistic GC (serverless-safe, mirrors MCP OAuth code GC).
  void gcSweep().catch((err) => console.warn('Attachment GC sweep failed:', err));

  validateAttachment(input.filename, input.mimeType, input.size);

  const allowed = await permissionService.canEdit(input.pageId, viewer.userId, {
    isWorkspaceOwner: viewer.isOwner,
  });
  if (!allowed) {
    throw new AttachmentError('FORBIDDEN', 'No edit access to this page');
  }

  const config = loadFileAttachmentsConfig();
  const meta = await getFileStorage().createFileMeta({
    id: generateFileId(),
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.size,
    uploadedBy: viewer.userId,
    pageId: input.pageId,
    storageBackend: config.backend,
    status: 'pending',
  });

  const backend = await getAttachmentBackend();
  const target = await backend.createUploadTarget(meta);
  return {
    fileId: meta.id,
    mode: target.mode,
    ...(target.mode === 'signed-upload' ? { uploadUrl: target.uploadUrl } : {}),
  };
}

async function getPendingOwnedRow(fileId: string, userId: string): Promise<StoredFile> {
  const meta = await getFileStorage().getFileMeta(fileId);
  if (!meta) throw new AttachmentError('NOT_FOUND', 'File not found');
  if (meta.uploadedBy !== userId) {
    throw new AttachmentError('FORBIDDEN', 'Only the uploader can complete this upload');
  }
  if (meta.status !== 'pending') {
    throw new AttachmentError('CONFLICT', 'Upload already completed');
  }
  return meta;
}

function toAttachmentMeta(meta: StoredFile): AttachmentMeta {
  return { id: meta.id, filename: meta.filename, mimeType: meta.mimeType, size: meta.size };
}

/** db backend: bytes arrive through the API as multipart. */
export async function storeDirectUpload(
  fileId: string,
  data: Buffer,
  userId: string
): Promise<AttachmentMeta> {
  const meta = await getPendingOwnedRow(fileId, userId);
  if (meta.storageBackend !== 'db') {
    throw new AttachmentError('VALIDATION', 'This upload must go directly to storage');
  }
  validateAttachment(meta.filename, meta.mimeType, data.length);

  const storage = getFileStorage();
  await storage.writeFileData(fileId, data);
  await storage.updateFileMeta(fileId, { status: 'ready', size: data.length });
  return toAttachmentMeta({ ...meta, status: 'ready', size: data.length });
}

/** supabase backend: verify the direct upload actually landed and matches what was declared. */
export async function confirmUpload(fileId: string, userId: string): Promise<AttachmentMeta> {
  const meta = await getPendingOwnedRow(fileId, userId);
  if (meta.storageBackend === 'db') {
    throw new AttachmentError('VALIDATION', 'This upload completes via the content endpoint');
  }

  const backend = await getBackendForFile(meta);
  const verification = await backend.verifyUpload(meta);
  if (!verification.ok) {
    throw new AttachmentError('VALIDATION', 'Uploaded file not found in storage');
  }

  const config = loadFileAttachmentsConfig();
  const actualSize = verification.actualSize ?? meta.size;
  if (actualSize > config.maxSizeMb * 1024 * 1024) {
    await backend.deleteBlob(meta);
    await getFileStorage().deleteFile(fileId);
    throw new AttachmentError('VALIDATION', `File exceeds the ${config.maxSizeMb}MB limit`);
  }

  await getFileStorage().updateFileMeta(fileId, { status: 'ready', size: actualSize });
  return toAttachmentMeta({ ...meta, status: 'ready', size: actualSize });
}

export async function issueDownloadUrl(
  fileId: string,
  viewer: AttachmentViewer,
  disposition: FileDownloadDisposition
): Promise<{ meta: StoredFile; backendUrl: { url: string; expiresAt: string } | null; disposition: FileDownloadDisposition }> {
  const meta = await getFileStorage().getFileMeta(fileId);
  if (!meta || meta.status !== 'ready') {
    throw new AttachmentError('NOT_FOUND', 'File not found');
  }
  // Legacy rows (pageId null) keep today's any-authenticated-user behavior.
  if (meta.pageId) {
    const allowed = await permissionService.canRead(meta.pageId, viewer.userId, {
      isWorkspaceOwner: viewer.isOwner,
    });
    if (!allowed) {
      throw new AttachmentError('FORBIDDEN', 'No access to this file');
    }
  }

  const effectiveDisposition: FileDownloadDisposition =
    disposition === 'inline' && isSafeInlineMime(meta.mimeType) ? 'inline' : 'attachment';

  const backend = await getBackendForFile(meta);
  const backendUrl = await backend.getDownloadUrl(meta, {
    disposition: effectiveDisposition,
    ttlSeconds: loadFileAttachmentsConfig().signedUrlTtlSeconds,
  });
  return { meta, backendUrl, disposition: effectiveDisposition };
}

export async function getAttachmentData(fileId: string): Promise<{ meta: StoredFile; data: Buffer } | null> {
  const meta = await getFileStorage().getFileMeta(fileId);
  if (!meta || meta.status !== 'ready') return null;
  const backend = await getBackendForFile(meta);
  const data = await backend.getData(meta);
  if (!data) return null;
  return { meta, data };
}

export async function markDetached(fileId: string): Promise<void> {
  const meta = await getFileStorage().getFileMeta(fileId);
  // Only attachment rows (page-linked) participate in the detach/GC lifecycle.
  if (!meta || !meta.pageId) return;
  await getFileStorage().updateFileMeta(fileId, { detachedAt: new Date().toISOString() });
}

export async function markReattached(fileId: string): Promise<void> {
  const meta = await getFileStorage().getFileMeta(fileId);
  if (!meta || !meta.pageId) return;
  await getFileStorage().updateFileMeta(fileId, { detachedAt: null });
}

export async function deleteAttachmentsByPage(pageId: string): Promise<void> {
  const storage = getFileStorage();
  const attachments = await storage.getFilesByPage(pageId);
  for (const meta of attachments) {
    try {
      const backend = await getBackendForFile(meta);
      await backend.deleteBlob(meta);
    } catch (err) {
      console.warn(`Failed to delete attachment blob ${meta.id}:`, err);
    }
    await storage.deleteFile(meta.id);
  }
}

export async function gcSweep(): Promise<void> {
  const cutoff = new Date(Date.now() - GC_GRACE_MS).toISOString();
  const storage = getFileStorage();
  const stale = await storage.listFilesForGc(cutoff);
  for (const meta of stale) {
    try {
      const backend = await getBackendForFile(meta);
      await backend.deleteBlob(meta);
    } catch (err) {
      console.warn(`Attachment GC: failed to delete blob ${meta.id}:`, err);
      continue; // keep the row so a later sweep retries the blob
    }
    await storage.deleteFile(meta.id);
  }
}
