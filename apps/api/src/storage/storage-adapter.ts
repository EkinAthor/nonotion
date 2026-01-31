import type { Page, Block } from '@nonotion/shared';

export interface StorageAdapter {
  // Pages
  getAllPages(): Promise<Page[]>;
  getPage(id: string): Promise<Page | null>;
  createPage(page: Page): Promise<Page>;
  updatePage(id: string, updates: Partial<Page>): Promise<Page | null>;
  deletePage(id: string): Promise<boolean>;

  // Blocks
  getBlocksByPage(pageId: string): Promise<Block[]>;
  getBlock(id: string): Promise<Block | null>;
  createBlock(block: Block): Promise<Block>;
  updateBlock(id: string, updates: Partial<Block>): Promise<Block | null>;
  deleteBlock(id: string): Promise<boolean>;
  deleteBlocksByPage(pageId: string): Promise<void>;
}
