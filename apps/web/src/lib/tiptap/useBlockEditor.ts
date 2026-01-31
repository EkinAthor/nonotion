import { useCallback, useRef, useEffect } from 'react';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import type { Block, BlockContent } from '@nonotion/shared';
import { useBlockStore } from '@/stores/blockStore';

interface UseBlockEditorOptions {
  block: Block;
  placeholder?: string;
  headingLevel?: 1;
}

export function useBlockEditor({ block, placeholder, headingLevel }: UseBlockEditorOptions) {
  const { updateBlock } = useBlockStore();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

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
    ],
    content: block.content.text,
    onUpdate: ({ editor }) => {
      const text = editor.getText();
      saveContent(text);
    },
    editorProps: {
      attributes: {
        class: 'outline-none',
      },
    },
  });

  return editor;
}
