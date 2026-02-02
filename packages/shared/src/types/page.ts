import type { DatabaseSchema, PropertyValue } from './database.js';

export type PageType = 'document' | 'database';

export interface Page {
  id: string; // "pg_xxxxx"
  title: string;
  type: PageType; // 'document' (default) or 'database'
  ownerId: string; // "usr_xxxxx" - page owner
  parentId: string | null; // null = root page
  childIds: string[]; // Ordered children
  icon: string | null; // Emoji
  isStarred: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string;
  version: number; // For LWW sync
  databaseSchema?: DatabaseSchema; // Only for type: 'database'
  properties?: Record<string, PropertyValue>; // For database row pages
}

export interface CreatePageInput {
  title: string;
  type?: PageType;
  parentId?: string | null;
  icon?: string | null;
  databaseSchema?: DatabaseSchema; // For creating database pages
  properties?: Record<string, PropertyValue>; // For creating row pages
}

export interface UpdatePageInput {
  title?: string;
  parentId?: string | null;
  icon?: string | null;
  isStarred?: boolean;
  childIds?: string[];
}

export interface PageTreeNode extends Page {
  children: PageTreeNode[];
}
