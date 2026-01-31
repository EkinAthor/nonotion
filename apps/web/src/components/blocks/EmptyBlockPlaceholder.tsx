import { useBlockStore } from '@/stores/blockStore';

interface EmptyBlockPlaceholderProps {
  pageId: string;
  order: number;
}

export default function EmptyBlockPlaceholder({ pageId, order }: EmptyBlockPlaceholderProps) {
  const { createBlock, setFocusBlock } = useBlockStore();

  const handleClick = async () => {
    const block = await createBlock(pageId, 'paragraph', { text: '' }, order);
    setFocusBlock(block.id);
  };

  return (
    <div
      onClick={handleClick}
      className="py-2 px-1 text-notion-text-secondary cursor-text hover:bg-notion-hover rounded transition-colors"
    >
      Type '/' for commands...
    </div>
  );
}
