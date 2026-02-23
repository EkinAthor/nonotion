import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Block, PageLinkContent, DatabaseViewContent } from '@nonotion/shared';
import { getBlockText } from '@nonotion/shared';
import { useBlockStore } from '@/stores/blockStore';
import { usePageStore } from '@/stores/pageStore';
import BlockWrapper from './BlockWrapper';
import EmptyBlockPlaceholder from './EmptyBlockPlaceholder';
import CrossBlockFormatToolbar from './CrossBlockFormatToolbar';
import { getMarkdownPrefix, getHtmlTag } from './registry';
import { htmlToInlineMarkdown } from '@/lib/html-markdown';

interface BlockCanvasProps {
  pageId: string;
  blocks: Block[];
  readOnly?: boolean;
}

export default function BlockCanvas({ pageId, blocks, readOnly = false }: BlockCanvasProps) {
  const { reorderBlocks } = useBlockStore();
  const [activeId, setActiveId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseDownBlockRef = useRef<string | null>(null);
  const isSelectingCrossBlockRef = useRef(false);

  // Find the block element that contains a given point
  const getBlockAtPoint = useCallback((x: number, y: number): string | null => {
    const container = containerRef.current;
    if (!container) return null;

    const blockElements = container.querySelectorAll('[data-block-id]');
    for (const blockEl of blockElements) {
      const rect = blockEl.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return blockEl.getAttribute('data-block-id');
      }
    }
    return null;
  }, []);



  // Handle mouse selection across blocks
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseDown = (e: MouseEvent) => {
      // Only handle if the event is within our container
      if (!container.contains(e.target as Node)) return;

      const blockId = getBlockAtPoint(e.clientX, e.clientY);
      mouseDownBlockRef.current = blockId;
      isSelectingCrossBlockRef.current = false;

      // Handle selection
      const { selectedBlockIds, clearSelection, startMultiSelection, updateMultiSelection } = useBlockStore.getState();

      if (e.shiftKey && blockId) {
        // Shift+Click: Update selection from anchor to clicked block
        // If no anchor exists, start a new selection
        e.preventDefault(); // Prevent text selection
        if (selectedBlockIds.size === 0) {
          startMultiSelection(blockId);
        } else {
          updateMultiSelection(blockId);
        }
      } else if (selectedBlockIds.size > 0) {
        // Normal click: clear existing multi-selection
        clearSelection();
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      // Only process if mouse button is pressed and we started in a block
      if (e.buttons !== 1 || !mouseDownBlockRef.current) return;

      const currentBlockId = getBlockAtPoint(e.clientX, e.clientY);

      // If we've moved to a different block while pressing
      if (currentBlockId && currentBlockId !== mouseDownBlockRef.current) {
        if (!isSelectingCrossBlockRef.current) {
          isSelectingCrossBlockRef.current = true;

          // Blur any focused contenteditable to stop TipTap selection
          const editableElements = container.querySelectorAll('[contenteditable="true"]');
          editableElements.forEach((el) => {
            if (el === document.activeElement) {
              (el as HTMLElement).blur();
            }
          });

          // Start multi-selection
          useBlockStore.getState().startMultiSelection(mouseDownBlockRef.current);
        }

        // Update the cross-block selection
        useBlockStore.getState().updateMultiSelection(currentBlockId);
      }
    };

    const handleMouseUp = () => {
      mouseDownBlockRef.current = null;
      // isSelectingCrossBlockRef persists until next mousedown
    };

    // Use capture phase to intercept before TipTap
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('mouseup', handleMouseUp, true);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('mouseup', handleMouseUp, true);
    };
  }, [getBlockAtPoint, reorderBlocks]); // reorderBlocks dependency just to satisfy linter if needed, though we use getState()

  // Handle copy for multi-block selection
  useEffect(() => {
    const handleCopy = (event: ClipboardEvent) => {
      const { selectedBlockIds, blocksByPage } = useBlockStore.getState();

      if (selectedBlockIds.size === 0) return;

      // Get selected blocks in order
      const blocks = blocksByPage.get(pageId) || [];
      const selectedBlocks = blocks
        .filter(b => selectedBlockIds.has(b.id))
        .sort((a, b) => a.order - b.order);

      if (selectedBlocks.length === 0) return;

      // Build copy text with markdown prefixes (convert HTML to inline markdown)
      const copyText = selectedBlocks.map((block) => {
        if (block.type === 'page_link') {
          const { linkedPageId } = block.content as PageLinkContent;
          const page = usePageStore.getState().pages.get(linkedPageId);
          return page ? page.title : 'Deleted page';
        }
        if (block.type === 'database_view') {
          const { databaseId } = block.content as DatabaseViewContent;
          const page = usePageStore.getState().pages.get(databaseId);
          return `[Database: ${page ? page.title : 'Unknown'}]`;
        }
        const prefix = getMarkdownPrefix(block.type);
        return prefix + htmlToInlineMarkdown(getBlockText(block.content));
      }).join('\n');

      // Also build HTML version for rich paste
      const copyHtml = selectedBlocks.map((block) => {
        if (block.type === 'page_link') {
          const { linkedPageId } = block.content as PageLinkContent;
          const page = usePageStore.getState().pages.get(linkedPageId);
          const title = page ? page.title : 'Deleted page';
          return `<a href="/page/${linkedPageId}">${title}</a>`;
        }
        if (block.type === 'database_view') {
          const { databaseId } = block.content as DatabaseViewContent;
          const page = usePageStore.getState().pages.get(databaseId);
          return `<div>[Database: ${page ? page.title : 'Unknown'}]</div>`;
        }
        const tag = getHtmlTag(block.type);
        return `<${tag}>${getBlockText(block.content)}</${tag}>`;
      }).join('');

      event.clipboardData?.setData('text/plain', copyText);
      event.clipboardData?.setData('text/html', copyHtml);
      event.preventDefault();
    };

    // Global copy listener
    document.addEventListener('copy', handleCopy, true);

    return () => {
      document.removeEventListener('copy', handleCopy, true);
    };
  }, [pageId]);

  // Handle delete for multi-block selection
  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      const {
        selectedBlockIds,
        deleteSelectedBlocks,
        selectionAnchorId,
        blocksByPage,
        updateMultiSelection
      } = useBlockStore.getState();

      if (selectedBlockIds.size === 0) return;

      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        await deleteSelectedBlocks();
        return;
      }

      // Handle Shift+ArrowUp/Down for expanding selection
      if (event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();

        if (!selectionAnchorId) return;

        const blocks = blocksByPage.get(pageId) || [];
        const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);

        // Find the "current focus" of the selection
        // If anchor is first selected -> focus is last selected
        // If anchor is last selected -> focus is first selected

        const selectedList = sortedBlocks.filter(b => selectedBlockIds.has(b.id));
        if (selectedList.length === 0) return;

        const anchorIndex = selectedList.findIndex(b => b.id === selectionAnchorId);
        if (anchorIndex === -1) return; // Should not happen

        let focusBlock: Block;

        // Determine current focus block
        // Note: selectedList is sorted by order
        // If anchor is at index 0, focus is at end
        // If anchor is at end, focus is at 0
        // BUT: this assumes contiguous selection, which valid for now

        // More robust logic:
        // Compare anchor with first and last in selection to decide direction

        const firstSelected = selectedList[0];
        const lastSelected = selectedList[selectedList.length - 1];

        if (selectionAnchorId === firstSelected.id) {
          // Growing downwards or shrinking upwards from bottom
          focusBlock = lastSelected;
        } else {
          // Growing upwards or shrinking downwards from top
          focusBlock = firstSelected;
        }

        // Find the current focus index in global list
        const focusIndex = sortedBlocks.findIndex(b => b.id === focusBlock.id);
        if (focusIndex === -1) return;

        let targetIndex = focusIndex;

        if (event.key === 'ArrowDown') {
          // If we are selecting UPWARDS (focus < anchor), and we press DOWN, we should move focus DOWN (towards anchor)
          // If we are selecting DOWNWARDS (focus >= anchor), and we press DOWN, we should move focus DOWN (away from anchor)
          targetIndex = focusIndex + 1;
        } else { // ArrowUp
          targetIndex = focusIndex - 1;
        }

        if (targetIndex >= 0 && targetIndex < sortedBlocks.length) {
          updateMultiSelection(sortedBlocks[targetIndex].id);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: readOnly ? Infinity : 8, // Disable dragging when readOnly
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = [...blocks];
        const [removed] = newOrder.splice(oldIndex, 1);
        newOrder.splice(newIndex, 0, removed);

        await reorderBlocks(pageId, newOrder.map((b) => b.id));
      }
    }
  };

  // Stable items reference — only recomputes when block IDs or their order change.
  // Prevents dnd-kit from applying a spurious "transform 0ms linear" transition
  // on every render, which causes white cursor rendering on Chromium/Windows.
  const sortableItems = useMemo(
    () => blocks.map((b) => b.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blocks.map((b) => b.id).join(',')]
  );

  return (
    <div
      ref={containerRef}
      className="min-h-[200px] pb-32 relative"
    >
      <CrossBlockFormatToolbar containerRef={containerRef} />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortableItems}
          strategy={verticalListSortingStrategy}
        >
          {blocks.map((block) => (
            <BlockWrapper
              key={block.id}
              block={block}
              pageId={pageId}
              isDragging={activeId === block.id}
              readOnly={readOnly}
            />
          ))}
        </SortableContext>
      </DndContext>

      {!readOnly && <EmptyBlockPlaceholder pageId={pageId} order={blocks.length} />}
    </div>
  );
}
