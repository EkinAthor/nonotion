export interface Page {
  id: string; // "pg_xxxxx"
  title: string;
  ownerId: string; // "usr_xxxxx" - page owner
  parentId: string | null; // null = root page
  childIds: string[]; // Ordered children
  icon: string | null; // Emoji
  isStarred: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string;
  version: number; // For LWW sync
}

export interface CreatePageInput {
  title: string;
  parentId?: string | null;
  icon?: string | null;
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
