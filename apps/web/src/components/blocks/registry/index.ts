import type { BlockType, BlockContent } from '@nonotion/shared';
import HeadingEdit from './HeadingEdit';
import Heading2Edit from './Heading2Edit';
import ParagraphEdit from './ParagraphEdit';
import Heading3Edit from './Heading3Edit';

export interface BlockDefinition {
  type: BlockType;
  label: string;
  icon: string;
  shortcuts: string[];
  EditComponent: React.ComponentType<{ block: any }>;
  defaultContent: BlockContent;
}

export const blockRegistry: Record<BlockType, BlockDefinition> = {
  heading: {
    type: 'heading',
    label: 'Heading 1',
    icon: 'H1',
    shortcuts: ['h1', 'h', 'heading', 'head'],
    EditComponent: HeadingEdit,
    defaultContent: { text: '', level: 1 },
  },
  heading2: {
    type: 'heading2',
    label: 'Heading 2',
    icon: 'H2',
    shortcuts: ['h2', 'h2', 'heading2', 'head2'],
    EditComponent: Heading2Edit,
    defaultContent: { text: '', level: 2 },
  },
  heading3: {
    type: 'heading3',
    label: 'Heading 3',
    icon: 'H3',
    shortcuts: ['h3', 'h3', 'heading3', 'head3'],
    EditComponent: Heading3Edit,
    defaultContent: { text: '', level: 3 },
  },
  paragraph: {
    type: 'paragraph',
    label: 'Paragraph',
    icon: 'P',
    shortcuts: ['p', 'para', 'paragraph', 'text'],
    EditComponent: ParagraphEdit,
    defaultContent: { text: '' },
  },
};

export function getBlockDefinition(type: BlockType): BlockDefinition | undefined {
  return blockRegistry[type];
}

export function getAllBlockTypes(): BlockDefinition[] {
  return Object.values(blockRegistry);
}
