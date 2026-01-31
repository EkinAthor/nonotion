import { EditorContent } from '@tiptap/react';
import type { Block } from '@nonotion/shared';
import { useBlockEditor } from '@/lib/tiptap/useBlockEditor';

interface ParagraphEditProps {
  block: Block;
}

export default function ParagraphEdit({ block }: ParagraphEditProps) {
  const editor = useBlockEditor({
    block,
    placeholder: 'Type something...',
  });

  return (
    <div className="text-base text-notion-text leading-relaxed">
      <EditorContent editor={editor} />
    </div>
  );
}
