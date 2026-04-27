import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { usePageStore } from '@/stores/pageStore';
import { useUiStore } from '@/stores/uiStore';
import { IS_DEMO_MODE } from '@/api/client';
import { useUndoShortcuts } from '@/lib/undo/useUndoShortcuts';
import Sidebar from './Sidebar';
import SidePanel from './SidePanel';
import SearchModal from './SearchModal';
import DemoBanner from './DemoBanner';

export default function MainLayout() {
  const { fetchPages, fetchPageOrder } = usePageStore();
  const { sidebarOpen, sidebarWidth, peekPageId, sidebarAutoCollapsed, toggleSidebar, setSidebarOpen, toggleSearch } = useUiStore();

  useUndoShortcuts();

  useEffect(() => {
    fetchPages();
    fetchPageOrder();
  }, [fetchPages, fetchPageOrder]);

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

  // Auto-collapse sidebar when peek panel is open and viewport is too narrow
  useEffect(() => {
    if (!peekPageId) return;

    const check = () => {
      const vw = window.innerWidth;
      const panelW = useUiStore.getState().peekPanelWidth || Math.round(vw * 0.55);
      const currentSidebar = useUiStore.getState().sidebarOpen;
      const currentAutoCollapsed = useUiStore.getState().sidebarAutoCollapsed;
      const mainW = vw - (currentSidebar ? sidebarWidth : 0) - panelW;
      if (mainW < 400 && currentSidebar && !currentAutoCollapsed) {
        useUiStore.setState({ sidebarAutoCollapsed: true });
        setSidebarOpen(false);
      }
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [peekPageId, sidebarWidth, setSidebarOpen]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      {IS_DEMO_MODE && <DemoBanner />}
      <div className="flex flex-1 overflow-hidden">
      {sidebarOpen && (
        <div
          style={{ width: sidebarWidth }}
          className="flex-shrink-0 bg-notion-sidebar border-r border-notion-border"
        >
          <Sidebar />
        </div>
      )}
      <main className="flex-1 overflow-auto bg-notion-bg relative min-w-0">
        {!sidebarOpen && !sidebarAutoCollapsed && (
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
      <SidePanel />
      <SearchModal />
      </div>
    </div>
  );
}
