import { useEffect } from 'react';
import { EditorContent } from '@tiptap/react';
import type { Block } from '@nonotion/shared';
import { useBlockEditor } from '@/lib/tiptap/useBlockEditor';
import { useBlockContext } from '@/contexts/BlockContext';
import { useBlockStore } from '@/stores/blockStore';
import SlashCommandMenu from '../SlashCommandMenu';
import FormatToolbar from '../FormatToolbar';

interface HeadingEditProps {
  block: Block;
  readOnly?: boolean;
}

export default function HeadingEdit({ block, readOnly = false }: HeadingEditProps) {
  const { createBlockBelow, changeBlockType, focusPreviousBlock, focusNextBlock, pasteMultipleBlocks, deleteAndMergeToPrevious, pasteImage } = useBlockContext();
  const { focusBlockId, focusPosition, setFocusBlock } = useBlockStore();

  const { editor, slashMenu, closeSlashMenu, selectSlashCommand } = useBlockEditor({
    block,
    placeholder: readOnly ? '' : 'Heading 1',
    headingLevel: 1,
    readOnly,
    onCreateBlockBelow: async (textAfterCursor) => {
      await createBlockBelow(textAfterCursor);
    },
    onChangeBlockType: changeBlockType,
    onFocusPreviousBlock: focusPreviousBlock,
    onFocusNextBlock: focusNextBlock,
    onPasteMultipleBlocks: pasteMultipleBlocks,
    onDeleteAndMergeToPrevious: deleteAndMergeToPrevious,
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
    <div className="text-3xl font-bold text-notion-text relative">
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
  );
}
