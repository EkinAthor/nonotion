import { useEffect, useCallback } from 'react';
import { EditorContent } from '@tiptap/react';
import type { Block, ChecklistContent } from '@nonotion/shared';
import { useBlockEditor } from '@/lib/tiptap/useBlockEditor';
import { useBlockContext } from '@/contexts/BlockContext';
import { useBlockStore } from '@/stores/blockStore';
import SlashCommandMenu from '../SlashCommandMenu';
import FormatToolbar from '../FormatToolbar';

const MAX_INDENT = 4;

interface ChecklistEditProps {
  block: Block;
  readOnly?: boolean;
}

export default function ChecklistEdit({ block, readOnly = false }: ChecklistEditProps) {
  const { changeBlockType, focusPreviousBlock, focusNextBlock, pasteMultipleBlocks, deleteAndMergeToPrevious } = useBlockContext();
  const { focusBlockId, focusPosition, setFocusBlock, updateBlock } = useBlockStore();

  const content = block.content as ChecklistContent;
  const isChecked = content.checked ?? false;
  const indent = content.indent ?? 0;

  const handleToggleCheck = useCallback(async () => {
    await updateBlock(block.id, {
      content: { ...content, checked: !isChecked },
    });
  }, [block.id, content, isChecked, updateBlock]);

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

  const { editor, slashMenu, closeSlashMenu, selectSlashCommand } = useBlockEditor({
    block,
    placeholder: readOnly ? '' : 'To-do',
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
      // Otherwise create a new checklist block with same indent
      const { createBlock, setFocusBlock, getBlockById } = useBlockStore.getState();
      const currentBlock = getBlockById(block.id);
      const currentOrder = currentBlock?.order ?? block.order;
      const newBlock = await createBlock(
        block.pageId,
        'checklist',
        { text: textAfterCursor, checked: false, indent },
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
      <button
        type="button"
        onClick={handleToggleCheck}
        disabled={readOnly}
        className={`mt-1 w-4 h-4 rounded border flex items-center justify-center transition-colors
          ${isChecked
            ? 'bg-blue-500 border-blue-500 text-white'
            : 'border-gray-300 hover:border-gray-400 bg-white'
          }
          ${readOnly ? 'cursor-default' : 'cursor-pointer'}
        `}
        aria-label={isChecked ? 'Mark as incomplete' : 'Mark as complete'}
      >
        {isChecked && (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <div className={`flex-1 min-w-0 text-base leading-relaxed relative ${isChecked ? 'text-notion-text-secondary line-through' : 'text-notion-text'}`}>
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
