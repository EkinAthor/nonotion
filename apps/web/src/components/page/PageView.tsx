import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { usePageStore } from '@/stores/pageStore';
import PageContent from './PageContent';

export default function PageView() {
  const { pageId } = useParams<{ pageId: string }>();
  const { setCurrentPage } = usePageStore();

  useEffect(() => {
    if (pageId) {
      setCurrentPage(pageId);
    }
    return () => {
      setCurrentPage(null);
    };
  }, [pageId, setCurrentPage]);

  if (!pageId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-notion-text-secondary">Page not found</p>
      </div>
    );
  }

  return <PageContent pageId={pageId} variant="full" />;
}
