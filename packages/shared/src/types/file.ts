export interface FileUploadResponse {
  id: string; // file_xxxxxxxxxxxx
  url: string; // /api/files/file_xxxxxxxxxxxx
  filename: string;
  mimeType: string;
  size: number;
}

export interface AttachmentInitiateInput {
  pageId: string;
  filename: string;
  size: number; // declared size in bytes — re-verified server-side after upload
  mimeType: string;
}

export interface AttachmentInitiateResponse {
  fileId: string;
  mode: 'direct' | 'signed-upload';
  uploadUrl?: string; // signed-upload only: browser PUTs the raw file body here
}

export interface AttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface FileDownloadUrlResponse {
  url: string; // absolute (supabase signed URL) or API-relative (/api/files/:id/download?token=...)
  expiresAt: string;
}

export type FileDownloadDisposition = 'attachment' | 'inline';
