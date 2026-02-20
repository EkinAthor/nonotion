export interface ImportResult {
  pagesCreated: number;
  databasesCreated: number;
  blocksCreated: number;
  imagesUploaded: number;
  rootPageIds: string[];
  errors: string[];
}
