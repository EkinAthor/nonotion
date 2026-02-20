export type BlockType =
  | 'heading'
  | 'heading2'
  | 'heading3'
  | 'paragraph'
  | 'bullet_list'
  | 'numbered_list'
  | 'checklist'
  | 'code_block'
  | 'image'
  | 'divider'
  | 'page_link'
  | 'database_view';

export interface HeadingContent {
  text: string;
  level: 1;
}

export interface Heading2Content {
  text: string;
  level: 2;
}

export interface Heading3Content {
  text: string;
  level: 3;
}

export interface ParagraphContent {
  text: string;
}

export interface BulletListContent {
  text: string;
  indent?: number; // 0-based indentation level (0 = no indent, 1 = one level, etc.)
}

export interface NumberedListContent {
  text: string;
  indent?: number;
}

export interface ChecklistContent {
  text: string;
  checked: boolean;
  indent?: number;
}

export interface CodeBlockContent {
  code: string;
  language?: string;
}

export interface ImageContent {
  url: string;
  alt?: string;
  caption?: string;
}

export interface DividerContent {}

export interface PageLinkContent {
  linkedPageId: string;
}

export interface DatabaseViewContent {
  databaseId: string;
}

export type BlockContent =
  | HeadingContent
  | Heading2Content
  | Heading3Content
  | ParagraphContent
  | BulletListContent
  | NumberedListContent
  | ChecklistContent
  | CodeBlockContent
  | ImageContent
  | DividerContent
  | PageLinkContent
  | DatabaseViewContent;

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

/** Helper to extract text content from any block content type */
export function getBlockText(content: BlockContent): string {
  if ('text' in content) {
    return content.text;
  }
  if ('code' in content) {
    return content.code;
  }
  if ('url' in content) {
    return content.caption || content.alt || '';
  }
  if ('linkedPageId' in content) {
    return '';
  }
  if ('databaseId' in content) {
    return '';
  }
  return '';
}
