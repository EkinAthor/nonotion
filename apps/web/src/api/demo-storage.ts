/**
 * Low-level localStorage CRUD layer for demo mode.
 * All keys are prefixed with `nonotion_demo_` to avoid collisions.
 */
import type { Page, Block } from '@nonotion/shared';

const PREFIX = 'nonotion_demo_';
const PAGES_KEY = `${PREFIX}pages`;
const BLOCKS_KEY = `${PREFIX}blocks`;
const SEEDED_KEY = `${PREFIX}seeded`;

// --- Pages ---

export function getAllPages(): Page[] {
  const raw = localStorage.getItem(PAGES_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function getPage(id: string): Page | undefined {
  return getAllPages().find((p) => p.id === id);
}

export function createPage(page: Page): Page {
  const pages = getAllPages();
  pages.push(page);
  localStorage.setItem(PAGES_KEY, JSON.stringify(pages));
  return page;
}

export function updatePage(id: string, updates: Partial<Page>): Page | undefined {
  const pages = getAllPages();
  const idx = pages.findIndex((p) => p.id === id);
  if (idx === -1) return undefined;
  pages[idx] = { ...pages[idx], ...updates, updatedAt: new Date().toISOString(), version: pages[idx].version + 1 };
  localStorage.setItem(PAGES_KEY, JSON.stringify(pages));
  return pages[idx];
}

export function deletePage(id: string): void {
  const pages = getAllPages().filter((p) => p.id !== id);
  localStorage.setItem(PAGES_KEY, JSON.stringify(pages));
}

export function saveAllPages(pages: Page[]): void {
  localStorage.setItem(PAGES_KEY, JSON.stringify(pages));
}

// --- Blocks ---

export function getAllBlocks(): Block[] {
  const raw = localStorage.getItem(BLOCKS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function getBlocksByPage(pageId: string): Block[] {
  return getAllBlocks()
    .filter((b) => b.pageId === pageId)
    .sort((a, b) => a.order - b.order);
}

export function getBlock(id: string): Block | undefined {
  return getAllBlocks().find((b) => b.id === id);
}

export function createBlock(block: Block): Block {
  const blocks = getAllBlocks();
  blocks.push(block);
  localStorage.setItem(BLOCKS_KEY, JSON.stringify(blocks));
  return block;
}

export function updateBlock(id: string, updates: Partial<Block>): Block | undefined {
  const blocks = getAllBlocks();
  const idx = blocks.findIndex((b) => b.id === id);
  if (idx === -1) return undefined;
  blocks[idx] = { ...blocks[idx], ...updates, version: blocks[idx].version + 1 };
  localStorage.setItem(BLOCKS_KEY, JSON.stringify(blocks));
  return blocks[idx];
}

export function deleteBlock(id: string): void {
  const blocks = getAllBlocks().filter((b) => b.id !== id);
  localStorage.setItem(BLOCKS_KEY, JSON.stringify(blocks));
}

export function deleteBlocksByPage(pageId: string): void {
  const blocks = getAllBlocks().filter((b) => b.pageId !== pageId);
  localStorage.setItem(BLOCKS_KEY, JSON.stringify(blocks));
}

export function saveAllBlocks(blocks: Block[]): void {
  localStorage.setItem(BLOCKS_KEY, JSON.stringify(blocks));
}

// --- Seed flag ---

export function isDemoSeeded(): boolean {
  return localStorage.getItem(SEEDED_KEY) === 'true';
}

export function markDemoSeeded(): void {
  localStorage.setItem(SEEDED_KEY, 'true');
}
