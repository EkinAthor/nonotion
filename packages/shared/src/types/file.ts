export interface FileUploadResponse {
  id: string; // file_xxxxxxxxxxxx
  url: string; // /api/files/file_xxxxxxxxxxxx
  filename: string;
  mimeType: string;
  size: number;
}
