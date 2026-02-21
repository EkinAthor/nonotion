import { useState, useCallback, useEffect } from 'react';
import { BubbleMenu, type Editor } from '@tiptap/react';
import { TEXT_COLORS, BG_COLORS, type ColorOption } from '@/lib/formatting-colors';

interface FormatToolbarProps {
  editor: Editor;
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`px-2 py-1 text-sm rounded hover:bg-gray-100 ${
        active ? 'bg-gray-200 text-blue-600' : 'text-gray-700'
      }`}
      title={title}
    >
      {children}
    </button>
  );
}

function ColorPicker({
  colors,
  activeColor,
  onSelect,
  onClose,
  anchorRight,
}: {
  colors: ColorOption[];
  activeColor: string;
  onSelect: (color: string) => void;
  onClose: () => void;
  anchorRight?: boolean;
}) {
  return (
    <div
      className={`absolute top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 p-2 z-50 ${
        anchorRight ? 'right-0' : 'left-0'
      }`}
      style={{ width: '140px' }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="grid grid-cols-5 gap-1" style={{ width: '120px' }}>
        {colors.map((color) => (
          <button
            key={color.label}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(color.value);
              onClose();
            }}
            className={`w-6 h-6 rounded border flex-shrink-0 ${
              activeColor === color.value
                ? 'border-blue-500 ring-1 ring-blue-500'
                : 'border-gray-200 hover:border-gray-400'
            }`}
            style={{
              backgroundColor: color.value || '#ffffff',
            }}
            title={color.label}
          />
        ))}
      </div>
    </div>
  );
}

export default function FormatToolbar({ editor }: FormatToolbarProps) {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [showTextColor, setShowTextColor] = useState(false);
  const [showBgColor, setShowBgColor] = useState(false);

  // Force re-render on blur/focus so BubbleMenu re-evaluates shouldShow.
  // Without this, after a toolbar button click (which uses preventDefault to
  // keep the selection alive), BubbleMenu doesn't re-check isFocused when the
  // editor eventually blurs from clicking another block.
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const handler = () => forceUpdate((n) => n + 1);
    editor.on('blur', handler);
    editor.on('focus', handler);
    return () => {
      editor.off('blur', handler);
      editor.off('focus', handler);
    };
  }, [editor]);

  const closeDropdowns = useCallback(() => {
    setShowTextColor(false);
    setShowBgColor(false);
    setShowLinkInput(false);
  }, []);

  const handleLink = useCallback(() => {
    if (showLinkInput) {
      // Apply link
      if (linkUrl) {
        editor.chain().focus().setLink({ href: linkUrl }).run();
      } else {
        editor.chain().focus().unsetLink().run();
      }
      setShowLinkInput(false);
      setLinkUrl('');
    } else {
      // Open link input
      const existingHref = editor.getAttributes('link').href;
      setLinkUrl(existingHref || '');
      setShowLinkInput(true);
      setShowTextColor(false);
      setShowBgColor(false);
    }
  }, [editor, showLinkInput, linkUrl]);

  const handleTextColor = useCallback(
    (color: string) => {
      if (color) {
        editor.chain().focus().setColor(color).run();
      } else {
        editor.chain().focus().unsetColor().run();
      }
    },
    [editor]
  );

  const handleBgColor = useCallback(
    (color: string) => {
      if (color) {
        editor.chain().focus().setHighlight({ color }).run();
      } else {
        editor.chain().focus().unsetHighlight().run();
      }
    },
    [editor]
  );

  const activeTextColor = editor.getAttributes('textStyle').color || '';
  const activeBgColor = editor.getAttributes('highlight').color || '';

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{
        duration: 100,
        placement: 'top',
        onHide: closeDropdowns,
        maxWidth: 'none',
        popperOptions: {
          modifiers: [
            {
              name: 'preventOverflow',
              options: {
                boundary: 'viewport',
              },
            },
          ],
        },
      }}
      shouldShow={({ editor: ed, state }) => {
        // Only show if this editor is focused
        if (!ed.isFocused) return false;
        const { from, to, empty } = state.selection;
        if (empty) return false;
        // Don't show on node selections or when content is just whitespace
        const text = state.doc.textBetween(from, to, ' ');
        return text.trim().length > 0;
      }}
    >
      <div className="flex items-center gap-0.5 bg-white rounded-lg shadow-lg border border-gray-200 px-1 py-0.5">
        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold (Ctrl+B)"
        >
          <strong>B</strong>
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic (Ctrl+I)"
        >
          <em>I</em>
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline (Ctrl+U)"
        >
          <span className="underline">U</span>
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
          title="Inline Code (Ctrl+E)"
        >
          <span className="font-mono text-xs">&lt;/&gt;</span>
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-200 mx-0.5" />

        {/* Link button */}
        <div className="relative">
          <ToolbarButton
            active={editor.isActive('link')}
            onClick={handleLink}
            title="Link"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </ToolbarButton>
          {showLinkInput && (
            <div
              className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 p-2 z-50 flex gap-1"
              onMouseDown={(e) => e.preventDefault()}
            >
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleLink();
                  }
                  if (e.key === 'Escape') {
                    setShowLinkInput(false);
                  }
                }}
                placeholder="https://..."
                className="text-sm border border-gray-300 rounded px-2 py-1 w-48 outline-none focus:border-blue-500"
                autoFocus
              />
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleLink();
                }}
                className="text-sm bg-blue-500 text-white rounded px-2 py-1 hover:bg-blue-600"
              >
                OK
              </button>
              {editor.isActive('link') && (
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    editor.chain().focus().unsetLink().run();
                    setShowLinkInput(false);
                  }}
                  className="text-sm text-red-500 rounded px-2 py-1 hover:bg-red-50"
                >
                  Remove
                </button>
              )}
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-gray-200 mx-0.5" />

        {/* Text color */}
        <div className="relative">
          <ToolbarButton
            active={!!activeTextColor}
            onClick={() => {
              setShowTextColor(!showTextColor);
              setShowBgColor(false);
              setShowLinkInput(false);
            }}
            title="Text color"
          >
            <span style={{ color: activeTextColor || undefined }}>
              A
              <span
                className="block h-0.5 -mt-0.5"
                style={{ backgroundColor: activeTextColor || '#37352f' }}
              />
            </span>
          </ToolbarButton>
          {showTextColor && (
            <ColorPicker
              colors={TEXT_COLORS}
              activeColor={activeTextColor}
              onSelect={handleTextColor}
              onClose={() => setShowTextColor(false)}
            />
          )}
        </div>

        {/* Background color */}
        <div className="relative">
          <ToolbarButton
            active={!!activeBgColor}
            onClick={() => {
              setShowBgColor(!showBgColor);
              setShowTextColor(false);
              setShowLinkInput(false);
            }}
            title="Background color"
          >
            <span
              className="px-0.5 rounded"
              style={{ backgroundColor: activeBgColor || '#fbf3db' }}
            >
              A
            </span>
          </ToolbarButton>
          {showBgColor && (
            <ColorPicker
              colors={BG_COLORS}
              activeColor={activeBgColor}
              onSelect={handleBgColor}
              onClose={() => setShowBgColor(false)}
              anchorRight
            />
          )}
        </div>
      </div>
    </BubbleMenu>
  );
}
