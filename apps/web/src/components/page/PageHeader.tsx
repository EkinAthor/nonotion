import { useState, useRef, useEffect } from 'react';
import type { Page } from '@nonotion/shared';
import { usePageStore } from '@/stores/pageStore';

interface PageHeaderProps {
  page: Page;
}

// Common emoji options for quick selection
const EMOJI_OPTIONS = ['📄', '📝', '📋', '📌', '📎', '🎯', '💡', '🚀', '⭐', '❤️', '🔥', '✨'];

export default function PageHeader({ page }: PageHeaderProps) {
  const { updatePage } = usePageStore();
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

  const handleTitleBlur = async () => {
    setIsEditingTitle(false);
    if (title !== page.title) {
      await updatePage(page.id, { title: title || 'Untitled' });
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleBlur();
    }
    if (e.key === 'Escape') {
      setTitle(page.title);
      setIsEditingTitle(false);
    }
  };

  const handleIconClick = () => {
    setShowEmojiPicker(!showEmojiPicker);
  };

  const handleEmojiSelect = async (emoji: string) => {
    await updatePage(page.id, { icon: emoji });
    setShowEmojiPicker(false);
  };

  const handleRemoveIcon = async () => {
    await updatePage(page.id, { icon: null });
    setShowEmojiPicker(false);
  };

  const handleToggleStar = async () => {
    await updatePage(page.id, { isStarred: !page.isStarred });
  };

  return (
    <div className="mb-4">
      {/* Icon and star row */}
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
            <div className="absolute top-full left-0 mt-1 p-2 bg-white rounded-lg shadow-lg border border-notion-border z-10">
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

        <button
          onClick={handleToggleStar}
          className={`p-1 rounded hover:bg-notion-hover ${
            page.isStarred ? 'text-yellow-500' : 'text-notion-text-secondary'
          }`}
          title={page.isStarred ? 'Remove from starred' : 'Add to starred'}
        >
          <svg
            className="w-5 h-5"
            fill={page.isStarred ? 'currentColor' : 'none'}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
            />
          </svg>
        </button>
      </div>

      {/* Title */}
      {isEditingTitle ? (
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
          onClick={() => setIsEditingTitle(true)}
          className="text-4xl font-bold text-notion-text cursor-text hover:bg-notion-hover rounded px-1 -mx-1"
        >
          {page.title || 'Untitled'}
        </h1>
      )}
    </div>
  );
}
