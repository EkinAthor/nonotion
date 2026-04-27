import { createContext, useContext } from 'react';
import type { BlockType, BlockContent } from '@nonotion/shared';

export interface PasteBlockData {
  type: BlockType;
  content: BlockContent;
}

export interface BlockContextValue {
  pageId: string;
  blockId: string;
  createBlockBelow: (initialText?: string) => Promise<string>;
  changeBlockType: (
    newType: BlockType,
    newText?: string,
    action?: string,
    options?: { startNumber?: number; cursorPosition?: 'start' | 'end' },
  ) => Promise<void>;
  focusPreviousBlock: () => void;
  focusNextBlock: () => void;
  pasteMultipleBlocks: (blocks: PasteBlockData[], textAfterCursor: string) => Promise<void>;
  deleteAndMergeToPrevious: (currentText: string) => Promise<void>;
  pasteImage: (file: File) => Promise<void>;
}

const BlockContext = createContext<BlockContextValue | null>(null);

export function BlockContextProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: BlockContextValue;
}) {
  return <BlockContext.Provider value={value}>{children}</BlockContext.Provider>;
}

export function useBlockContext(): BlockContextValue {
  const context = useContext(BlockContext);
  if (!context) {
    throw new Error('useBlockContext must be used within a BlockContextProvider');
  }
  return context;
}

export function useBlockContextOptional(): BlockContextValue | null {
  return useContext(BlockContext);
}
