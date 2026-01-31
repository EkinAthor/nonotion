import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { usePageStore } from '@/stores/pageStore';
import { useUiStore } from '@/stores/uiStore';
import Sidebar from './Sidebar';

export default function MainLayout() {
  const { fetchPages } = usePageStore();
  const { sidebarOpen, sidebarWidth } = useUiStore();

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

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
    </div>
  );
}
