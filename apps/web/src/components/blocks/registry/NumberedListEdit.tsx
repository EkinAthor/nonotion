import { useEffect, useMemo, useCallback } from 'react';
import { EditorContent } from '@tiptap/react';
import type { Block, NumberedListContent } from '@nonotion/shared';
import { useBlockEditor } from '@/lib/tiptap/useBlockEditor';
import { useBlockContext } from '@/contexts/BlockContext';
import { useBlockStore } from '@/stores/blockStore';
import SlashCommandMenu from '../SlashCommandMenu';
import FormatToolbar from '../FormatToolbar';

const MAX_INDENT = 4;

interface NumberedListEditProps {
  block: Block;
  readOnly?: boolean;
}

export default function NumberedListEdit({ block, readOnly = false }: NumberedListEditProps) {
  const { changeBlockType, focusPreviousBlock, focusNextBlock, pasteMultipleBlocks, deleteAndMergeToPrevious } = useBlockContext();
  const { focusBlockId, focusPosition, setFocusBlock, getBlocksForPage, updateBlock } = useBlockStore();

  const content = block.content as NumberedListContent;
  const indent = content.indent ?? 0;

  const handleIndent = useCallback(async () => {
    if (indent < MAX_INDENT) {
      await updateBlock(block.id, {
        content: { ...content, indent: indent + 1 },
      });
    }
  }, [block.id, content, indent, updateBlock]);

  const handleOutdent = useCallback(async () => {
    if (indent > 0) {
      await updateBlock(block.id, {
        content: { ...content, indent: indent - 1 },
      });
    }
  }, [block.id, content, indent, updateBlock]);

  // Calculate the display number based on consecutive numbered_list blocks at the same indent level
  const displayNumber = useMemo(() => {
    const blocks = getBlocksForPage(block.pageId);
    const sorted = [...blocks].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex(b => b.id === block.id);

    let count = 1;
    for (let i = idx - 1; i >= 0; i--) {
      const prevBlock = sorted[i];
      if (prevBlock.type !== 'numbered_list') break;

      const prevContent = prevBlock.content as NumberedListContent;
      const prevIndent = prevContent.indent ?? 0;

      // Only count blocks at the same indent level
      if (prevIndent === indent) {
        count++;
      } else if (prevIndent < indent) {
        // We've hit a parent level, stop counting
        break;
      }
      // If prevIndent > indent, it's a child, skip but continue
    }
    return count;
  }, [block.pageId, block.id, indent, getBlocksForPage]);

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
      setFocusBlock(newBlock.id);
    },
    onChangeBlockType: changeBlockType,
    onFocusPreviousBlock: focusPreviousBlock,
    onFocusNextBlock: focusNextBlock,
    onPasteMultipleBlocks: pasteMultipleBlocks,
    onDeleteAndMergeToPrevious: async (currentText: string) => {
      // If empty and indented, outdent instead of merging
      if (!currentText.trim() && indent > 0) {
        await handleOutdent();
        return;
      }
      // If empty at root level, convert to paragraph
      if (!currentText.trim()) {
        await changeBlockType('paragraph');
        return;
      }
      await deleteAndMergeToPrevious(currentText);
    },
    onIndent: handleIndent,
    onOutdent: handleOutdent,
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
      <span className="text-notion-text select-none mt-0.5 min-w-[1.5rem] text-right tabular-nums">{displayNumber}.</span>
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
