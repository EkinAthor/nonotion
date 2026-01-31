import { useEffect } from 'react';
import { EditorContent } from '@tiptap/react';
import type { Block } from '@nonotion/shared';
import { useBlockEditor } from '@/lib/tiptap/useBlockEditor';
import { useBlockContext } from '@/contexts/BlockContext';
import { useBlockStore } from '@/stores/blockStore';
import SlashCommandMenu from '../SlashCommandMenu';

interface HeadingEditProps {
  block: Block;
}

export default function Heading2Edit({ block }: HeadingEditProps) {
  const { createBlockBelow, changeBlockType, focusPreviousBlock, focusNextBlock } = useBlockContext();
  const { focusBlockId, setFocusBlock } = useBlockStore();

  const { editor, slashMenu, closeSlashMenu, selectSlashCommand } = useBlockEditor({
    block,
    placeholder: 'Heading 2',
    headingLevel: 2,
    onCreateBlockBelow: async (textAfterCursor) => {
      await createBlockBelow(textAfterCursor);
    },
    onChangeBlockType: changeBlockType,
    onFocusPreviousBlock: focusPreviousBlock,
    onFocusNextBlock: focusNextBlock,
  });

  // Handle focus when this block is the focus target
  useEffect(() => {
    if (focusBlockId === block.id && editor) {
      editor.commands.focus('end');
      setFocusBlock(null);
    }
  }, [focusBlockId, block.id, editor, setFocusBlock]);

  return (
    <div className="text-2xl font-bold text-notion-text relative">
      <EditorContent editor={editor} />
      {slashMenu.isOpen && (
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
