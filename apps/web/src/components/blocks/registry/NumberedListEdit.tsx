import { useEffect, useCallback } from 'react';
import { EditorContent } from '@tiptap/react';
import type { Block, NumberedListContent } from '@nonotion/shared';
import { useBlockEditor } from '@/lib/tiptap/useBlockEditor';
import { useBlockContext } from '@/contexts/BlockContext';
import { useBlockStore } from '@/stores/blockStore';
import { formatNumberForLevel } from '@/lib/list-numbering';
import { pushBlockContentEntry } from '@/lib/undo/entries';
import SlashCommandMenu from '../SlashCommandMenu';
import FormatToolbar from '../FormatToolbar';

const MAX_INDENT = 4;

interface NumberedListEditProps {
  block: Block;
  readOnly?: boolean;
}

export default function NumberedListEdit({ block, readOnly = false }: NumberedListEditProps) {
  const { changeBlockType, focusPreviousBlock, focusNextBlock, pasteMultipleBlocks, pasteImage } = useBlockContext();
  const { focusBlockId, focusPosition, setFocusBlock, getBlocksForPage, updateBlock } = useBlockStore();

  const content = block.content as NumberedListContent;
  const indent = content.indent ?? 0;

  const handleIndent = useCallback(async () => {
    if (indent < MAX_INDENT) {
      const after = { ...content, indent: indent + 1 };
      pushBlockContentEntry({
        blockId: block.id,
        pageId: block.pageId,
        before: content,
        after,
        label: 'indent',
      });
      await updateBlock(block.id, { content: after });
    }
  }, [block.id, block.pageId, content, indent, updateBlock]);

  const handleOutdent = useCallback(async () => {
    if (indent > 0) {
      const after = { ...content, indent: indent - 1 };
      pushBlockContentEntry({
        blockId: block.id,
        pageId: block.pageId,
        before: content,
        after,
        label: 'outdent',
      });
      await updateBlock(block.id, { content: after });
    }
  }, [block.id, block.pageId, content, indent, updateBlock]);

  // Calculate the displayed numeral for this numbered list block.
  // - Walk backward, skipping deeper-indented children (they don't break the sibling sequence).
  // - Stop at a same-indent non-numbered_list block (sequence break) or a shallower indent (out of scope).
  // - If a same-indent sibling has `startNumber`, treat it as an anchor and return anchor + offset.
  // - Format the resulting numeric value per indent level (decimal/alpha/roman cycle).
  // Computed inline (not memoized) so the value updates when adjacent blocks change —
  // the parent subscribes to the whole store via useBlockStore() so this re-runs on every relevant render.
  const displayNumber = (() => {
    const ownStart = content.startNumber;

    const blocks = getBlocksForPage(block.pageId);
    const sorted = [...blocks].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((b) => b.id === block.id);

    let value: number;
    if (ownStart !== undefined) {
      value = ownStart;
    } else {
      let siblingsBack = 0;
      let resolved: number | null = null;
      for (let i = idx - 1; i >= 0; i--) {
        const prev = sorted[i];
        const prevContent = prev.content as { indent?: number; startNumber?: number };
        const prevIndent = prevContent.indent ?? 0;

        if (prevIndent < indent) break;
        if (prevIndent > indent) continue; // deeper sub-item, skip but keep walking
        // same indent
        if (prev.type !== 'numbered_list') break;

        siblingsBack++;
        if (prevContent.startNumber !== undefined) {
          resolved = prevContent.startNumber + siblingsBack;
          break;
        }
      }
      value = resolved ?? siblingsBack + 1;
    }

    return formatNumberForLevel(value, indent);
  })();

  const { editor, slashMenu, closeSlashMenu, selectSlashCommand } = useBlockEditor({
    block,
    placeholder: readOnly ? '' : 'List item',
    readOnly,
    onCreateBlockBelow: async (textAfterCursor) => {
      // If empty and pressing Enter, either outdent or convert to paragraph
      const currentText = editor?.getText() || '';
      if (!currentText.trim() && !textAfterCursor.trim()) {
        if (indent > 0) {
          // Outdent instead of converting to paragraph
          await handleOutdent();
          return;
        }
        await changeBlockType('paragraph');
        return;
      }
      // Otherwise create a new numbered_list block with same indent
      const { createBlock, setFocusBlock, getBlockById } = useBlockStore.getState();
      const currentBlock = getBlockById(block.id);
      const currentOrder = currentBlock?.order ?? block.order;
      const newBlock = await createBlock(
        block.pageId,
        'numbered_list',
        { text: textAfterCursor, indent },
        currentOrder + 1
      );
      setFocusBlock(newBlock.id, 'start');
    },
    onChangeBlockType: changeBlockType,
    onFocusPreviousBlock: focusPreviousBlock,
    onFocusNextBlock: focusNextBlock,
    onPasteMultipleBlocks: pasteMultipleBlocks,
    onDeleteAndMergeToPrevious: async (currentText: string) => {
      // If empty and indented, outdent first
      if (!currentText.trim() && indent > 0) {
        await handleOutdent();
        return;
      }
      // Otherwise: backspace at start of a numbered list converts to paragraph
      // (preserving content). A subsequent backspace will then merge into the
      // previous block via the paragraph's own handler.
      await changeBlockType('paragraph', currentText, undefined, { cursorPosition: 'start' });
    },
    onIndent: handleIndent,
    onOutdent: handleOutdent,
    onPasteImage: pasteImage,
  });

  // Handle focus when this block is the focus target
  useEffect(() => {
    if (focusBlockId === block.id && editor) {
      if (typeof focusPosition === 'number') {
        editor.commands.focus();
        editor.commands.setTextSelection(focusPosition);
      } else if (focusPosition === 'start') {
        editor.commands.focus('start');
      } else {
        editor.commands.focus('end');
      }
      setFocusBlock(null);
    }
  }, [focusBlockId, focusPosition, block.id, editor, setFocusBlock]);

  return (
    <div className="flex items-start gap-2" style={{ paddingLeft: `${indent * 24}px` }}>
      <span className="text-notion-text select-none mt-0.5 min-w-[1rem] text-right tabular-nums">{displayNumber}.</span>
      <div className="flex-1 min-w-0 text-base text-notion-text leading-relaxed relative">
        <EditorContent editor={editor} />
        {editor && !readOnly && <FormatToolbar editor={editor} />}
        {!readOnly && slashMenu.isOpen && (
          <SlashCommandMenu
            query={slashMenu.query}
            position={slashMenu.position}
            onSelect={selectSlashCommand}
            onClose={closeSlashMenu}
          />
        )}
      </div>
    </div>
  );
}
