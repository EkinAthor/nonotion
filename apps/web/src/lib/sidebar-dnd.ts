import type { Page, PageTreeNode } from '@nonotion/shared';

export interface FlattenedItem {
  id: string;
  parentId: string | null;
  depth: number;
  index: number;
  node: PageTreeNode;
  isDatabaseRow: boolean;
  isDatabase: boolean;
}

export function flattenTree(
  nodes: PageTreeNode[],
  expandedNodes: Set<string>,
  parentId: string | null = null,
  depth = 0,
  parentIsDatabase = false,
): FlattenedItem[] {
  const result: FlattenedItem[] = [];

  nodes.forEach((node, index) => {
    result.push({
      id: node.id,
      parentId,
      depth,
      index,
      node,
      isDatabaseRow: parentIsDatabase,
      isDatabase: node.type === 'database',
    });

    if (expandedNodes.has(node.id) && node.children.length > 0) {
      result.push(
        ...flattenTree(
          node.children,
          expandedNodes,
          node.id,
          depth + 1,
          node.type === 'database',
        ),
      );
    }
  });

  return result;
}

const INDENT_WIDTH = 12;

export interface Projection {
  parentId: string | null;
  depth: number;
  /** Index within the target parent's children where the item should be inserted */
  insertIndex: number;
}

export function getProjection(
  flatItems: FlattenedItem[],
  activeId: string,
  overId: string,
  deltaX: number,
): Projection | null {
  // Build list without the active item and its descendants
  const activeIndex = flatItems.findIndex((item) => item.id === activeId);
  if (activeIndex === -1) return null;

  const descendantIds = new Set<string>();
  collectDescendantIds(activeId, flatItems, descendantIds);

  const projected = flatItems.filter(
    (item) => item.id !== activeId && !descendantIds.has(item.id),
  );

  const overIndex = projected.findIndex((item) => item.id === overId);
  if (overIndex === -1) return null;

  const overItem = projected[overIndex];

  // The item directly above the over position determines max depth
  // (we can nest one level deeper than the item above)
  const itemAbove = overIndex > 0 ? projected[overIndex - 1] : null;
  const maxDepth = itemAbove ? itemAbove.depth + 1 : 0;
  const minDepth = 0;

  const projectedDepth = Math.max(
    minDepth,
    Math.min(maxDepth, overItem.depth + Math.round(deltaX / INDENT_WIDTH)),
  );

  // Determine parentId from projected depth
  let parentId: string | null;
  let insertIndex: number;

  if (projectedDepth === 0) {
    parentId = null;
    // Count root items up to and including overIndex
    insertIndex = 0;
    for (let i = 0; i <= overIndex; i++) {
      if (projected[i].parentId === null) insertIndex++;
    }
  } else if (projectedDepth > overItem.depth) {
    // Become child of the over item
    parentId = overItem.id;
    insertIndex = 0;
  } else if (projectedDepth === overItem.depth) {
    // Sibling of over item
    parentId = overItem.parentId;
    // Find position among siblings
    insertIndex = overItem.index + 1;
  } else {
    // Walk up ancestors to find the right parent
    parentId = findAncestorAtDepth(overItem, projected, projectedDepth - 1);
    // Insert after the over item's subtree within that parent
    insertIndex = findInsertIndexForAncestor(parentId, overItem.id, projected);
  }

  return { parentId, depth: projectedDepth, insertIndex };
}

function findAncestorAtDepth(
  startItem: FlattenedItem,
  flatItems: FlattenedItem[],
  targetDepth: number,
): string | null {
  // Walk backwards through flat items to find the ancestor at the target depth
  const startIndex = flatItems.findIndex((item) => item.id === startItem.id);
  for (let i = startIndex; i >= 0; i--) {
    if (flatItems[i].depth === targetDepth) {
      return flatItems[i].id;
    }
  }
  return null;
}

function findInsertIndexForAncestor(
  parentId: string | null,
  afterItemId: string,
  flatItems: FlattenedItem[],
): number {
  // Find the afterItem in the parent's children ordering
  const afterIndex = flatItems.findIndex((item) => item.id === afterItemId);
  let insertIndex = 0;
  for (let i = 0; i <= afterIndex; i++) {
    if (flatItems[i].parentId === parentId) {
      insertIndex++;
    }
  }
  return insertIndex;
}

function collectDescendantIds(
  parentId: string,
  flatItems: FlattenedItem[],
  result: Set<string>,
): void {
  for (const item of flatItems) {
    if (item.parentId === parentId) {
      result.add(item.id);
      collectDescendantIds(item.id, flatItems, result);
    }
  }
}

export function getDescendantIds(
  pageId: string,
  pages: Map<string, Page>,
): Set<string> {
  const result = new Set<string>();
  const collect = (id: string) => {
    const page = pages.get(id);
    if (page) {
      for (const childId of page.childIds) {
        result.add(childId);
        collect(childId);
      }
    }
  };
  collect(pageId);
  return result;
}

export function isValidProjection(
  activeItem: FlattenedItem,
  projection: Projection,
  pages: Map<string, Page>,
): boolean {
  const { parentId } = projection;

  // Can't drop database row pages
  if (activeItem.isDatabaseRow) return false;

  // Can't drop onto self
  if (parentId === activeItem.id) return false;

  // Can't drop onto a descendant (circular)
  const descendants = getDescendantIds(activeItem.id, pages);
  if (parentId !== null && descendants.has(parentId)) return false;

  // Can't drop into a database
  if (parentId !== null) {
    const targetParent = pages.get(parentId);
    if (targetParent?.type === 'database') return false;
  }

  return true;
}
