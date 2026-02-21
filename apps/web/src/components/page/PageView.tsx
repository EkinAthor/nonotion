import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePageStore } from '@/stores/pageStore';
import { useBlockStore } from '@/stores/blockStore';
import { pagesApi } from '@/api/client';
import PageHeader from './PageHeader';
import PageBreadcrumb from './PageBreadcrumb';
import PageProperties from './PageProperties';
import BlockCanvas from '../blocks/BlockCanvas';
import DatabaseView from '../database/DatabaseView';
import ShareModal from '@/components/sharing/ShareModal';

type PermissionLevel = 'owner' | 'full_access' | 'editor' | 'viewer';

export default function PageView() {
  const { pageId } = useParams<{ pageId: string }>();
  const { pages, setCurrentPage, updatePage } = usePageStore();
  const { fetchBlocks, getBlocksForPage } = useBlockStore();
  const [permission, setPermission] = useState<PermissionLevel | null>(null);
  const [permissionLoading, setPermissionLoading] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);

  const page = pageId ? pages.get(pageId) : null;
  const blocks = pageId ? getBlocksForPage(pageId) : [];

  const isDatabase = page?.type === 'database';

  useEffect(() => {
    if (pageId) {
      setCurrentPage(pageId);
      // Only fetch blocks for document pages
      if (!isDatabase) {
        fetchBlocks(pageId);
      }
      setPermissionLoading(true);

      // Fetch user's permission for this page
      pagesApi.getPermission(pageId)
        .then((result) => setPermission(result.level))
        .catch(() => setPermission(null))
        .finally(() => setPermissionLoading(false));
    }
    return () => {
      setCurrentPage(null);
      setPermission(null);
      setPermissionLoading(true);
    };
  }, [pageId, setCurrentPage, fetchBlocks, isDatabase]);

  if (!page) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-notion-text-secondary">Page not found</p>
      </div>
    );
  }

  // Wait for permission to load before rendering content
  if (permissionLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-notion-text-secondary">Loading...</p>
      </div>
    );
  }

  const canEdit = permission === 'owner' || permission === 'full_access' || permission === 'editor';
  const canShare = permission === 'owner' || permission === 'full_access';

  const handleToggleStar = () => {
    updatePage(page.id, { isStarred: !page.isStarred });
  };

  return (
    <div className="min-h-full">
      {/* Top bar: breadcrumb (flush left) + star/share (flush right) */}
      <div className="sticky top-0 z-20 bg-notion-bg/80 backdrop-blur-sm">
        <div className="flex items-center justify-between py-2 px-4">
          <PageBreadcrumb pageId={page.id} />
          <div className="flex items-center gap-1">
            <button
              onClick={handleToggleStar}
              className={`p-1.5 rounded hover:bg-notion-hover ${page.isStarred ? 'text-yellow-500' : 'text-notion-text-secondary'}`}
              title={page.isStarred ? 'Remove from starred' : 'Add to starred'}
            >
              <svg
                className="w-4 h-4"
                fill={page.isStarred ? 'currentColor' : 'none'}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                />
              </svg>
            </button>
            {canShare && (
              <button
                onClick={() => setShowShareModal(true)}
                className="px-2.5 py-1 text-sm rounded hover:bg-notion-hover text-notion-text-secondary flex items-center gap-1"
                title="Share page"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                  />
                </svg>
                Share
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={`mx-auto py-4 ${isDatabase ? 'max-w-6xl px-8' : 'max-w-4xl px-10'}`}>
        <PageHeader page={page} readOnly={!canEdit} />
        {!canEdit && (
          <div className="mb-4 px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-md">
            You have view-only access to this page
          </div>
        )}

        {isDatabase ? (
          <DatabaseView page={page} canEdit={canEdit} />
        ) : (
          <>
            <PageProperties page={page} canEdit={canEdit} />
            <BlockCanvas pageId={page.id} blocks={blocks} readOnly={!canEdit} />
          </>
        )}
      </div>

      {/* Share Modal */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        pageId={page.id}
        pageTitle={page.title || 'Untitled'}
      />
    </div>
  );
}
