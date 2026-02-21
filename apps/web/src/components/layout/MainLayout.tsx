import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { usePageStore } from '@/stores/pageStore';
import { useUiStore } from '@/stores/uiStore';
import Sidebar from './Sidebar';
import SearchModal from './SearchModal';

export default function MainLayout() {
  const { fetchPages } = usePageStore();
  const { sidebarOpen, sidebarWidth, toggleSidebar, toggleSearch } = useUiStore();

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
      <main className="flex-1 overflow-auto bg-notion-bg relative">
        {!sidebarOpen && (
          <button
            onClick={toggleSidebar}
            className="fixed top-2 left-2 z-30 p-1.5 rounded hover:bg-notion-hover text-notion-text-secondary"
            title="Open sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
        <Outlet />
      </main>
      <SearchModal />
    </div>
  );
}
