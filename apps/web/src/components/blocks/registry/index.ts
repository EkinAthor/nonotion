import type { BlockType, BlockContent } from '@nonotion/shared';
import HeadingEdit from './HeadingEdit';
import Heading2Edit from './Heading2Edit';
import Heading3Edit from './Heading3Edit';
import ParagraphEdit from './ParagraphEdit';
import BulletListEdit from './BulletListEdit';
import NumberedListEdit from './NumberedListEdit';
import ChecklistEdit from './ChecklistEdit';
import CodeBlockEdit from './CodeBlockEdit';
import ImageEdit from './ImageEdit';

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
  bullet_list: {
    type: 'bullet_list',
    label: 'Bulleted list',
    icon: '•',
    shortcuts: ['bullet', 'ul', 'list', '-'],
    EditComponent: BulletListEdit,
    defaultContent: { text: '' },
    markdown: {
      prefix: '- ',
      pastePattern: /^[-*] (.*)$/,
    },
  },
  numbered_list: {
    type: 'numbered_list',
    label: 'Numbered list',
    icon: '1.',
    shortcuts: ['number', 'ol', 'numbered', '1.'],
    EditComponent: NumberedListEdit,
    defaultContent: { text: '' },
    markdown: {
      prefix: '1. ',
      pastePattern: /^\d+\. (.*)$/,
    },
  },
  checklist: {
    type: 'checklist',
    label: 'To-do list',
    icon: '☐',
    shortcuts: ['todo', 'check', 'checkbox', '[]'],
    EditComponent: ChecklistEdit,
    defaultContent: { text: '', checked: false },
    markdown: {
      prefix: '- [ ] ',
      pastePattern: /^- \[([ x])\] (.*)$/,
    },
  },
  code_block: {
    type: 'code_block',
    label: 'Code',
    icon: '</>',
    shortcuts: ['code', 'codeblock', '```'],
    EditComponent: CodeBlockEdit,
    defaultContent: { code: '', language: '' },
  },
  image: {
    type: 'image',
    label: 'Image',
    icon: '🖼',
    shortcuts: ['image', 'img', 'picture'],
    EditComponent: ImageEdit,
    defaultContent: { url: '', alt: '', caption: '' },
  },
};

/** Get the HTML tag name for a block type (for copy operations) */
export function getHtmlTag(type: BlockType): string {
  switch (type) {
    case 'heading': return 'h1';
    case 'heading2': return 'h2';
    case 'heading3': return 'h3';
    case 'bullet_list': return 'li';
    case 'numbered_list': return 'li';
    case 'checklist': return 'li';
    case 'code_block': return 'pre';
    case 'image': return 'img';
    case 'paragraph':
    default:
      return 'p';
  }
}

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
export function parseMarkdownLine(line: string): { type: BlockType; text: string; checked?: boolean } {
  // Special handling for checklist - it has 2 capture groups
  const checklistMatch = line.match(/^- \[([ xX])\] (.*)$/);
  if (checklistMatch) {
    return {
      type: 'checklist',
      text: checklistMatch[2] || '',
      checked: checklistMatch[1].toLowerCase() === 'x',
    };
  }

  for (const [type, definition] of Object.entries(blockRegistry)) {
    // Skip checklist since we handled it above
    if (type === 'checklist') continue;

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
