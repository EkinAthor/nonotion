import { useState, useRef, useEffect } from 'react';
import type { Page } from '@nonotion/shared';
import { usePageStore } from '@/stores/pageStore';
import { useBlockStore } from '@/stores/blockStore';
import type { EmojiItem } from '@/lib/emoji/emoji-data';
import { recordEmojiUsage } from '@/lib/emoji/emoji-usage';
import { useInputEmojiTrigger } from '@/lib/emoji/useInputEmojiTrigger';
import EmojiMenu from '@/components/blocks/EmojiMenu';
import EmojiPickerPopover from '@/components/common/EmojiPickerPopover';

interface PageHeaderProps {
  page: Page;
  readOnly?: boolean;
}

export default function PageHeader({ page, readOnly = false }: PageHeaderProps) {
  const { updatePage } = usePageStore();
  const { createBlock, setFocusBlock } = useBlockStore();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState(page.title);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const iconButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setTitle(page.title);
  }, [page.title]);

  useEffect(() => {
    if (isEditingTitle && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingTitle]);

  // ":" emoji trigger for the title input (same emoji set as text blocks)
  const emojiTrigger = useInputEmojiTrigger({
    inputRef,
    onValueChange: (next, caret) => {
      setTitle(next);
      requestAnimationFrame(() => inputRef.current?.setSelectionRange(caret, caret));
    },
  });

  const handleTitleBlur = () => {
    emojiTrigger.closeEmojiMenu();
    setIsEditingTitle(false);
    if (title !== page.title) {
      updatePage(page.id, { title: title || 'Untitled' });
    }
  };

  const handleTitleKeyDown = async (e: React.KeyboardEvent) => {
    // While the emoji menu is open its document-level listener owns
    // Enter/Escape/arrows — don't save the title or revert
    if (emojiTrigger.handleKeyDownCapture(e)) return;
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

  const handleEmojiSelect = (item: EmojiItem) => {
    updatePage(page.id, { icon: item.char });
    recordEmojiUsage(item.id);
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
            ref={iconButtonRef}
            onClick={handleIconClick}
            className="text-5xl hover:bg-notion-hover rounded p-1 transition-colors"
            title="Change icon"
          >
            {page.icon || '📄'}
          </button>

          {showEmojiPicker && (
            <EmojiPickerPopover
              onSelect={handleEmojiSelect}
              onRemove={page.icon ? handleRemoveIcon : undefined}
              onClose={() => setShowEmojiPicker(false)}
              anchorRef={iconButtonRef}
            />
          )}
        </div>
      </div>

      {/* Title */}
      {isEditingTitle && !readOnly ? (
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            emojiTrigger.evaluate(e.target.value, e.target.selectionStart);
          }}
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

      {emojiTrigger.emojiMenu.isOpen && (
        <EmojiMenu
          query={emojiTrigger.emojiMenu.query}
          position={emojiTrigger.emojiMenu.position}
          onSelect={emojiTrigger.insertEmoji}
          onClose={emojiTrigger.closeEmojiMenu}
        />
      )}
    </div>
  );
}
