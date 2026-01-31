import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { usePageStore } from '@/stores/pageStore';
import { useBlockStore } from '@/stores/blockStore';
import PageHeader from './PageHeader';
import PageBreadcrumb from './PageBreadcrumb';
import BlockCanvas from '../blocks/BlockCanvas';

export default function PageView() {
  const { pageId } = useParams<{ pageId: string }>();
  const { pages, setCurrentPage } = usePageStore();
  const { fetchBlocks, getBlocksForPage } = useBlockStore();

  const page = pageId ? pages.get(pageId) : null;
  const blocks = pageId ? getBlocksForPage(pageId) : [];

  useEffect(() => {
    if (pageId) {
      setCurrentPage(pageId);
      fetchBlocks(pageId);
    }
    return () => setCurrentPage(null);
  }, [pageId, setCurrentPage, fetchBlocks]);

  if (!page) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-notion-text-secondary">Page not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <div className="max-w-3xl mx-auto px-24 py-4">
        <PageBreadcrumb pageId={page.id} />
        <PageHeader page={page} />
        <BlockCanvas pageId={page.id} blocks={blocks} />
      </div>
    </div>
  );
}
