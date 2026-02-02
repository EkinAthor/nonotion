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

type PermissionLevel = 'owner' | 'full_access' | 'editor' | 'viewer';

export default function PageView() {
  const { pageId } = useParams<{ pageId: string }>();
  const { pages, setCurrentPage } = usePageStore();
  const { fetchBlocks, getBlocksForPage } = useBlockStore();
  const [permission, setPermission] = useState<PermissionLevel | null>(null);
  const [permissionLoading, setPermissionLoading] = useState(true);

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

  return (
    <div className="min-h-full">
      <div className={`mx-auto py-4 ${isDatabase ? 'max-w-6xl px-8' : 'max-w-3xl px-24'}`}>
        <PageBreadcrumb pageId={page.id} />
        <PageHeader page={page} readOnly={!canEdit} canShare={permission === 'owner' || permission === 'full_access'} />
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
    </div>
  );
}
