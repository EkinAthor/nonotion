export type BlockType = 'heading' | 'paragraph';

export interface HeadingContent {
  text: string;
  level: 1;
}

export interface ParagraphContent {
  text: string;
}

export type BlockContent = HeadingContent | ParagraphContent;

export interface Block {
  id: string; // "blk_xxxxx"
  type: BlockType;
  pageId: string;
  order: number; // Position in page
  content: BlockContent;
  version: number; // For LWW sync
}

export interface CreateBlockInput {
  type: BlockType;
  pageId: string;
  content: BlockContent;
  order?: number;
}

export interface UpdateBlockInput {
  type?: BlockType;
  content?: BlockContent;
  order?: number;
}

export interface ReorderBlocksInput {
  blockIds: string[]; // New order of block IDs
}
