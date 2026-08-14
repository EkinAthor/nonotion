import type { AttachmentBlobBackend, UploadTarget } from './attachment-backend.js';
import type { StoredFile } from './file-storage-adapter.js';
import { getFileStorage } from './storage-factory.js';

/** BLOB-in-DB backend: bytes flow through the API (direct multipart upload + tokenized download). */
export class DbAttachmentBackend implements AttachmentBlobBackend {
  readonly kind = 'db' as const;

  async createUploadTarget(_meta: StoredFile): Promise<UploadTarget> {
    return { mode: 'direct' };
  }

  async verifyUpload(_meta: StoredFile): Promise<{ ok: boolean }> {
    // The direct-upload route already validated and stored the real bytes.
    return { ok: true };
  }

  async getDownloadUrl(): Promise<null> {
    // Route issues a short-lived JWT token URL against /api/files/:id/download.
    return null;
  }

  async getData(meta: StoredFile): Promise<Buffer | null> {
    return getFileStorage().getFileData(meta.id);
  }

  async deleteBlob(_meta: StoredFile): Promise<void> {
    // Bytes live in the row; deleting the row removes them.
  }
}
