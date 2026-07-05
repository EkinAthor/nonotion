import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Block, BlockType } from '@nonotion/shared';
import { getBlockText } from '@nonotion/shared';
import { useBlockStore } from '@/stores/blockStore';
import { usePageStore } from '@/stores/pageStore';
import { BlockContextProvider, type PasteBlockData } from '@/contexts/BlockContext';
import { getPlainTextLength } from '@/lib/tiptap/html-utils';
import { filesApi } from '@/api/client';
import HeadingEdit from './registry/HeadingEdit';
import Heading2Edit from './registry/Heading2Edit';
import Heading3Edit from './registry/Heading3Edit';
import ParagraphEdit from './registry/ParagraphEdit';
import BulletListEdit from './registry/BulletListEdit';
import NumberedListEdit from './registry/NumberedListEdit';
import ChecklistEdit from './registry/ChecklistEdit';
import CodeBlockEdit from './registry/CodeBlockEdit';
import ImageEdit from './registry/ImageEdit';
import DividerEdit from './registry/DividerEdit';
import PageLinkEdit from './registry/PageLinkEdit';
import DatabaseViewEdit from './registry/DatabaseViewEdit';
import BlockContextMenu from './BlockContextMenu';
import { usePresenceStore } from '@/stores/presenceStore';
import BlockEditIndicator from '@/components/presence/BlockEditIndicator';

interface BlockWrapperProps {
  block: Block;
  pageId: string;
  isDragging: boolean;
  isInDragSet?: boolean;
  readOnly?: boolean;
}

export default function BlockWrapper({ block, pageId, isDragging, isInDragSet = false, readOnly = false }: BlockWrapperProps) {
  const { deleteBlock, createBlock, createMultipleBlocks, changeBlockType, updateBlock, setFocusBlock, getBlockById, getAdjacentBlockId } = useBlockStore();
  const { createPage } = usePageStore();
  const navigate = useNavigate();
  const [showActions, setShowActions] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const kebabButtonRef = useRef<HTMLButtonElement>(null);

  const handleCreateBlockBelow = useCallback(async (initialText = ''): Promise<string> => {
    // Get current order from store to avoid stale closure after drag-and-drop
    const currentBlock = getBlockById(block.id);
    const currentOrder = currentBlock?.order ?? block.order;
    const newBlock = await createBlock(pageId, 'paragraph', { text: initialText }, currentOrder + 1);
    // Focus at start so cursor lands at the split point, not after carried-over text
    setFocusBlock(newBlock.id, 'start');
    return newBlock.id;
  }, [pageId, block.id, block.order, createBlock, setFocusBlock, getBlockById]);

  const handleInsertParagraphAbove = useCallback(async (): Promise<string> => {
    const currentBlock = getBlockById(block.id);
    const currentOrder = currentBlock?.order ?? block.order;
    // Passing currentOrder shifts this block (and everything after) down by one
    // and slots the new paragraph in at the current position. Cursor stays in
    // the current block (now bumped down) — the editor instance is keyed by
    // block id so it survives the reorder.
    const newBlock = await createBlock(pageId, 'paragraph', { text: '' }, currentOrder);
    return newBlock.id;
  }, [pageId, block.id, block.order, createBlock, getBlockById]);

  const handleChangeBlockType = useCallback(async (
    newType: BlockType,
    newText?: string,
    action?: string,
    options?: { startNumber?: number; cursorPosition?: 'start' | 'end' },
  ): Promise<void> => {
    if (newType === 'page_link' && action === 'create_subpage') {
      // Create a sub-page, link to it, then navigate.
      // Use a single updateBlock with both type + content to avoid a race
      // where changeBlockType's background API overwrites the linkedPageId.
      // Await the updateBlock so the API call completes before we navigate away.
      const newPage = await createPage({ title: 'Untitled', parentId: pageId });
      await updateBlock(block.id, { type: 'page_link', content: { linkedPageId: newPage.id } });
      navigate(`/page/${newPage.id}`);
      return;
    }

    if (newType === 'page_link' && action === 'link_existing') {
      // Switch to page_link type — the component will show the search UI
      changeBlockType(block.id, 'page_link');
      setFocusBlock(block.id);
      return;
    }

    changeBlockType(block.id, newType, newText, options);
    if (newType === 'divider' || newType === 'database_view') {
      // Non-text blocks — auto-create a paragraph below and focus it
      handleCreateBlockBelow('');
    } else {
      // Set focus to this block after type change so the new editor gets focus
      setFocusBlock(block.id, options?.cursorPosition ?? 'end');
    }
  }, [block.id, pageId, changeBlockType, setFocusBlock, handleCreateBlockBelow, createPage, updateBlock, navigate]);

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

    // If previous block is a divider, page_link, or database_view, delete it and keep current block intact
    if (prevBlock.type === 'divider' || prevBlock.type === 'page_link' || prevBlock.type === 'database_view') {
      deleteBlock(prevBlockId);
      return;
    }

    // Calculate cursor position: previous block plain text length + 1 (for TipTap position offset)
    const prevText = getBlockText(prevBlock.content);
    const cursorPosition = getPlainTextLength(prevText) + 1;

    // Fire-and-forget: all three operations execute their optimistic
    // set() calls synchronously. React batches the resulting re-render.
    if (currentText && 'text' in prevBlock.content) {
      const mergedText = prevText + currentText;
      updateBlock(prevBlockId, { content: { ...prevBlock.content, text: mergedText } });
    }

    deleteBlock(block.id);
    setFocusBlock(prevBlockId, cursorPosition);
  }, [block.id, getAdjacentBlockId, getBlockById, updateBlock, deleteBlock, setFocusBlock]);

  const handlePasteImage = useCallback(async (file: File): Promise<void> => {
    try {
      const result = await filesApi.upload(file);
      const currentBlock = getBlockById(block.id);
      const currentOrder = currentBlock?.order ?? block.order;
      const newBlock = await createBlock(pageId, 'image', {
        url: result.url,
        alt: file.name,
        caption: '',
      }, currentOrder + 1);
      setFocusBlock(newBlock.id);
    } catch (error) {
      console.error('Image paste upload failed:', error);
    }
  }, [pageId, block.id, block.order, createBlock, setFocusBlock, getBlockById]);

  const handleKebabClick = useCallback(() => {
    if (kebabButtonRef.current) {
      const rect = kebabButtonRef.current.getBoundingClientRect();
      setMenuPosition({ top: rect.bottom + 4, left: rect.left });
      setMenuOpen(true);
    }
  }, []);

  // Recalculate menu position on scroll when menu is open
  useEffect(() => {
    if (!menuOpen) return;
    const main = document.querySelector('main');
    if (!main) return;

    const handleScroll = () => {
      if (kebabButtonRef.current) {
        const rect = kebabButtonRef.current.getBoundingClientRect();
        setMenuPosition({ top: rect.bottom + 4, left: rect.left });
      }
    };

    main.addEventListener('scroll', handleScroll, { passive: true });
    return () => main.removeEventListener('scroll', handleScroll);
  }, [menuOpen]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: block.id, disabled: isInDragSet });

  // Build inline style only when dnd-kit actually needs it (dragging/animating).
  // Applying transform, transition, or opacity as inline styles on every block —
  // even benign values like "opacity: 1" — promotes elements to GPU compositing
  // layers on Chromium/Windows, causing cursor: text and cursor: grab to render
  // white/invisible. By returning undefined when idle, blocks get no inline style
  // attribute and no spurious GPU layers are created.
  const transformString = CSS.Transform.toString(transform);
  const hasActiveTransform = transformString != null;
  const needsTransition = transition != null && transition !== 'transform 0ms linear';
  const style: React.CSSProperties | undefined =
    isInDragSet
      ? { visibility: 'hidden' }
      : hasActiveTransform || isDragging
        ? {
            transform: transformString ?? undefined,
            transition: needsTransition ? transition : undefined,
            opacity: isDragging ? 0.5 : undefined,
          }
        : undefined;

  const handleDelete = async () => {
    await deleteBlock(block.id);
  };

  const renderBlockContent = () => {
    switch (block.type) {
      case 'heading':
        return <HeadingEdit block={block} readOnly={readOnly} />;
      case 'heading2':
        return <Heading2Edit block={block} readOnly={readOnly} />;
      case 'heading3':
        return <Heading3Edit block={block} readOnly={readOnly} />;
      case 'paragraph':
        return <ParagraphEdit block={block} readOnly={readOnly} />;
      case 'bullet_list':
        return <BulletListEdit block={block} readOnly={readOnly} />;
      case 'numbered_list':
        return <NumberedListEdit block={block} readOnly={readOnly} />;
      case 'checklist':
        return <ChecklistEdit block={block} readOnly={readOnly} />;
      case 'code_block':
        return <CodeBlockEdit block={block} readOnly={readOnly} />;
      case 'image':
        return <ImageEdit block={block} readOnly={readOnly} />;
      case 'divider':
        return <DividerEdit block={block} readOnly={readOnly} />;
      case 'page_link':
        return <PageLinkEdit block={block} readOnly={readOnly} />;
      case 'database_view':
        return <DatabaseViewEdit block={block} readOnly={readOnly} />;
      default:
        return <div className="text-red-500">Unknown block type: {block.type}</div>;
    }
  };

  const isSelected = useBlockStore((state) => state.selectedBlockIds.has(block.id));
  const editingUser = usePresenceStore((state) => state.activeBlockEditors.get(block.id));

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex items-start py-1 ${isSelected ? 'bg-blue-100/50 rounded-sm' : ''}`}
      data-block-id={block.id}
      data-block-type={block.type}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => !menuOpen && setShowActions(false)}
    >
      {/* Action buttons (hidden in readOnly mode) */}
      {!readOnly && (
        <div
          className={`absolute right-full top-1 flex items-center gap-0.5 pr-2 ${showActions || menuOpen ? 'visible' : 'invisible'
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
      )}

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

      {/* Remote user editing indicator */}
      {editingUser && <BlockEditIndicator user={editingUser} />}

      {/* Block content */}
      <div className="flex-1 min-w-0">
        <BlockContextProvider
          value={{
            pageId,
            blockId: block.id,
            createBlockBelow: handleCreateBlockBelow,
            insertParagraphAbove: handleInsertParagraphAbove,
            changeBlockType: handleChangeBlockType,
            focusPreviousBlock: handleFocusPreviousBlock,
            focusNextBlock: handleFocusNextBlock,
            pasteMultipleBlocks: handlePasteMultipleBlocks,
            deleteAndMergeToPrevious: handleDeleteAndMergeToPrevious,
            pasteImage: handlePasteImage,
          }}
        >
          {renderBlockContent()}
        </BlockContextProvider>
      </div>
    </div>
  );
}
