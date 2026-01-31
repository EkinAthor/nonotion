import type { BlockType, BlockContent } from '@nonotion/shared';
import HeadingEdit from './HeadingEdit';
import ParagraphEdit from './ParagraphEdit';

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
