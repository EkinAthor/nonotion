import type { Block, BlockContent, BlockType } from '@nonotion/shared';

export type ScopeId = string;

export type SelectionState =
  | { kind: 'tiptap'; blockId: string; from: number; to: number }
  | { kind: 'block-focus'; blockId: string; position?: 'start' | 'end' | number }
  | null;

export type EntryPayload =
  | {
      kind: 'block.create';
      pageId: string;
      block: Block;
    }
  | {
      kind: 'block.delete';
      pageId: string;
      block: Block;
    }
  | {
      kind: 'block.reorder';
      pageId: string;
      beforeIds: string[];
      afterIds: string[];
    }
  | {
      kind: 'block.content';
      blockId: string;
      before: BlockContent;
      after: BlockContent;
    }
  | {
      kind: 'block.changeType';
      blockId: string;
      before: { type: BlockType; content: BlockContent };
      after: { type: BlockType; content: BlockContent };
    }
  | {
      kind: 'composite';
      entries: UndoEntry[];
    };

export interface UndoEntry {
  id: string;
  scopeId: ScopeId;
  payload: EntryPayload;
  label: string;
  timestamp: number;
  groupKey?: string;
  selectionBefore: SelectionState;
  selectionAfter: SelectionState;
}

export type EntryDirection = 'undo' | 'redo';

export interface Executor {
  /** Returns true if this executor handles the entry's payload kind. */
  matches(entry: UndoEntry): boolean;
  /** Apply the entry in the given direction. Throws to signal failure. */
  apply(entry: UndoEntry, direction: EntryDirection): Promise<void>;
}
