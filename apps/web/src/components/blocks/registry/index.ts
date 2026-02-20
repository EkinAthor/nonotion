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
import DividerEdit from './DividerEdit';
import PageLinkEdit from './PageLinkEdit';
import DatabaseViewEdit from './DatabaseViewEdit';

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
  divider: {
    type: 'divider',
    label: 'Divider',
    icon: '---',
    shortcuts: ['divider', 'hr', 'line', '---'],
    EditComponent: DividerEdit,
    defaultContent: {} as BlockContent,
    markdown: {
      prefix: '---',
      pastePattern: /^(?:---+|\*\*\*+|___+)$/,
    },
  },
  page_link: {
    type: 'page_link',
    label: 'Page link',
    icon: '🔗',
    shortcuts: ['pagelink', 'link'],
    EditComponent: PageLinkEdit,
    defaultContent: { linkedPageId: '' } as BlockContent,
  },
  database_view: {
    type: 'database_view',
    label: 'Database view',
    icon: '🗃️',
    shortcuts: ['database', 'db', 'dbview', 'table'],
    EditComponent: DatabaseViewEdit,
    defaultContent: { databaseId: '' } as BlockContent,
  },
};

export interface SlashMenuItem {
  type: BlockType;
  action?: string;
  label: string;
  description: string;
  icon: string;
  shortcuts: string[];
}

/** Get all slash menu items, including multiple entries for page_link */
export function getSlashMenuItems(): SlashMenuItem[] {
  const items: SlashMenuItem[] = [];

  for (const def of Object.values(blockRegistry)) {
    if (def.type === 'page_link' || def.type === 'database_view') continue; // handled separately below
    items.push({
      type: def.type,
      label: def.label,
      description: getSlashItemDescription(def.type),
      icon: def.icon,
      shortcuts: def.shortcuts,
    });
  }

  // Two page_link entries with different actions
  items.push({
    type: 'page_link',
    action: 'create_subpage',
    label: 'Page',
    description: 'Create a sub-page and link to it',
    icon: '📄',
    shortcuts: ['page', 'subpage'],
  });
  items.push({
    type: 'page_link',
    action: 'link_existing',
    label: 'Page link',
    description: 'Link to an existing page',
    icon: '🔗',
    shortcuts: ['pagelink', 'link', 'page link'],
  });

  // Database view entry
  items.push({
    type: 'database_view',
    label: 'Database view',
    description: 'Embed an existing database',
    icon: '🗃️',
    shortcuts: ['database', 'db', 'dbview', 'table'],
  });

  return items;
}

function getSlashItemDescription(type: BlockType): string {
  switch (type) {
    case 'heading': return 'Large section heading';
    case 'heading2': return 'Medium section heading';
    case 'heading3': return 'Small section heading';
    case 'paragraph': return 'Plain text';
    case 'bullet_list': return 'Simple bulleted list';
    case 'numbered_list': return 'Numbered list';
    case 'checklist': return 'Track tasks with a to-do list';
    case 'code_block': return 'Capture code snippet';
    case 'image': return 'Upload or embed an image';
    case 'divider': return 'Visual divider line';
    case 'database_view': return 'Embed an existing database';
    default: return '';
  }
}

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
    case 'divider': return 'hr';
    case 'page_link': return 'a';
    case 'database_view': return 'div';
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
        // Divider has no capture group — return empty text
        if (type === 'divider') {
          return { type: 'divider', text: '' };
        }
        return { type: type as BlockType, text: match[1] || '' };
      }
    }
  }
  // Default to paragraph
  return { type: 'paragraph', text: line };
}
