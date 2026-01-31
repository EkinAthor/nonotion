import { EditorContent } from '@tiptap/react';
import type { Block } from '@nonotion/shared';
import { useBlockEditor } from '@/lib/tiptap/useBlockEditor';

interface HeadingEditProps {
  block: Block;
}

export default function HeadingEdit({ block }: HeadingEditProps) {
  const editor = useBlockEditor({
    block,
    placeholder: 'Heading 1',
    headingLevel: 1,
  });

  return (
    <div className="text-3xl font-bold text-notion-text">
      <EditorContent editor={editor} />
    </div>
  );
}
