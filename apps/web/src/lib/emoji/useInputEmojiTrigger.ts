// ":" emoji trigger for plain <input> surfaces (page title; reusable for
// other inputs like the database TitleCell later). The TipTap surface has its
// own trigger in useBlockEditor.ts — this hook mirrors its rules: the ":"
// must be at word start (start-of-text or after whitespace) and have ≥1
// non-space, non-colon query char, with the caret right after the query.

import { useCallback, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { EmojiItem } from './emoji-data';
import { recordEmojiUsage } from './emoji-usage';

export interface InputEmojiMenuState {
  isOpen: boolean;
  query: string;
  position: { top: number; left: number };
}

const INPUT_TRIGGER_RE = /(^|\s):([^\s:]+)$/;

const CLOSED: InputEmojiMenuState = { isOpen: false, query: '', position: { top: 0, left: 0 } };

// Module-level canvas for caret x measurement (cheap, no DOM insertion)
let measureCtx: CanvasRenderingContext2D | null = null;
function measureTextWidth(text: string, font: string): number | null {
  try {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    if (!measureCtx) return null;
    measureCtx.font = font;
    return measureCtx.measureText(text).width;
  } catch {
    return null;
  }
}

export function useInputEmojiTrigger(opts: {
  inputRef: RefObject<HTMLInputElement>;
  /** Receives the spliced value and the caret position to restore */
  onValueChange: (next: string, caret: number) => void;
}) {
  const { inputRef, onValueChange } = opts;
  const [emojiMenu, setEmojiMenu] = useState<InputEmojiMenuState>(CLOSED);
  const colonIndexRef = useRef<number | null>(null);

  const closeEmojiMenu = useCallback(() => {
    setEmojiMenu(CLOSED);
    colonIndexRef.current = null;
  }, []);

  /** Call from the input's onChange with the fresh value + selectionStart */
  const evaluate = useCallback(
    (value: string, selectionStart: number | null) => {
      const caret = selectionStart ?? value.length;
      const match = INPUT_TRIGGER_RE.exec(value.slice(0, caret));
      if (!match) {
        closeEmojiMenu();
        return;
      }
      const query = match[2];
      const colonIndex = caret - query.length - 1;
      colonIndexRef.current = colonIndex;

      const input = inputRef.current;
      let top = 0;
      let left = 0;
      if (input) {
        const rect = input.getBoundingClientRect();
        top = rect.bottom + 4;
        left = rect.left;
        // Approximate the colon's x by measuring the text before it (ignores
        // letter-spacing — cosmetic only; the menu clamps to the viewport)
        const width = measureTextWidth(
          value.slice(0, colonIndex),
          getComputedStyle(input).font
        );
        if (width !== null) {
          left = Math.min(rect.left + width, rect.right - 40);
        }
      }
      setEmojiMenu({ isOpen: true, query, position: { top, left } });
    },
    [inputRef, closeEmojiMenu]
  );

  const insertEmoji = useCallback(
    (item: EmojiItem) => {
      const input = inputRef.current;
      const colonIndex = colonIndexRef.current;
      const query = emojiMenu.query;
      closeEmojiMenu();
      if (!input || colonIndex === null) return;
      const value = input.value;
      const next =
        value.slice(0, colonIndex) + item.char + value.slice(colonIndex + 1 + query.length);
      onValueChange(next, colonIndex + item.char.length);
      recordEmojiUsage(item.id);
    },
    [inputRef, emojiMenu.query, closeEmojiMenu, onValueChange]
  );

  /**
   * Call first in the input's onKeyDown. Returns true when the key belongs to
   * the open menu (whose document-level listener performs the action) and the
   * input's own semantics must not run.
   */
  const handleKeyDownCapture = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!emojiMenu.isOpen) return false;
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        return true;
      }
      return false;
    },
    [emojiMenu.isOpen]
  );

  return { emojiMenu, closeEmojiMenu, insertEmoji, evaluate, handleKeyDownCapture };
}
