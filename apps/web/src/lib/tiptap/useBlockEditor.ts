import { useCallback, useRef, useEffect, useState } from 'react';
import { useEditor, Editor } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import type { Block, BlockContent, BlockType } from '@nonotion/shared';
import { useBlockStore } from '@/stores/blockStore';

interface SlashMenuState {
  isOpen: boolean;
  query: string;
  position: { top: number; left: number };
}

interface UseBlockEditorOptions {
  block: Block;
  placeholder?: string;
  headingLevel?: 1 | 2 | 3;
  onCreateBlockBelow?: (textAfterCursor: string) => Promise<void>;
  onChangeBlockType?: (newType: BlockType) => Promise<void>;
  onFocusPreviousBlock?: () => void;
  onFocusNextBlock?: () => void;
}

interface UseBlockEditorResult {
  editor: Editor | null;
  slashMenu: SlashMenuState;
  closeSlashMenu: () => void;
  selectSlashCommand: (type: BlockType) => void;
}

export function useBlockEditor({
  block,
  placeholder,
  headingLevel,
  onCreateBlockBelow,
  onChangeBlockType,
  onFocusPreviousBlock,
  onFocusNextBlock,
}: UseBlockEditorOptions): UseBlockEditorResult {
  const { updateBlock } = useBlockStore();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [slashMenu, setSlashMenu] = useState<SlashMenuState>({
    isOpen: false,
    query: '',
    position: { top: 0, left: 0 },
  });
  const slashStartPosRef = useRef<number | null>(null);
  const slashMenuOpenRef = useRef(false);

  // Keep ref in sync with state for use in extension closure
  useEffect(() => {
    slashMenuOpenRef.current = slashMenu.isOpen;
  }, [slashMenu.isOpen]);

  const saveContent = useCallback(
    (text: string) => {
      // Clear existing debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Debounce save by 500ms
      debounceRef.current = setTimeout(async () => {
        const content: BlockContent = headingLevel
          ? { text, level: headingLevel }
          : { text };

        await updateBlock(block.id, { content });
      }, 500);
    },
    [block.id, headingLevel, updateBlock]
  );

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const editorRef = useRef<Editor | null>(null);

  const closeSlashMenu = useCallback(() => {
    setSlashMenu({ isOpen: false, query: '', position: { top: 0, left: 0 } });
    slashStartPosRef.current = null;
  }, []);

  const selectSlashCommand = useCallback(
    async (type: BlockType) => {
      const currentEditor = editorRef.current;
      if (currentEditor && slashStartPosRef.current !== null) {
        // Delete the slash and query text (slash is at position 1, delete from 1 to cursor)
        const from = slashStartPosRef.current;
        const to = currentEditor.state.selection.from;
        currentEditor.chain().focus().deleteRange({ from, to }).run();

        // Cancel any pending debounced save
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }

        // Immediately save the cleaned content (without slash) to store
        const cleanedText = currentEditor.getText();
        const content: BlockContent = headingLevel
          ? { text: cleanedText, level: headingLevel }
          : { text: cleanedText };
        await updateBlock(block.id, { content });
      }
      closeSlashMenu();

      if (onChangeBlockType) {
        await onChangeBlockType(type);
        // Focus is handled by BlockWrapper setting focusBlockId after type change
      }
    },
    [closeSlashMenu, onChangeBlockType, block.id, headingLevel, updateBlock]
  );

  // Create keyboard extension
  const BlockKeyboardExtension = Extension.create({
    name: 'blockKeyboard',
    addKeyboardShortcuts() {
      return {
        Enter: ({ editor }) => {
          // If slash menu is open, don't handle Enter (let menu handle it)
          if (slashMenuOpenRef.current) {
            return true;
          }

          if (!onCreateBlockBelow) {
            return false;
          }

          // Get text after cursor
          const { from } = editor.state.selection;
          const docEnd = editor.state.doc.content.size - 1;
          const textAfter = from < docEnd ? editor.state.doc.textBetween(from, docEnd) : '';

          // Delete text after cursor from current block
          if (textAfter) {
            editor.commands.deleteRange({ from, to: docEnd });
          }

          // Call callback to create new block with the text
          onCreateBlockBelow(textAfter);
          return true;
        },
        'Shift-Enter': () => {
          // Insert hard break (newline within block)
          return false; // Let default behavior handle it
        },
        Escape: () => {
          if (slashMenuOpenRef.current) {
            closeSlashMenu();
            return true;
          }
          return false;
        },
        ArrowUp: ({ editor }) => {
          // If slash menu is open, let it handle navigation
          if (slashMenuOpenRef.current) {
            return false;
          }

          if (!onFocusPreviousBlock) {
            return false;
          }

          // Check if cursor is on the first line
          const { from } = editor.state.selection;
          const text = editor.getText();
          const firstNewlineIndex = text.indexOf('\n');

          // If no newlines, or cursor is before first newline, we're on first line
          // Position 1 is start of text, so cursor position - 1 = text index
          const textIndex = from - 1;
          if (firstNewlineIndex === -1 || textIndex <= firstNewlineIndex) {
            onFocusPreviousBlock();
            return true;
          }

          return false;
        },
        ArrowDown: ({ editor }) => {
          // If slash menu is open, let it handle navigation
          if (slashMenuOpenRef.current) {
            return false;
          }

          if (!onFocusNextBlock) {
            return false;
          }

          // Check if cursor is on the last line
          const { from } = editor.state.selection;
          const text = editor.getText();
          const lastNewlineIndex = text.lastIndexOf('\n');

          // If no newlines, or cursor is after last newline, we're on last line
          // Position 1 is start of text, so cursor position - 1 = text index
          const textIndex = from - 1;
          if (lastNewlineIndex === -1 || textIndex > lastNewlineIndex) {
            onFocusNextBlock();
            return true;
          }

          return false;
        },
      };
    },
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable most features, keep only basic text
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        dropcursor: false,
        gapcursor: false,
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
      BlockKeyboardExtension,
    ],
    content: block.content.text,
    onUpdate: ({ editor }) => {
      const text = editor.getText();
      saveContent(text);

      // Check for slash command
      const { from } = editor.state.selection;

      if (slashStartPosRef.current !== null) {
        // Slash menu is tracking - update query (text after the slash)
        // slashStartPosRef.current is position of "/" (1), so +1 gives position after "/"
        const queryStart = slashStartPosRef.current + 1;
        const query = from > queryStart ? editor.state.doc.textBetween(queryStart, from) : '';

        // Close on space or if backspaced past slash
        if (query.includes(' ') || from <= slashStartPosRef.current) {
          closeSlashMenu();
        } else {
          setSlashMenu((prev) => ({ ...prev, query }));
        }
      } else {
        // Check if we should open slash menu
        // Only at start of empty block when "/" is typed
        if (text === '/') {
          const coords = editor.view.coordsAtPos(from);
          // Position 1 is where the "/" character is in the document
          slashStartPosRef.current = 1;
          setSlashMenu({
            isOpen: true,
            query: '',
            position: { top: coords.bottom, left: coords.left },
          });
        }
      }
    },
    editorProps: {
      attributes: {
        class: 'outline-none',
      },
    },
  });

  // Keep ref in sync with editor
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  return { editor, slashMenu, closeSlashMenu, selectSlashCommand };
}
