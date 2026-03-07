import type { Block } from '@nonotion/shared';
import { getBlockText } from '@nonotion/shared';

interface MultiBlockDragPreviewProps {
  blocks: Block[];
}

export default function MultiBlockDragPreview({ blocks }: MultiBlockDragPreviewProps) {
  if (blocks.length === 0) return null;

  const firstBlock = blocks[0];
  const text = getBlockText(firstBlock.content) || firstBlock.type;
  // Strip HTML tags for preview
  const plainText = text.replace(/<[^>]*>/g, '');

  if (blocks.length === 1) {
    return (
      <div className="bg-white rounded shadow-lg border border-gray-200 px-3 py-2 max-w-md">
        <p className="text-sm text-notion-text truncate">{plainText || 'Empty block'}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Stacked card effect */}
      <div className="absolute top-1 left-1 bg-gray-100 rounded shadow border border-gray-200 px-3 py-2 max-w-md w-full h-full" />
      <div className="relative bg-white rounded shadow-lg border border-gray-200 px-3 py-2 max-w-md">
        <p className="text-sm text-notion-text truncate">{plainText || 'Empty block'}</p>
        <span className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs font-medium rounded-full w-5 h-5 flex items-center justify-center">
          {blocks.length}
        </span>
      </div>
    </div>
  );
}
