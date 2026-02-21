import { useNavigate } from 'react-router-dom';
import { usePageStore } from '@/stores/pageStore';
import type { PageTreeNode } from '@nonotion/shared';
import PageTree from './PageTree';

export default function StarredSection() {
  const navigate = useNavigate();
  const { getStarredPages, getPageTree, currentPageId, starredExpandedNodes, toggleStarredExpanded } = usePageStore();

  const starredPages = getStarredPages();

  if (starredPages.length === 0) {
    return null;
  }

  // Build a lookup of page tree nodes so we can find children for starred pages
  const allTree = getPageTree();
  const treeNodeMap = new Map<string, PageTreeNode>();
  const indexTree = (nodes: PageTreeNode[]) => {
    for (const node of nodes) {
      treeNodeMap.set(node.id, node);
      indexTree(node.children);
    }
  };
  indexTree(allTree);

  return (
    <div className="px-2 py-2 border-b border-notion-border">
      <div className="px-2 py-1 text-xs font-medium text-notion-text-secondary uppercase">
        Starred
      </div>
      {starredPages.map((page) => {
        const treeNode = treeNodeMap.get(page.id);
        const hasChildren = treeNode ? treeNode.children.length > 0 : false;
        const isExpanded = starredExpandedNodes.has(page.id);

        return (
          <StarredItem
            key={page.id}
            page={page}
            treeNode={treeNode}
            hasChildren={hasChildren}
            isExpanded={isExpanded}
            isSelected={currentPageId === page.id}
            onNavigate={() => navigate(`/page/${page.id}`)}
            onToggle={() => toggleStarredExpanded(page.id)}
            starredExpandedNodes={starredExpandedNodes}
            toggleStarredExpanded={toggleStarredExpanded}
          />
        );
      })}
    </div>
  );
}

interface StarredItemProps {
  page: { id: string; title: string; icon: string | null };
  treeNode: PageTreeNode | undefined;
  hasChildren: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  onNavigate: () => void;
  onToggle: () => void;
  starredExpandedNodes: Set<string>;
  toggleStarredExpanded: (id: string) => void;
}

function StarredItem({ page, treeNode, hasChildren, isExpanded, isSelected, onNavigate, onToggle, starredExpandedNodes, toggleStarredExpanded }: StarredItemProps) {
  return (
    <div>
      <div
        className={`flex items-center px-1 py-0.5 rounded cursor-pointer ${
          isSelected ? 'bg-notion-hover' : 'hover:bg-notion-hover'
        }`}
        onClick={onNavigate}
      >
        {/* Toggle button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 ${
            hasChildren ? 'visible' : 'invisible'
          }`}
        >
          <svg
            className={`w-3 h-3 text-notion-text-secondary transition-transform ${
              isExpanded ? 'rotate-90' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>

        <span className="w-5 h-5 flex items-center justify-center text-sm">
          {page.icon || '📄'}
        </span>
        <span className="ml-1 text-sm text-notion-text truncate">
          {page.title || 'Untitled'}
        </span>
      </div>

      {/* Children — uses starred-specific expanded state */}
      {isExpanded && hasChildren && treeNode && (
        <PageTree
          nodes={treeNode.children}
          depth={1}
          expandedNodesOverride={starredExpandedNodes}
          toggleExpandedOverride={toggleStarredExpanded}
        />
      )}
    </div>
  );
}
