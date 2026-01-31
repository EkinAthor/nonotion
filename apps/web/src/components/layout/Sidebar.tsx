import { useNavigate } from 'react-router-dom';
import { usePageStore } from '@/stores/pageStore';
import { useUiStore } from '@/stores/uiStore';
import PageTree from './PageTree';
import StarredSection from './StarredSection';

export default function Sidebar() {
  const navigate = useNavigate();
  const { createPage, getPageTree, isLoading } = usePageStore();
  const { toggleSidebar } = useUiStore();

  const handleNewPage = async () => {
    const page = await createPage({ title: 'Untitled' });
    navigate(`/page/${page.id}`);
  };

  const pageTree = getPageTree();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-notion-border">
        <span className="font-semibold text-notion-text">Nonotion</span>
        <button
          onClick={toggleSidebar}
          className="p-1 rounded hover:bg-notion-hover text-notion-text-secondary"
          title="Toggle sidebar"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
            />
          </svg>
        </button>
      </div>

      {/* Starred Section */}
      <StarredSection />

      {/* Pages Section */}
      <div className="flex-1 overflow-auto">
        <div className="px-2 py-2">
          <div className="flex items-center justify-between px-2 py-1 text-xs font-medium text-notion-text-secondary uppercase">
            <span>Pages</span>
            <button
              onClick={handleNewPage}
              className="p-0.5 rounded hover:bg-notion-hover"
              title="New page"
            >
              <svg
                className="w-4 h-4"
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
          </div>

          {isLoading ? (
            <div className="px-2 py-4 text-sm text-notion-text-secondary">
              Loading...
            </div>
          ) : pageTree.length === 0 ? (
            <div className="px-2 py-4 text-sm text-notion-text-secondary">
              No pages yet
            </div>
          ) : (
            <PageTree nodes={pageTree} depth={0} />
          )}
        </div>
      </div>

      {/* New Page Button (bottom) */}
      <div className="border-t border-notion-border px-2 py-2">
        <button
          onClick={handleNewPage}
          className="flex items-center w-full px-2 py-1.5 text-sm text-notion-text-secondary hover:bg-notion-hover rounded"
        >
          <svg
            className="w-4 h-4 mr-2"
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
          New page
        </button>
      </div>
    </div>
  );
}
