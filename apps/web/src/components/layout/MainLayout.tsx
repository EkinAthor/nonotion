import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { usePageStore } from '@/stores/pageStore';
import { useUiStore } from '@/stores/uiStore';
import Sidebar from './Sidebar';
import SearchModal from './SearchModal';

export default function MainLayout() {
  const { fetchPages } = usePageStore();
  const { sidebarOpen, sidebarWidth, toggleSearch } = useUiStore();

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        toggleSearch();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggleSearch]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {sidebarOpen && (
        <div
          style={{ width: sidebarWidth }}
          className="flex-shrink-0 bg-notion-sidebar border-r border-notion-border"
        >
          <Sidebar />
        </div>
      )}
      <main className="flex-1 overflow-auto bg-notion-bg">
        <Outlet />
      </main>
      <SearchModal />
    </div>
  );
}
