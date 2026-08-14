import type { StoredFile } from './file-storage-adapter.js';
import { loadFileAttachmentsConfig, type AttachmentBackendKind } from '../config/files.js';

export type UploadTarget =
  | { mode: 'direct' }
  | { mode: 'signed-upload'; uploadUrl: string };

export interface AttachmentBlobBackend {
  kind: AttachmentBackendKind;
  createUploadTarget(meta: StoredFile): Promise<UploadTarget>;
  /** Verify the uploaded object exists and report its actual size (supabase). No-op for db. */
  verifyUpload(meta: StoredFile): Promise<{ ok: boolean; actualSize?: number }>;
  /**
   * Backend-issued download URL, or null when the caller (route) must issue its own
   * tokenized API download URL (db backend).
   */
  getDownloadUrl(
    meta: StoredFile,
    opts: { disposition: 'attachment' | 'inline'; ttlSeconds: number }
  ): Promise<{ url: string; expiresAt: string } | null>;
  getData(meta: StoredFile): Promise<Buffer | null>;
  deleteBlob(meta: StoredFile): Promise<void>;
}

const instances = new Map<AttachmentBackendKind, AttachmentBlobBackend>();

async function backendOfKind(kind: AttachmentBackendKind): Promise<AttachmentBlobBackend> {
  const existing = instances.get(kind);
  if (existing) return existing;
  let backend: AttachmentBlobBackend;
  if (kind === 'supabase') {
    const { SupabaseAttachmentBackend } = await import('./supabase-attachment-backend.js');
    backend = new SupabaseAttachmentBackend(loadFileAttachmentsConfig());
  } else {
    const { DbAttachmentBackend } = await import('./db-attachment-backend.js');
    backend = new DbAttachmentBackend();
  }
  instances.set(kind, backend);
  return backend;
}

/** Backend used for NEW uploads (from config). */
export async function getAttachmentBackend(): Promise<AttachmentBlobBackend> {
  return backendOfKind(loadFileAttachmentsConfig().backend);
}

/**
 * Backend for a specific stored file — rows keep their own storage_backend, so a
 * workspace that switched backends still serves old rows from where they live.
 */
export async function getBackendForFile(meta: StoredFile): Promise<AttachmentBlobBackend> {
  return backendOfKind(meta.storageBackend);
}
