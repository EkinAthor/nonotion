import { useNavigate } from 'react-router-dom';
import { usePageStore } from '@/stores/pageStore';

export default function StarredSection() {
  const navigate = useNavigate();
  const { getStarredPages, currentPageId } = usePageStore();

  const starredPages = getStarredPages();

  if (starredPages.length === 0) {
    return null;
  }

  return (
    <div className="px-2 py-2 border-b border-notion-border">
      <div className="px-2 py-1 text-xs font-medium text-notion-text-secondary uppercase">
        Starred
      </div>
      {starredPages.map((page) => (
        <div
          key={page.id}
          onClick={() => navigate(`/page/${page.id}`)}
          className={`flex items-center px-2 py-1 rounded cursor-pointer ${
            currentPageId === page.id ? 'bg-notion-hover' : 'hover:bg-notion-hover'
          }`}
        >
          <span className="w-5 h-5 flex items-center justify-center text-sm">
            {page.icon || '📄'}
          </span>
          <span className="ml-1 text-sm text-notion-text truncate">
            {page.title || 'Untitled'}
          </span>
        </div>
      ))}
    </div>
  );
}
