import { generateFileId } from '@nonotion/shared';
import type { FileUploadResponse } from '@nonotion/shared';
import { getFileStorage } from '../storage/storage-factory.js';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];

const MAX_FILE_SIZE_BYTES =
  (parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10)) * 1024 * 1024;

export async function uploadFile(
  data: Buffer,
  filename: string,
  mimeType: string,
  uploadedBy: string
): Promise<FileUploadResponse> {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new Error(`Unsupported file type: ${mimeType}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`);
  }

  if (data.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File too large: ${(data.length / 1024 / 1024).toFixed(1)}MB. Maximum: ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`
    );
  }

  const id = generateFileId();
  const stored = await getFileStorage().saveFile({
    id,
    filename,
    mimeType,
    size: data.length,
    data,
    uploadedBy,
  });

  return {
    id: stored.id,
    url: `/api/files/${stored.id}`,
    filename: stored.filename,
    mimeType: stored.mimeType,
    size: stored.size,
  };
}

export async function getFile(id: string): Promise<{ meta: { filename: string; mimeType: string; size: number }; data: Buffer } | null> {
  const storage = getFileStorage();
  const meta = await storage.getFileMeta(id);
  if (!meta) return null;

  const data = await storage.getFileData(id);
  if (!data) return null;

  return {
    meta: {
      filename: meta.filename,
      mimeType: meta.mimeType,
      size: meta.size,
    },
    data,
  };
}

export async function deleteFile(id: string): Promise<boolean> {
  return getFileStorage().deleteFile(id);
}
