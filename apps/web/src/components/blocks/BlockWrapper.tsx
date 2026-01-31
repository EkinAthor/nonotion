import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Block } from '@nonotion/shared';
import { useBlockStore } from '@/stores/blockStore';
import HeadingEdit from './registry/HeadingEdit';
import ParagraphEdit from './registry/ParagraphEdit';

interface BlockWrapperProps {
  block: Block;
  isDragging: boolean;
}

export default function BlockWrapper({ block, isDragging }: BlockWrapperProps) {
  const { deleteBlock } = useBlockStore();
  const [showActions, setShowActions] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleDelete = async () => {
    await deleteBlock(block.id);
  };

  const renderBlockContent = () => {
    switch (block.type) {
      case 'heading':
        return <HeadingEdit block={block} />;
      case 'paragraph':
        return <ParagraphEdit block={block} />;
      default:
        return <div className="text-red-500">Unknown block type: {block.type}</div>;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative flex items-start py-1 -ml-8"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Action buttons */}
      <div
        className={`flex items-center gap-0.5 mr-1 transition-opacity ${
          showActions ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="p-1 rounded hover:bg-notion-hover cursor-grab active:cursor-grabbing"
          title="Drag to reorder"
        >
          <svg
            className="w-4 h-4 text-notion-text-secondary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8h16M4 16h16"
            />
          </svg>
        </button>

        {/* Delete button */}
        <button
          onClick={handleDelete}
          className="p-1 rounded hover:bg-notion-hover"
          title="Delete block"
        >
          <svg
            className="w-4 h-4 text-notion-text-secondary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>

      {/* Block content */}
      <div className="flex-1 min-w-0">{renderBlockContent()}</div>
    </div>
  );
}
