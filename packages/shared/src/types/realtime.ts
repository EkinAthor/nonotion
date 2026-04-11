import type { Block } from './block.js';
import type { PropertyValue, KanbanCardOrder } from './database.js';

// ─── Event types ───────────────────────────────────────────────────────────

export type RealtimeEventType =
  | 'block_update'
  | 'block_create'
  | 'block_delete'
  | 'block_reorder'
  | 'row_update'
  | 'card_move';

// ─── Event payloads ────────────────────────────────────────────────────────

export interface BlockUpdatePayload {
  blockId: string;
  pageId: string;
  userId: string;
  block: Block;
}

export interface BlockCreatePayload {
  pageId: string;
  userId: string;
  block: Block;
}

export interface BlockDeletePayload {
  blockId: string;
  pageId: string;
  userId: string;
}

export interface BlockReorderPayload {
  pageId: string;
  userId: string;
  blocks: Block[];
}

export interface RowUpdatePayload {
  rowId: string;
  databaseId: string;
  userId: string;
  properties: Record<string, PropertyValue>;
  title?: string;
}

export interface CardMovePayload {
  rowId: string;
  databaseId: string;
  userId: string;
  targetOptionId: string | null;
  kanbanCardOrder?: KanbanCardOrder;
}

// ─── Presence ──────────────────────────────────────────────────────────────

export interface PresenceUser {
  userId: string;
  name: string;
  avatarUrl: string | null;
  color: string;
  activeBlockId: string | null;
  joinedAt: string;
}
