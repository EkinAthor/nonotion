export interface StoredFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
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
  getFileMeta(id: string): Promise<StoredFile | null>;
  getFileData(id: string): Promise<Buffer | null>;
  deleteFile(id: string): Promise<boolean>;
}
