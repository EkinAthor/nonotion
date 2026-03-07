import type { PageTreeNode } from '@nonotion/shared';

export interface FlattenedItem {
  id: string;
  parentId: string | null;
  depth: number;
  index: number;
  node: PageTreeNode;
}

export function flattenTree(
  nodes: PageTreeNode[],
  expandedNodes: Set<string>,
  parentId: string | null = null,
  depth = 0,
): FlattenedItem[] {
  const result: FlattenedItem[] = [];

  nodes.forEach((node, index) => {
    result.push({ id: node.id, parentId, depth, index, node });

    if (expandedNodes.has(node.id) && node.children.length > 0) {
      result.push(...flattenTree(node.children, expandedNodes, node.id, depth + 1));
    }
  });

  return result;
}

