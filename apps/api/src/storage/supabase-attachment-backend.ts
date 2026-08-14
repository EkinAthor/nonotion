import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AttachmentBlobBackend, UploadTarget } from './attachment-backend.js';
import type { StoredFile } from './file-storage-adapter.js';
import type { FileAttachmentsConfig } from '../config/files.js';

/** Keep object keys predictable and safe; the original filename lives in the metadata row. */
function sanitizeFilename(filename: string): string {
  const cleaned = filename.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '');
  return cleaned.length > 0 ? cleaned.slice(0, 128) : 'file';
}

export function objectPathFor(meta: { id: string; filename: string }): string {
  return `attachments/${meta.id}/${sanitizeFilename(meta.filename)}`;
}

/** Supabase Storage backend: private bucket, signed upload + download URLs (encrypted at rest). */
export class SupabaseAttachmentBackend implements AttachmentBlobBackend {
  readonly kind = 'supabase' as const;
  private client: SupabaseClient;
  private bucket: string;

  constructor(config: FileAttachmentsConfig) {
    if (!config.supabaseUrl || !config.supabaseSecretKey) {
      throw new Error('Supabase attachment backend requires SUPABASE_URL and SUPABASE_SECRET_KEY');
    }
    this.client = createClient(config.supabaseUrl, config.supabaseSecretKey);
    this.bucket = config.bucket;
  }

  async createUploadTarget(meta: StoredFile): Promise<UploadTarget> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUploadUrl(objectPathFor(meta));
    if (error || !data) {
      throw new Error(`Failed to create signed upload URL: ${error?.message ?? 'no data'}`);
    }
    return { mode: 'signed-upload', uploadUrl: data.signedUrl };
  }

  async verifyUpload(meta: StoredFile): Promise<{ ok: boolean; actualSize?: number }> {
    const path = objectPathFor(meta);
    const storage = this.client.storage.from(this.bucket) as unknown as {
      info?: (path: string) => Promise<{ data: { size?: number; contentLength?: number } | null; error: { message: string } | null }>;
    };
    if (typeof storage.info === 'function') {
      const { data, error } = await storage.info(path);
      if (!error && data) {
        return { ok: true, actualSize: data.size ?? data.contentLength };
      }
      if (error) return { ok: false };
    }
    // Fallback for supabase-js versions without info(): list the object's folder.
    const { data: listed, error: listError } = await this.client.storage
      .from(this.bucket)
      .list(`attachments/${meta.id}`);
    if (listError || !listed || listed.length === 0) return { ok: false };
    const entry = listed[0];
    const size = (entry.metadata as { size?: number } | null)?.size;
    return { ok: true, actualSize: size };
  }

  async getDownloadUrl(
    meta: StoredFile,
    opts: { disposition: 'attachment' | 'inline'; ttlSeconds: number }
  ): Promise<{ url: string; expiresAt: string }> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(
        objectPathFor(meta),
        opts.ttlSeconds,
        opts.disposition === 'attachment' ? { download: meta.filename } : {}
      );
    if (error || !data) {
      throw new Error(`Failed to create signed download URL: ${error?.message ?? 'no data'}`);
    }
    return {
      url: data.signedUrl,
      expiresAt: new Date(Date.now() + opts.ttlSeconds * 1000).toISOString(),
    };
  }

  async getData(meta: StoredFile): Promise<Buffer | null> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .download(objectPathFor(meta));
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }

  async deleteBlob(meta: StoredFile): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).remove([objectPathFor(meta)]);
    if (error) {
      console.warn(`Failed to delete attachment object ${meta.id} from Supabase: ${error.message}`);
    }
  }
}
