import { useState, useRef, useEffect } from 'react';
import type { Page } from '@nonotion/shared';
import { usePageStore } from '@/stores/pageStore';
import { useBlockStore } from '@/stores/blockStore';

interface PageHeaderProps {
  page: Page;
  readOnly?: boolean;
}

// Common emoji options for quick selection
const EMOJI_OPTIONS = ['📄', '📝', '📋', '📌', '📎', '🎯', '💡', '🚀', '⭐', '❤️', '🔥', '✨'];

export default function PageHeader({ page, readOnly = false }: PageHeaderProps) {
  const { updatePage } = usePageStore();
  const { createBlock, setFocusBlock } = useBlockStore();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState(page.title);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(page.title);
  }, [page.title]);

  useEffect(() => {
    if (isEditingTitle && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
    if (title !== page.title) {
      updatePage(page.id, { title: title || 'Untitled' });
    }
  };

  const handleTitleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Save title first
      setIsEditingTitle(false);
      if (title !== page.title) {
        updatePage(page.id, { title: title || 'Untitled' });
      }
      // Create a new block at the beginning of the page and focus it
      // (await resolves instantly with temp block)
      const newBlock = await createBlock(page.id, 'paragraph', { text: '' }, 0);
      setFocusBlock(newBlock.id);
    }
    if (e.key === 'Escape') {
      setTitle(page.title);
      setIsEditingTitle(false);
    }
  };

  const handleIconClick = () => {
    if (readOnly) return;
    setShowEmojiPicker(!showEmojiPicker);
  };

  const handleEmojiSelect = (emoji: string) => {
    updatePage(page.id, { icon: emoji });
    setShowEmojiPicker(false);
  };

  const handleRemoveIcon = () => {
    updatePage(page.id, { icon: null });
    setShowEmojiPicker(false);
  };

  return (
    <div className="mb-4">
      {/* Icon row */}
      <div className="flex items-center gap-2 mb-2">
        <div className="relative">
          <button
            onClick={handleIconClick}
            className="text-5xl hover:bg-notion-hover rounded p-1 transition-colors"
            title="Change icon"
          >
            {page.icon || '📄'}
          </button>

          {showEmojiPicker && (
            <div className="absolute top-full left-0 mt-1 p-2 bg-white rounded-lg shadow-lg border border-notion-border z-10 w-72">
              <div className="grid grid-cols-6 gap-1">
                {EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleEmojiSelect(emoji)}
                    className="text-xl p-1 hover:bg-notion-hover rounded"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              {page.icon && (
                <button
                  onClick={handleRemoveIcon}
                  className="w-full mt-2 px-2 py-1 text-sm text-notion-text-secondary hover:bg-notion-hover rounded"
                >
                  Remove icon
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Title */}
      {isEditingTitle && !readOnly ? (
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          onKeyDown={handleTitleKeyDown}
          className="w-full text-4xl font-bold text-notion-text bg-transparent outline-none"
          placeholder="Untitled"
        />
      ) : (
        <h1
          onClick={() => !readOnly && setIsEditingTitle(true)}
          className={`text-4xl font-bold text-notion-text rounded px-1 -mx-1 ${readOnly ? '' : 'cursor-text hover:bg-notion-hover'}`}
        >
          {page.title || 'Untitled'}
        </h1>
      )}

    </div>
  );
}
