import { useState, useCallback, useRef, useEffect } from 'react';
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
import type { Block, BlockType } from '@nonotion/shared';
import { useBlockStore } from '@/stores/blockStore';
import BlockWrapper from './BlockWrapper';
import EmptyBlockPlaceholder from './EmptyBlockPlaceholder';
import { getMarkdownPrefix } from './registry';

interface BlockCanvasProps {
  pageId: string;
  blocks: Block[];
}

export default function BlockCanvas({ pageId, blocks }: BlockCanvasProps) {
  const { reorderBlocks } = useBlockStore();
  const [activeId, setActiveId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseDownBlockRef = useRef<string | null>(null);
  const isSelectingCrossBlockRef = useRef(false);
  const selectionAnchorRef = useRef<{ node: Node; offset: number } | null>(null);

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

  // TODO: Cross-block text selection is not working properly.
  // The current approach attempts to use document.caretRangeFromPoint and manual
  // Range creation, but TipTap editors capture mouse events in a way that prevents
  // native browser selection from spanning multiple blocks. This needs a different
  // approach - possibly a custom selection overlay or modifying TipTap's event handling.

  // Get caret position from mouse coordinates
  const getCaretPositionFromPoint = useCallback((x: number, y: number): { node: Node; offset: number } | null => {
    // Use caretRangeFromPoint (standard) or caretPositionFromPoint (Firefox)
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(x, y);
      if (range) {
        return { node: range.startContainer, offset: range.startOffset };
      }
    }
    return null;
  }, []);

  // Set up document-level mouse event listeners for cross-block selection
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseDown = (e: MouseEvent) => {
      // Only handle if the event is within our container
      if (!container.contains(e.target as Node)) return;

      const blockId = getBlockAtPoint(e.clientX, e.clientY);
      mouseDownBlockRef.current = blockId;
      isSelectingCrossBlockRef.current = false;

      // Store the caret position for potential cross-block selection
      const caretPos = getCaretPositionFromPoint(e.clientX, e.clientY);
      selectionAnchorRef.current = caretPos;
    };

    const handleMouseMove = (e: MouseEvent) => {
      // Only process if mouse button is pressed and we started in a block
      if (e.buttons !== 1 || !mouseDownBlockRef.current) return;

      const currentBlockId = getBlockAtPoint(e.clientX, e.clientY);

      // If we've moved to a different block while pressing
      if (currentBlockId && currentBlockId !== mouseDownBlockRef.current) {
        if (!isSelectingCrossBlockRef.current) {
          isSelectingCrossBlockRef.current = true;

          // Blur any focused contenteditable to release TipTap's selection
          const editableElements = container.querySelectorAll('[contenteditable="true"]');
          editableElements.forEach((el) => {
            if (el === document.activeElement) {
              (el as HTMLElement).blur();
            }
          });
        }

        // Create/update the cross-block selection
        const anchor = selectionAnchorRef.current;
        const focus = getCaretPositionFromPoint(e.clientX, e.clientY);

        if (anchor && focus) {
          const selection = window.getSelection();
          if (selection) {
            try {
              // Create a range from anchor to focus
              const range = document.createRange();

              // Determine order (anchor might be after focus if dragging up)
              const anchorElement = anchor.node.parentElement;
              const focusElement = focus.node.parentElement;

              if (anchorElement && focusElement) {
                const position = anchorElement.compareDocumentPosition(focusElement);

                if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
                  // Focus is after anchor (dragging down)
                  range.setStart(anchor.node, anchor.offset);
                  range.setEnd(focus.node, focus.offset);
                } else if (position & Node.DOCUMENT_POSITION_PRECEDING) {
                  // Focus is before anchor (dragging up)
                  range.setStart(focus.node, focus.offset);
                  range.setEnd(anchor.node, anchor.offset);
                } else {
                  // Same element, compare offsets
                  if (anchor.offset <= focus.offset) {
                    range.setStart(anchor.node, anchor.offset);
                    range.setEnd(focus.node, focus.offset);
                  } else {
                    range.setStart(focus.node, focus.offset);
                    range.setEnd(anchor.node, anchor.offset);
                  }
                }

                selection.removeAllRanges();
                selection.addRange(range);
              }
            } catch {
              // Range creation can fail if nodes are in different documents or invalid
            }
          }
        }
      }
    };

    const handleMouseUp = () => {
      mouseDownBlockRef.current = null;
      selectionAnchorRef.current = null;
      // Keep isSelectingCrossBlockRef true so copy handler knows it's a cross-block selection
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
  }, [getBlockAtPoint, getCaretPositionFromPoint]);

  // Handle copy with markdown prefixes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleCopy = (event: ClipboardEvent) => {
      // Only handle if the event originates from our container
      if (!container.contains(event.target as Node)) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const range = selection.getRangeAt(0);

      // Get all block wrapper elements
      const blockElements = container.querySelectorAll('[data-block-id]');
      const selectedBlocks: Array<{ id: string; type: BlockType; element: Element; text: string }> = [];

      blockElements.forEach((blockEl) => {
        // Check if this block intersects with the selection
        if (range.intersectsNode(blockEl)) {
          const blockId = blockEl.getAttribute('data-block-id');
          const blockType = blockEl.getAttribute('data-block-type') as BlockType;
          if (blockId && blockType) {
            // Get the selected text within this block
            const blockRange = document.createRange();
            blockRange.selectNodeContents(blockEl);

            // Calculate the intersection of selection with this block
            const startInBlock = range.compareBoundaryPoints(Range.START_TO_START, blockRange) >= 0;
            const endInBlock = range.compareBoundaryPoints(Range.END_TO_END, blockRange) <= 0;

            let text = '';
            if (startInBlock && endInBlock) {
              // Selection is entirely within this block
              text = selection.toString();
            } else {
              // Get text from the intersecting portion
              const intersectRange = document.createRange();
              if (startInBlock) {
                intersectRange.setStart(range.startContainer, range.startOffset);
              } else {
                intersectRange.setStart(blockRange.startContainer, blockRange.startOffset);
              }
              if (endInBlock) {
                intersectRange.setEnd(range.endContainer, range.endOffset);
              } else {
                intersectRange.setEnd(blockRange.endContainer, blockRange.endOffset);
              }
              text = intersectRange.toString();
            }

            if (text) {
              selectedBlocks.push({ id: blockId, type: blockType, element: blockEl, text });
            }
          }
        }
      });

      // No blocks found in selection
      if (selectedBlocks.length === 0) return;

      // Build the copy text with markdown prefixes for ALL blocks (including single block)
      const copyText = selectedBlocks.map(({ type, text }) => {
        const prefix = getMarkdownPrefix(type);
        return prefix + text;
      }).join('\n');

      // Set clipboard data
      event.clipboardData?.setData('text/plain', copyText);
      event.preventDefault();
    };

    // Use capture phase to intercept before TipTap handles copy
    document.addEventListener('copy', handleCopy, true);

    return () => {
      document.removeEventListener('copy', handleCopy, true);
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
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

  return (
    <div
      ref={containerRef}
      className="min-h-[200px] pb-32"
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={blocks.map((b) => b.id)}
          strategy={verticalListSortingStrategy}
        >
          {blocks.map((block) => (
            <BlockWrapper
              key={block.id}
              block={block}
              pageId={pageId}
              isDragging={activeId === block.id}
            />
          ))}
        </SortableContext>
      </DndContext>

      <EmptyBlockPlaceholder pageId={pageId} order={blocks.length} />
    </div>
  );
}
