import { useRef, useEffect, useCallback } from 'react';
import type { Block } from '@nonotion/shared';
import { useBlockStore } from '@/stores/blockStore';
import { useBlockContext } from '@/contexts/BlockContext';

interface DividerEditProps {
  block: Block;
  readOnly?: boolean;
}

export default function DividerEdit({ block, readOnly = false }: DividerEditProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const { focusBlockId, setFocusBlock, deleteBlock } = useBlockStore();
  const { createBlockBelow, focusPreviousBlock, focusNextBlock } = useBlockContext();

  // Handle focus
  useEffect(() => {
    if (focusBlockId === block.id) {
      divRef.current?.focus();
      setFocusBlock(null);
    }
  }, [focusBlockId, block.id, setFocusBlock]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (readOnly) return;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          focusPreviousBlock();
          break;
        case 'ArrowDown':
          e.preventDefault();
          focusNextBlock();
          break;
        case 'Backspace':
        case 'Delete':
          e.preventDefault();
          focusPreviousBlock();
          deleteBlock(block.id);
          break;
        case 'Enter':
          e.preventDefault();
          createBlockBelow('');
          break;
      }
    },
    [readOnly, block.id, focusPreviousBlock, focusNextBlock, deleteBlock, createBlockBelow]
  );

  return (
    <div
      ref={divRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="py-2 outline-none focus:ring-2 focus:ring-blue-200 rounded"
      data-block-type="divider"
    >
      <hr className="border-t border-notion-border" />
    </div>
  );
}
