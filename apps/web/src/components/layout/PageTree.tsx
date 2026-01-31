import type { PageTreeNode } from '@nonotion/shared';
import PageTreeItem from './PageTreeItem';

interface PageTreeProps {
  nodes: PageTreeNode[];
  depth: number;
}

export default function PageTree({ nodes, depth }: PageTreeProps) {
  return (
    <div>
      {nodes.map((node) => (
        <PageTreeItem key={node.id} node={node} depth={depth} />
      ))}
    </div>
  );
}
