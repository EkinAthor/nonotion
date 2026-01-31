import { useEffect } from 'react';
import { EditorContent } from '@tiptap/react';
import type { Block } from '@nonotion/shared';
import { useBlockEditor } from '@/lib/tiptap/useBlockEditor';
import { useBlockContext } from '@/contexts/BlockContext';
import { useBlockStore } from '@/stores/blockStore';
import SlashCommandMenu from '../SlashCommandMenu';

interface ParagraphEditProps {
  block: Block;
}

export default function ParagraphEdit({ block }: ParagraphEditProps) {
  const { createBlockBelow, changeBlockType, focusPreviousBlock, focusNextBlock } = useBlockContext();
  const { focusBlockId, setFocusBlock } = useBlockStore();

  const { editor, slashMenu, closeSlashMenu, selectSlashCommand } = useBlockEditor({
    block,
    placeholder: "Type '/' for commands...",
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
    <div className="text-base text-notion-text leading-relaxed relative">
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
