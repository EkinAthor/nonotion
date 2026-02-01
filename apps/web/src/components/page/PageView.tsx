import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePageStore } from '@/stores/pageStore';
import { useBlockStore } from '@/stores/blockStore';
import { pagesApi } from '@/api/client';
import PageHeader from './PageHeader';
import PageBreadcrumb from './PageBreadcrumb';
import BlockCanvas from '../blocks/BlockCanvas';

type PermissionLevel = 'owner' | 'full_access' | 'editor' | 'viewer';

export default function PageView() {
  const { pageId } = useParams<{ pageId: string }>();
  const { pages, setCurrentPage } = usePageStore();
  const { fetchBlocks, getBlocksForPage } = useBlockStore();
  const [permission, setPermission] = useState<PermissionLevel | null>(null);
  const [permissionLoading, setPermissionLoading] = useState(true);

  const page = pageId ? pages.get(pageId) : null;
  const blocks = pageId ? getBlocksForPage(pageId) : [];

  useEffect(() => {
    if (pageId) {
      setCurrentPage(pageId);
      fetchBlocks(pageId);
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
  }, [pageId, setCurrentPage, fetchBlocks]);

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

  return (
    <div className="min-h-full">
      <div className="max-w-3xl mx-auto px-24 py-4">
        <PageBreadcrumb pageId={page.id} />
        <PageHeader page={page} readOnly={!canEdit} canShare={permission === 'owner' || permission === 'full_access'} />
        {!canEdit && (
          <div className="mb-4 px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-md">
            You have view-only access to this page
          </div>
        )}
        <BlockCanvas pageId={page.id} blocks={blocks} readOnly={!canEdit} />
      </div>
    </div>
  );
}
