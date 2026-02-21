import type { PageTreeNode } from '@nonotion/shared';
import PageTreeItem from './PageTreeItem';

interface PageTreeProps {
  nodes: PageTreeNode[];
  depth: number;
  expandedNodesOverride?: Set<string>;
  toggleExpandedOverride?: (id: string) => void;
}

export default function PageTree({ nodes, depth, expandedNodesOverride, toggleExpandedOverride }: PageTreeProps) {
  return (
    <div>
      {nodes.map((node) => (
        <PageTreeItem
          key={node.id}
          node={node}
          depth={depth}
          expandedNodesOverride={expandedNodesOverride}
          toggleExpandedOverride={toggleExpandedOverride}
        />
      ))}
    </div>
  );
}
