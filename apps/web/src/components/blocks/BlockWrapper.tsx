import { useState, useCallback, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Block, BlockType } from '@nonotion/shared';
import { useBlockStore } from '@/stores/blockStore';
import { BlockContextProvider, type PasteBlockData } from '@/contexts/BlockContext';
import HeadingEdit from './registry/HeadingEdit';
import Heading2Edit from './registry/Heading2Edit';
import Heading3Edit from './registry/Heading3Edit';
import ParagraphEdit from './registry/ParagraphEdit';
import BlockContextMenu from './BlockContextMenu';

interface BlockWrapperProps {
  block: Block;
  pageId: string;
  isDragging: boolean;
}

export default function BlockWrapper({ block, pageId, isDragging }: BlockWrapperProps) {
  const { deleteBlock, createBlock, createMultipleBlocks, changeBlockType, updateBlock, setFocusBlock, getBlockById, getAdjacentBlockId } = useBlockStore();
  const [showActions, setShowActions] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const kebabButtonRef = useRef<HTMLButtonElement>(null);

  const handleCreateBlockBelow = useCallback(async (initialText = ''): Promise<string> => {
    // Get current order from store to avoid stale closure after drag-and-drop
    const currentBlock = getBlockById(block.id);
    const currentOrder = currentBlock?.order ?? block.order;
    const newBlock = await createBlock(pageId, 'paragraph', { text: initialText }, currentOrder + 1);
    setFocusBlock(newBlock.id);
    return newBlock.id;
  }, [pageId, block.id, block.order, createBlock, setFocusBlock, getBlockById]);

  const handleChangeBlockType = useCallback(async (newType: BlockType, newText?: string): Promise<void> => {
    await changeBlockType(block.id, newType, newText);
    // Set focus to this block after type change so the new editor gets focus
    setFocusBlock(block.id);
  }, [block.id, changeBlockType, setFocusBlock]);

  const handleFocusPreviousBlock = useCallback(() => {
    const prevBlockId = getAdjacentBlockId(block.id, 'prev');
    if (prevBlockId) {
      setFocusBlock(prevBlockId);
    }
  }, [block.id, getAdjacentBlockId, setFocusBlock]);

  const handleFocusNextBlock = useCallback(() => {
    const nextBlockId = getAdjacentBlockId(block.id, 'next');
    if (nextBlockId) {
      setFocusBlock(nextBlockId);
    } else {
      // No next block - create a new one
      handleCreateBlockBelow('');
    }
  }, [block.id, getAdjacentBlockId, setFocusBlock, handleCreateBlockBelow]);

  const handlePasteMultipleBlocks = useCallback(async (blocks: PasteBlockData[], textAfterCursor: string): Promise<void> => {
    // Get current order from store to avoid stale closure
    const currentBlock = getBlockById(block.id);
    const currentOrder = currentBlock?.order ?? block.order;

    // If there's text after cursor, we need to create a final block for it
    const blocksToCreate = textAfterCursor
      ? [...blocks, { type: 'paragraph' as BlockType, content: { text: textAfterCursor } }]
      : blocks;

    if (blocksToCreate.length === 0) return;

    const createdBlocks = await createMultipleBlocks(pageId, blocksToCreate, currentOrder);

    // Focus the last created block
    if (createdBlocks.length > 0) {
      setFocusBlock(createdBlocks[createdBlocks.length - 1].id);
    }
  }, [pageId, block.id, block.order, createMultipleBlocks, setFocusBlock, getBlockById]);

  const handleDeleteAndMergeToPrevious = useCallback(async (currentText: string): Promise<void> => {
    const prevBlockId = getAdjacentBlockId(block.id, 'prev');

    // If no previous block, do nothing (first block edge case)
    if (!prevBlockId) return;

    const prevBlock = getBlockById(prevBlockId);
    if (!prevBlock) return;

    // Calculate cursor position: previous block text length + 1 (for TipTap position offset)
    const prevText = prevBlock.content.text || '';
    const cursorPosition = prevText.length + 1;

    // If current block has text, merge it to the previous block
    if (currentText) {
      const mergedText = prevText + currentText;
      await updateBlock(prevBlockId, { content: { ...prevBlock.content, text: mergedText } });
    }

    // Delete the current block
    await deleteBlock(block.id);

    // Focus previous block at the join position
    setFocusBlock(prevBlockId, cursorPosition);
  }, [block.id, getAdjacentBlockId, getBlockById, updateBlock, deleteBlock, setFocusBlock]);

  const handleKebabClick = useCallback(() => {
    if (kebabButtonRef.current) {
      const rect = kebabButtonRef.current.getBoundingClientRect();
      setMenuPosition({ top: rect.bottom + 4, left: rect.left });
      setMenuOpen(true);
    }
  }, []);

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
      case 'heading2':
        return <Heading2Edit block={block} />;
      case 'heading3':
        return <Heading3Edit block={block} />;
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
      data-block-id={block.id}
      data-block-type={block.type}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => !menuOpen && setShowActions(false)}
    >
      {/* Action buttons */}
      <div
        className={`flex items-center gap-0.5 mr-1 transition-opacity ${showActions || menuOpen ? 'opacity-100' : 'opacity-0'
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

        {/* Kebab menu button */}
        <button
          ref={kebabButtonRef}
          onClick={handleKebabClick}
          className="p-1 rounded hover:bg-notion-hover"
          title="More options"
        >
          <svg
            className="w-4 h-4 text-notion-text-secondary"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>
      </div>

      {/* Context menu */}
      {menuOpen && (
        <BlockContextMenu
          currentBlockType={block.type}
          position={menuPosition}
          onDelete={handleDelete}
          onChangeType={handleChangeBlockType}
          onClose={() => setMenuOpen(false)}
        />
      )}

      {/* Block content */}
      <div className="flex-1 min-w-0">
        <BlockContextProvider
          value={{
            pageId,
            blockId: block.id,
            createBlockBelow: handleCreateBlockBelow,
            changeBlockType: handleChangeBlockType,
            focusPreviousBlock: handleFocusPreviousBlock,
            focusNextBlock: handleFocusNextBlock,
            pasteMultipleBlocks: handlePasteMultipleBlocks,
            deleteAndMergeToPrevious: handleDeleteAndMergeToPrevious,
          }}
        >
          {renderBlockContent()}
        </BlockContextProvider>
      </div>
    </div>
  );
}
