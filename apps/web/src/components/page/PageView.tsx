import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { usePageStore } from '@/stores/pageStore';
import { useUiStore } from '@/stores/uiStore';
import PageContent from './PageContent';

export default function PageView() {
  const { pageId } = useParams<{ pageId: string }>();
  const { setCurrentPage } = usePageStore();
  const { closePeekPanel } = useUiStore();

  useEffect(() => {
    if (pageId) {
      setCurrentPage(pageId);
      closePeekPanel();
    }
    return () => {
      setCurrentPage(null);
    };
  }, [pageId, setCurrentPage, closePeekPanel]);

  if (!pageId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-notion-text-secondary">Page not found</p>
      </div>
    );
  }

  return <PageContent pageId={pageId} variant="full" />;
}
