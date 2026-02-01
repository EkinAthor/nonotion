import type { BlockType, BlockContent } from '@nonotion/shared';
import HeadingEdit from './HeadingEdit';
import Heading2Edit from './Heading2Edit';
import ParagraphEdit from './ParagraphEdit';
import Heading3Edit from './Heading3Edit';

export interface MarkdownConfig {
  /** Prefix to add before text when copying (e.g., "# " for h1) */
  prefix?: string;
  /** Suffix to add after text when copying (optional) */
  suffix?: string;
  /** Regex pattern to match this block type when pasting markdown */
  pastePattern?: RegExp;
}

export interface BlockDefinition {
  type: BlockType;
  label: string;
  icon: string;
  shortcuts: string[];
  EditComponent: React.ComponentType<{ block: any }>;
  defaultContent: BlockContent;
  /** Markdown configuration for copy/paste */
  markdown?: MarkdownConfig;
}

export const blockRegistry: Record<BlockType, BlockDefinition> = {
  heading: {
    type: 'heading',
    label: 'Heading 1',
    icon: 'H1',
    shortcuts: ['h1', 'h', 'heading', 'head'],
    EditComponent: HeadingEdit,
    defaultContent: { text: '', level: 1 },
    markdown: {
      prefix: '# ',
      pastePattern: /^# (.*)$/,
    },
  },
  heading2: {
    type: 'heading2',
    label: 'Heading 2',
    icon: 'H2',
    shortcuts: ['h2', 'h2', 'heading2', 'head2'],
    EditComponent: Heading2Edit,
    defaultContent: { text: '', level: 2 },
    markdown: {
      prefix: '## ',
      pastePattern: /^## (.*)$/,
    },
  },
  heading3: {
    type: 'heading3',
    label: 'Heading 3',
    icon: 'H3',
    shortcuts: ['h3', 'h3', 'heading3', 'head3'],
    EditComponent: Heading3Edit,
    defaultContent: { text: '', level: 3 },
    markdown: {
      prefix: '### ',
      pastePattern: /^### (.*)$/,
    },
  },
  paragraph: {
    type: 'paragraph',
    label: 'Paragraph',
    icon: 'P',
    shortcuts: ['p', 'para', 'paragraph', 'text'],
    EditComponent: ParagraphEdit,
    defaultContent: { text: '' },
    // No markdown config for paragraph - it's the default
  },
};

export function getBlockDefinition(type: BlockType): BlockDefinition | undefined {
  return blockRegistry[type];
}

export function getAllBlockTypes(): BlockDefinition[] {
  return Object.values(blockRegistry);
}

/** Get the markdown prefix for a block type (for copy operations) */
export function getMarkdownPrefix(type: BlockType): string {
  return blockRegistry[type]?.markdown?.prefix || '';
}

/** Parse a line of text and determine block type based on markdown patterns */
export function parseMarkdownLine(line: string): { type: BlockType; text: string } {
  for (const [type, definition] of Object.entries(blockRegistry)) {
    if (definition.markdown?.pastePattern) {
      const match = line.match(definition.markdown.pastePattern);
      if (match) {
        return { type: type as BlockType, text: match[1] || '' };
      }
    }
  }
  // Default to paragraph
  return { type: 'paragraph', text: line };
}
