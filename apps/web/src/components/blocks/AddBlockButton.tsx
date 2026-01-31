import { useState } from 'react';
import type { BlockType, BlockContent } from '@nonotion/shared';
import { useBlockStore } from '@/stores/blockStore';

interface AddBlockButtonProps {
  pageId: string;
  order: number;
}

interface BlockOption {
  type: BlockType;
  label: string;
  icon: string;
  defaultContent: BlockContent;
}

const BLOCK_OPTIONS: BlockOption[] = [
  {
    type: 'heading',
    label: 'Heading 1',
    icon: 'H1',
    defaultContent: { text: '', level: 1 },
  },
  {
    type: 'paragraph',
    label: 'Paragraph',
    icon: 'P',
    defaultContent: { text: '' },
  },
];

export default function AddBlockButton({ pageId, order }: AddBlockButtonProps) {
  const { createBlock } = useBlockStore();
  const [showMenu, setShowMenu] = useState(false);

  const handleAddBlock = async (option: BlockOption) => {
    await createBlock(pageId, option.type, option.defaultContent, order);
    setShowMenu(false);
  };

  return (
    <div className="relative mt-2">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-2 px-2 py-1 text-sm text-notion-text-secondary hover:bg-notion-hover rounded transition-colors"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
        Add a block
      </button>

      {showMenu && (
        <div className="absolute top-full left-0 mt-1 py-1 bg-white rounded-lg shadow-lg border border-notion-border z-10 min-w-[180px]">
          {BLOCK_OPTIONS.map((option) => (
            <button
              key={option.type}
              onClick={() => handleAddBlock(option)}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-notion-text hover:bg-notion-hover text-left"
            >
              <span className="w-6 h-6 flex items-center justify-center bg-notion-sidebar rounded text-xs font-medium">
                {option.icon}
              </span>
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
