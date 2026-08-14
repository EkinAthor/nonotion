export type FileStorageBackendKind = 'db' | 'supabase';
export type FileStatus = 'pending' | 'ready';

export interface StoredFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  pageId: string | null; // null for legacy image rows
  storageBackend: FileStorageBackendKind;
  status: FileStatus;
  detachedAt: string | null;
  createdAt: string;
}

export interface FileStorageAdapter {
  saveFile(file: {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    data: Buffer;
    uploadedBy: string;
  }): Promise<StoredFile>;
  /** Create a metadata-only row (attachment flow) — bytes arrive later or live in an external backend. */
  createFileMeta(meta: {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    uploadedBy: string;
    pageId: string;
    storageBackend: FileStorageBackendKind;
    status: FileStatus;
  }): Promise<StoredFile>;
  updateFileMeta(
    id: string,
    patch: { status?: FileStatus; size?: number; detachedAt?: string | null }
  ): Promise<boolean>;
  /** Write BLOB bytes for a pre-created metadata row (db backend direct upload). */
  writeFileData(id: string, data: Buffer): Promise<boolean>;
  getFileMeta(id: string): Promise<StoredFile | null>;
  getFileData(id: string): Promise<Buffer | null>;
  getFilesByPage(pageId: string): Promise<StoredFile[]>;
  /** Rows eligible for GC: pending and created before cutoff, or detached before cutoff. */
  listFilesForGc(cutoffIso: string): Promise<StoredFile[]>;
  deleteFile(id: string): Promise<boolean>;
}
