import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragCancelEvent,
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
import { useAuthStore } from '@/stores/authStore';
import { IS_DEMO_MODE } from '@/api/client';
import { stashPendingUpload } from '@/lib/pending-drop-uploads';
import BlockWrapper from './BlockWrapper';
import MultiBlockDragPreview from './MultiBlockDragPreview';
import EmptyBlockPlaceholder from './EmptyBlockPlaceholder';
import CrossBlockFormatToolbar from './CrossBlockFormatToolbar';
import { getMarkdownPrefix, getHtmlTag } from './registry';
import { htmlToInlineMarkdown } from '@/lib/html-markdown';
import { computeDragSet } from '@/lib/block-hierarchy';
import { undoManager } from '@/lib/undo/undo-manager';

interface BlockCanvasProps {
  pageId: string;
  blocks: Block[];
  readOnly?: boolean;
}

export default function BlockCanvas({ pageId, blocks, readOnly = false }: BlockCanvasProps) {
  const { reorderBlocks, setDraggedBlockIds, clearDraggedBlockIds } = useBlockStore();
  const draggedBlockIds = useBlockStore((s) => s.draggedBlockIds);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
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



  // ── OS file drag-and-drop ─────────────────────────────────────────────────
  // Native HTML5 drag events only — dnd-kit block reordering uses pointer
  // events, so the two systems never interfere.
  const [dropIndicatorTop, setDropIndicatorTop] = useState<number | null>(null);
  const dragDepthRef = useRef(0);

  // Y-midpoint scan: first block whose midpoint is below the cursor is the
  // insertion index (DOM order of [data-block-id] matches store order 0..n-1).
  const getDropTarget = useCallback((clientY: number): { order: number; indicatorTop: number } => {
    const container = containerRef.current;
    if (!container) return { order: blocks.length, indicatorTop: 0 };
    const containerRect = container.getBoundingClientRect();
    const blockElements = container.querySelectorAll('[data-block-id]');
    for (let i = 0; i < blockElements.length; i++) {
      const rect = blockElements[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        return { order: i, indicatorTop: rect.top - containerRect.top };
      }
    }
    const last = blockElements[blockElements.length - 1];
    return {
      order: blockElements.length,
      indicatorTop: last ? last.getBoundingClientRect().bottom - containerRect.top : 0,
    };
  }, [blocks.length]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || readOnly) return;

    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;
    const inFileDropzone = (e: DragEvent) =>
      Boolean((e.target as HTMLElement | null)?.closest?.('[data-file-dropzone]'));

    // A drop that misses the canvas must never navigate the tab away.
    const handleWindowDrag = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };

    const handleDragEnter = (e: DragEvent) => {
      if (hasFiles(e)) dragDepthRef.current += 1;
    };

    const handleDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepthRef.current -= 1;
      if (dragDepthRef.current <= 0) {
        dragDepthRef.current = 0;
        setDropIndicatorTop(null);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      // An empty file block's own dropzone takes precedence — no insertion line.
      setDropIndicatorTop(inFileDropzone(e) ? null : getDropTarget(e.clientY).indicatorTop);
    };

    const handleDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepthRef.current = 0;
      setDropIndicatorTop(null);
      // This native listener fires before React's root-delegated onDrop, so
      // bail here and let FileEdit's own handler fill its block.
      if (inFileDropzone(e)) return;
      e.preventDefault();

      const files = Array.from(e.dataTransfer?.files ?? []);
      const attachmentsEnabled = useAuthStore.getState().authConfig?.fileAttachmentsEnabled ?? false;
      // Images use the legacy embedded-image path (works without attachments,
      // but not in demo — mirrors paste); other files need attachments enabled.
      const eligible = files.filter((f) =>
        f.type.startsWith('image/') ? !IS_DEMO_MODE : attachmentsEnabled
      );
      if (eligible.length === 0) return;

      const { order } = getDropTarget(e.clientY);
      const { createBlock } = useBlockStore.getState();
      // One undo entry for the whole drop; the optimistic inserts run
      // synchronously in-store, so order + i is exact even for mixed drops.
      undoManager.transact(pageId, () => {
        eligible.forEach((file, i) => {
          const isImage = file.type.startsWith('image/');
          void createBlock(
            pageId,
            isImage ? 'image' : 'file',
            isImage
              ? { url: '', alt: '', caption: '' }
              : { fileId: '', filename: '', size: 0, mimeType: '' },
            order + i
          )
            .then((b) => stashPendingUpload(b.id, file))
            .catch((err) => console.error('Drop upload block create failed:', err));
        });
      });
    };

    window.addEventListener('dragover', handleWindowDrag);
    window.addEventListener('drop', handleWindowDrag);
    container.addEventListener('dragenter', handleDragEnter);
    container.addEventListener('dragleave', handleDragLeave);
    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleWindowDrag);
      window.removeEventListener('drop', handleWindowDrag);
      container.removeEventListener('dragenter', handleDragEnter);
      container.removeEventListener('dragleave', handleDragLeave);
      container.removeEventListener('dragover', handleDragOver);
      container.removeEventListener('drop', handleDrop);
      dragDepthRef.current = 0;
      setDropIndicatorTop(null);
    };
  }, [pageId, readOnly, getDropTarget]);

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
        // Don't clear selection when clicking a drag handle — dnd-kit's
        // onDragStart needs the selection intact for multi-block drag.
        const target = e.target as HTMLElement;
        const isDragHandle = target.closest('button[title="Drag to reorder"]') !== null;
        if (!isDragHandle) {
          clearSelection();
        }
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

  // Document-level undo/redo fallback — covers states where no editor or input
  // has focus (multi-block selection, image block selected, nothing focused).
  // Focused editors/textareas/inputs handle these keys themselves (capture
  // phase runs first, so bail out for them to avoid double handling).
  useEffect(() => {
    if (readOnly) return;

    const handleUndoKeys = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('[contenteditable="true"], textarea, input, select')) return;

      event.preventDefault();
      event.stopPropagation();
      if (key === 'y' || event.shiftKey) {
        undoManager.redo(pageId);
      } else {
        undoManager.undo(pageId);
      }
    };

    document.addEventListener('keydown', handleUndoKeys, true);
    return () => {
      document.removeEventListener('keydown', handleUndoKeys, true);
    };
  }, [pageId, readOnly]);

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
    const activeId = String(event.active.id);
    const { selectedBlockIds, clearSelection } = useBlockStore.getState();

    // If active block is in selection and multi-selected, expand selection
    // Otherwise, clear selection and drag just this block (+ list children)
    if (!selectedBlockIds.has(activeId) || selectedBlockIds.size <= 1) {
      if (selectedBlockIds.size > 0) clearSelection();
    }

    const currentSelectedIds = useBlockStore.getState().selectedBlockIds;
    const dragSet = computeDragSet(blocks, currentSelectedIds, activeId);

    setDraggedBlockIds(dragSet);
    setActiveDragId(activeId);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const currentDragSet = useBlockStore.getState().draggedBlockIds;

    // Clean up drag state
    setActiveDragId(null);
    clearDraggedBlockIds();

    if (!over || active.id === over.id || currentDragSet.length === 0) return;

    const dragSetIds = new Set(currentDragSet);
    const activeOrigIndex = blocks.findIndex((b) => b.id === active.id);
    const overOrigIndex = blocks.findIndex((b) => b.id === String(over.id));

    if (activeOrigIndex === -1 || overOrigIndex === -1) return;

    // Remove drag-set blocks from the array
    const remaining = blocks.filter((b) => !dragSetIds.has(b.id));
    // Get drag-set blocks in their original relative order
    const dragSetBlocks = blocks.filter((b) => dragSetIds.has(b.id));

    // Find where 'over' ended up in the remaining array
    const overIndexInRemaining = remaining.findIndex((b) => b.id === String(over.id));
    if (overIndexInRemaining === -1) return;

    // Determine insert position
    const insertIndex = activeOrigIndex < overOrigIndex
      ? overIndexInRemaining + 1  // dragging down: insert after over
      : overIndexInRemaining;      // dragging up: insert at over

    // Splice drag-set blocks at the insert position
    const finalOrder = [...remaining];
    finalOrder.splice(insertIndex, 0, ...dragSetBlocks);

    await reorderBlocks(pageId, finalOrder.map((b) => b.id));
  };

  const handleDragCancel = (_event: DragCancelEvent) => {
    setActiveDragId(null);
    clearDraggedBlockIds();
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
      {dropIndicatorTop !== null && (
        <div
          className="absolute left-0 right-0 h-0.5 bg-blue-500 rounded pointer-events-none z-10"
          style={{ top: dropIndicatorTop }}
        />
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
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
              isDragging={activeDragId === block.id}
              isInDragSet={
                draggedBlockIds.length > 1 &&
                draggedBlockIds.includes(block.id) &&
                activeDragId !== block.id
              }
              readOnly={readOnly}
            />
          ))}
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeDragId && draggedBlockIds.length > 0 && (
            <MultiBlockDragPreview
              blocks={blocks.filter((b) => draggedBlockIds.includes(b.id))}
            />
          )}
        </DragOverlay>
      </DndContext>

      {!readOnly && <EmptyBlockPlaceholder pageId={pageId} order={blocks.length} />}
    </div>
  );
}
