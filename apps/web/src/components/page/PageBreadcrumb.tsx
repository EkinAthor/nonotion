import { useNavigate } from 'react-router-dom';
import { usePageStore } from '@/stores/pageStore';

interface PageBreadcrumbProps {
  pageId: string;
}

export default function PageBreadcrumb({ pageId }: PageBreadcrumbProps) {
  const navigate = useNavigate();
  const { getBreadcrumbs } = usePageStore();

  const breadcrumbs = getBreadcrumbs(pageId);

  if (breadcrumbs.length === 0) {
    return null;
  }

  // Single page (root) - show just the page name
  if (breadcrumbs.length === 1) {
    const page = breadcrumbs[0];
    return (
      <nav className="flex items-center gap-1 text-sm text-notion-text-secondary">
        <span className="px-1 py-0.5 flex items-center gap-1">
          <span className="text-xs">{page.icon || '📄'}</span>
          <span className="truncate max-w-[150px] text-notion-text">
            {page.title || 'Untitled'}
          </span>
        </span>
      </nav>
    );
  }

  return (
    <nav className="flex items-center gap-1 text-sm text-notion-text-secondary">
      {breadcrumbs.slice(0, -1).map((page, index) => (
        <span key={page.id} className="flex items-center">
          {index > 0 && (
            <svg
              className="w-4 h-4 mx-1"
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
          )}
          <button
            onClick={() => navigate(`/page/${page.id}`)}
            className="hover:bg-notion-hover px-1 py-0.5 rounded flex items-center gap-1"
          >
            <span className="text-xs">{page.icon || '📄'}</span>
            <span className="truncate max-w-[100px]">{page.title || 'Untitled'}</span>
          </button>
        </span>
      ))}
      <svg
        className="w-4 h-4 mx-1"
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
      <span className="px-1 py-0.5 flex items-center gap-1">
        <span className="text-xs">{breadcrumbs[breadcrumbs.length - 1]?.icon || '📄'}</span>
        <span className="truncate max-w-[100px] text-notion-text">
          {breadcrumbs[breadcrumbs.length - 1]?.title || 'Untitled'}
        </span>
      </span>
    </nav>
  );
}
