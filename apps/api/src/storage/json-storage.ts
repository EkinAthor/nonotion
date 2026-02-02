import fs from 'fs/promises';
import path from 'path';
import type { Page, Block } from '@nonotion/shared';
import type { StorageAdapter } from './storage-adapter.js';

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), '../../data');
const PAGES_DIR = path.join(DATA_DIR, 'pages');
const BLOCKS_DIR = path.join(DATA_DIR, 'blocks');

export class JsonFileStorage implements StorageAdapter {
  private pagesCache: Map<string, Page> = new Map();
  private blocksCache: Map<string, Block[]> = new Map();
  private initialized = false;
  private writeLock: Promise<void> = Promise.resolve();

  async init(): Promise<void> {
    if (this.initialized) return;

    // Ensure directories exist
    await fs.mkdir(PAGES_DIR, { recursive: true });
    await fs.mkdir(BLOCKS_DIR, { recursive: true });

    // Load all pages into cache
    await this.loadPagesCache();
    await this.loadBlocksCache();

    this.initialized = true;
  }

  private async loadPagesCache(): Promise<void> {
    try {
      const files = await fs.readdir(PAGES_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = await fs.readFile(path.join(PAGES_DIR, file), 'utf-8');
          const page = JSON.parse(content) as Page;
          this.pagesCache.set(page.id, page);
        }
      }
    } catch {
      // Directory might be empty, that's fine
    }
  }

  private async loadBlocksCache(): Promise<void> {
    try {
      const files = await fs.readdir(BLOCKS_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const pageId = file.replace('.json', '');
          const content = await fs.readFile(path.join(BLOCKS_DIR, file), 'utf-8');
          const blocks = JSON.parse(content) as Block[];
          this.blocksCache.set(pageId, blocks);
        }
      }
    } catch {
      // Directory might be empty, that's fine
    }
  }

  private async withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.writeLock;
    let resolve: () => void;
    this.writeLock = new Promise((r) => {
      resolve = r;
    });

    await previous;
    try {
      return await fn();
    } finally {
      resolve!();
    }
  }

  private async atomicWrite(filePath: string, data: unknown): Promise<void> {
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tempPath, filePath);
  }

  // Pages
  async getAllPages(): Promise<Page[]> {
    await this.init();
    return Array.from(this.pagesCache.values());
  }

  async getPage(id: string): Promise<Page | null> {
    await this.init();
    return this.pagesCache.get(id) || null;
  }

  async createPage(page: Page): Promise<Page> {
    await this.init();
    return this.withWriteLock(async () => {
      this.pagesCache.set(page.id, page);
      await this.atomicWrite(path.join(PAGES_DIR, `${page.id}.json`), page);
      return page;
    });
  }

  async updatePage(id: string, updates: Partial<Page>): Promise<Page | null> {
    await this.init();
    return this.withWriteLock(async () => {
      const existing = this.pagesCache.get(id);
      if (!existing) return null;

      const updated = { ...existing, ...updates };
      this.pagesCache.set(id, updated);
      await this.atomicWrite(path.join(PAGES_DIR, `${id}.json`), updated);
      return updated;
    });
  }

  async deletePage(id: string): Promise<boolean> {
    await this.init();
    return this.withWriteLock(async () => {
      if (!this.pagesCache.has(id)) return false;

      this.pagesCache.delete(id);
      try {
        await fs.unlink(path.join(PAGES_DIR, `${id}.json`));
      } catch {
        // File might not exist
      }
      return true;
    });
  }

  // Blocks
  async getBlocksByPage(pageId: string): Promise<Block[]> {
    await this.init();
    const blocks = this.blocksCache.get(pageId) || [];
    return blocks.sort((a, b) => a.order - b.order);
  }

  async getBlock(id: string): Promise<Block | null> {
    await this.init();
    for (const blocks of this.blocksCache.values()) {
      const block = blocks.find((b) => b.id === id);
      if (block) return block;
    }
    return null;
  }

  async createBlock(block: Block): Promise<Block> {
    await this.init();
    return this.withWriteLock(async () => {
      const blocks = this.blocksCache.get(block.pageId) || [];
      blocks.push(block);
      this.blocksCache.set(block.pageId, blocks);
      await this.atomicWrite(path.join(BLOCKS_DIR, `${block.pageId}.json`), blocks);
      return block;
    });
  }

  async updateBlock(id: string, updates: Partial<Block>): Promise<Block | null> {
    await this.init();
    return this.withWriteLock(async () => {
      for (const [pageId, blocks] of this.blocksCache.entries()) {
        const index = blocks.findIndex((b) => b.id === id);
        if (index !== -1) {
          const updated = { ...blocks[index], ...updates };
          blocks[index] = updated;
          await this.atomicWrite(path.join(BLOCKS_DIR, `${pageId}.json`), blocks);
          return updated;
        }
      }
      return null;
    });
  }

  async deleteBlock(id: string): Promise<boolean> {
    await this.init();
    return this.withWriteLock(async () => {
      for (const [pageId, blocks] of this.blocksCache.entries()) {
        const index = blocks.findIndex((b) => b.id === id);
        if (index !== -1) {
          blocks.splice(index, 1);
          if (blocks.length === 0) {
            this.blocksCache.delete(pageId);
            try {
              await fs.unlink(path.join(BLOCKS_DIR, `${pageId}.json`));
            } catch {
              // File might not exist
            }
          } else {
            await this.atomicWrite(path.join(BLOCKS_DIR, `${pageId}.json`), blocks);
          }
          return true;
        }
      }
      return false;
    });
  }

  async deleteBlocksByPage(pageId: string): Promise<void> {
    await this.init();
    return this.withWriteLock(async () => {
      this.blocksCache.delete(pageId);
      try {
        await fs.unlink(path.join(BLOCKS_DIR, `${pageId}.json`));
      } catch {
        // File might not exist
      }
    });
  }
}

export const storage = new JsonFileStorage();
