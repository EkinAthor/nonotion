import { useState, useCallback, useEffect, useRef } from 'react';
import { useBlockStore } from '@/stores/blockStore';
import { getEditors } from '@/stores/editorRegistry';
import { TEXT_COLORS, BG_COLORS, type ColorOption } from '@/lib/formatting-colors';

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
  onSelect,
  onClose,
}: {
  colors: ColorOption[];
  onSelect: (color: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 p-2 z-50"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="grid grid-cols-5 gap-1">
        {colors.map((color) => (
          <button
            key={color.label}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(color.value);
              onClose();
            }}
            className="w-6 h-6 rounded border border-gray-200 hover:border-gray-400"
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

interface CrossBlockFormatToolbarProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export default function CrossBlockFormatToolbar({ containerRef }: CrossBlockFormatToolbarProps) {
  const selectedBlockIds = useBlockStore((state) => state.selectedBlockIds);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [showTextColor, setShowTextColor] = useState(false);
  const [showBgColor, setShowBgColor] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Calculate position above selected blocks
  useEffect(() => {
    if (selectedBlockIds.size === 0) {
      setPosition(null);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    // Find the first selected block element
    let minTop = Infinity;
    let left = 0;

    selectedBlockIds.forEach((blockId) => {
      const el = container.querySelector(`[data-block-id="${blockId}"]`);
      if (el) {
        const rect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        if (rect.top < minTop) {
          minTop = rect.top;
          left = rect.left - containerRect.left + rect.width / 2;
        }
      }
    });

    if (minTop !== Infinity) {
      const containerRect = container.getBoundingClientRect();
      setPosition({
        top: minTop - containerRect.top - 44,
        left: Math.max(left - 120, 0),
      });
    }
  }, [selectedBlockIds, containerRef]);

  const applyToSelected = useCallback(
    (action: 'bold' | 'italic' | 'underline' | 'code') => {
      const editors = getEditors();
      selectedBlockIds.forEach((blockId) => {
        const editor = editors.get(blockId);
        if (editor) {
          switch (action) {
            case 'bold':
              editor.chain().selectAll().toggleBold().run();
              break;
            case 'italic':
              editor.chain().selectAll().toggleItalic().run();
              break;
            case 'underline':
              editor.chain().selectAll().toggleUnderline().run();
              break;
            case 'code':
              editor.chain().selectAll().toggleCode().run();
              break;
          }
        }
      });
    },
    [selectedBlockIds]
  );

  const applyTextColor = useCallback(
    (color: string) => {
      const editors = getEditors();
      selectedBlockIds.forEach((blockId) => {
        const editor = editors.get(blockId);
        if (editor) {
          if (color) {
            editor.chain().selectAll().setColor(color).run();
          } else {
            editor.chain().selectAll().unsetColor().run();
          }
        }
      });
    },
    [selectedBlockIds]
  );

  const applyBgColor = useCallback(
    (color: string) => {
      const editors = getEditors();
      selectedBlockIds.forEach((blockId) => {
        const editor = editors.get(blockId);
        if (editor) {
          if (color) {
            editor.chain().selectAll().setHighlight({ color }).run();
          } else {
            editor.chain().selectAll().unsetHighlight().run();
          }
        }
      });
    },
    [selectedBlockIds]
  );

  if (selectedBlockIds.size === 0 || !position) {
    return null;
  }

  return (
    <div
      ref={toolbarRef}
      className="absolute z-50"
      style={{ top: position.top, left: position.left }}
    >
      <div className="flex items-center gap-0.5 bg-white rounded-lg shadow-lg border border-gray-200 px-1 py-0.5">
        <ToolbarButton
          active={false}
          onClick={() => applyToSelected('bold')}
          title="Bold"
        >
          <strong>B</strong>
        </ToolbarButton>

        <ToolbarButton
          active={false}
          onClick={() => applyToSelected('italic')}
          title="Italic"
        >
          <em>I</em>
        </ToolbarButton>

        <ToolbarButton
          active={false}
          onClick={() => applyToSelected('underline')}
          title="Underline"
        >
          <span className="underline">U</span>
        </ToolbarButton>

        <ToolbarButton
          active={false}
          onClick={() => applyToSelected('code')}
          title="Inline Code"
        >
          <span className="font-mono text-xs">&lt;/&gt;</span>
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-200 mx-0.5" />

        {/* Text color */}
        <div className="relative">
          <ToolbarButton
            active={false}
            onClick={() => {
              setShowTextColor(!showTextColor);
              setShowBgColor(false);
            }}
            title="Text color"
          >
            A<span className="block h-0.5 -mt-0.5 bg-gray-700" />
          </ToolbarButton>
          {showTextColor && (
            <ColorPicker
              colors={TEXT_COLORS}
              onSelect={(color) => applyTextColor(color)}
              onClose={() => setShowTextColor(false)}
            />
          )}
        </div>

        {/* Background color */}
        <div className="relative">
          <ToolbarButton
            active={false}
            onClick={() => {
              setShowBgColor(!showBgColor);
              setShowTextColor(false);
            }}
            title="Background color"
          >
            <span className="px-0.5 rounded" style={{ backgroundColor: '#fbf3db' }}>
              A
            </span>
          </ToolbarButton>
          {showBgColor && (
            <ColorPicker
              colors={BG_COLORS}
              onSelect={(color) => applyBgColor(color)}
              onClose={() => setShowBgColor(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
