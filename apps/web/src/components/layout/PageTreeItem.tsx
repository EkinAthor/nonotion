import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PageTreeNode } from '@nonotion/shared';
import { usePageStore } from '@/stores/pageStore';
import PageTree from './PageTree';

interface PageTreeItemProps {
  node: PageTreeNode;
  depth: number;
}

export default function PageTreeItem({ node, depth }: PageTreeItemProps) {
  const navigate = useNavigate();
  const { currentPageId, toggleExpanded, expandedNodes, createPage, deletePage } =
    usePageStore();
  const [showActions, setShowActions] = useState(false);

  const isExpanded = expandedNodes.has(node.id);
  const isSelected = currentPageId === node.id;
  const hasChildren = node.children.length > 0;

  const handleClick = () => {
    navigate(`/page/${node.id}`);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleExpanded(node.id);
  };

  const handleAddChild = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const page = await createPage({ title: 'Untitled', parentId: node.id });
    if (!isExpanded) {
      toggleExpanded(node.id);
    }
    navigate(`/page/${page.id}`);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete "${node.title}"?`)) {
      await deletePage(node.id);
      if (isSelected) {
        navigate('/');
      }
    }
  };

  return (
    <div>
      <div
        className={`flex items-center px-1 py-0.5 rounded cursor-pointer group ${
          isSelected ? 'bg-notion-hover' : 'hover:bg-notion-hover'
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={handleClick}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {/* Toggle/Expand button */}
        <button
          onClick={handleToggle}
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

        {/* Icon */}
        <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-sm">
          {node.icon || (node.type === 'database' ? '🗃️' : '📄')}
        </span>

        {/* Title */}
        <span className="flex-1 ml-1 text-sm text-notion-text truncate">
          {node.title || 'Untitled'}
        </span>

        {/* Actions */}
        {showActions && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleAddChild}
              className="p-0.5 rounded hover:bg-gray-200"
              title="Add subpage"
            >
              <svg
                className="w-3.5 h-3.5 text-notion-text-secondary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
            <button
              onClick={handleDelete}
              className="p-0.5 rounded hover:bg-gray-200"
              title="Delete"
            >
              <svg
                className="w-3.5 h-3.5 text-notion-text-secondary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <PageTree nodes={node.children} depth={depth + 1} />
      )}
    </div>
  );
}
