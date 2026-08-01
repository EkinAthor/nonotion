import { useEffect, useRef } from 'react';
import { Outlet, useSearchParams } from 'react-router-dom';
import { usePageStore } from '@/stores/pageStore';
import { useUiStore } from '@/stores/uiStore';
import { useSaveStatusGlobalListeners } from '@/stores/saveStatusStore';
import { IS_DEMO_MODE } from '@/api/client';
import Sidebar from './Sidebar';
import SidePanel from './SidePanel';
import SearchModal from './SearchModal';
import DemoBanner from './DemoBanner';

export default function MainLayout() {
  const { fetchPages, fetchPageOrder } = usePageStore();
  const { sidebarOpen, sidebarWidth, peekPageId, sidebarAutoCollapsed, toggleSidebar, setSidebarOpen, toggleSearch } = useUiStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPeek = searchParams.get('peek');

  // Save indicator: online/offline tracking + beforeunload warning while unsaved
  useSaveStatusGlobalListeners();

  useEffect(() => {
    fetchPages();
    fetchPageOrder();
  }, [fetchPages, fetchPageOrder]);

  // Keep the peek panel (split view) and the `?peek=` URL param in sync so the split view
  // survives reloads and shared links, AND so opening/switching a peek pushes a real browser-history
  // entry (Back/Forward step through peek states in order; Back from an open peek closes the split
  // view, staying on the current page). The store is seeded from the URL at creation
  // (uiStore.loadInitialPeek), so the two already agree on first render; these effects only reconcile
  // *subsequent* changes.
  //
  // `syncingFromUrl` distinguishes a store change that ORIGINATED from the URL (back/forward, reload,
  // pasted link) from one the user made (opening a peek). Only user-made changes may write the URL —
  // otherwise a back/forward pop would echo back into a spurious history push. The window.location
  // read isn't reliable during react-router's popstate transition, so this flag is the source of truth.
  const syncingFromUrl = useRef(false);

  // URL -> store: reload, pasted link, back/forward, or navigating to a page without a peek param.
  // Reads fresh store state via getState() so it depends only on `urlPeek`. Flags the resulting store
  // change as URL-originated so the store -> URL effect below skips echoing it back to history.
  useEffect(() => {
    const { peekPageId: current, openPeekPanel, closePeekPanel } = useUiStore.getState();
    if (urlPeek) {
      if (urlPeek !== current) {
        syncingFromUrl.current = true;
        openPeekPanel(urlPeek);
      }
    } else if (current) {
      syncingFromUrl.current = true;
      closePeekPanel();
    }
  }, [urlPeek]);

  // store -> URL: opening/closing the peek panel from the table, kanban, toolbar, or panel controls.
  // Keyed only on `peekPageId` (not `searchParams`) so navigation between pages never re-adds a stale
  // peek param. Opening/switching a peek pushes a history entry; closing replaces, so an explicit
  // dismiss (X / Esc / delete) doesn't leave a forward entry that reopens the panel.
  useEffect(() => {
    // Change came from the URL (back/forward/reload) — the URL is already correct; don't push again.
    if (syncingFromUrl.current) {
      syncingFromUrl.current = false;
      return;
    }
    const current = new URLSearchParams(window.location.search).get('peek');
    if (peekPageId === current) return;
    const replace = !peekPageId;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (peekPageId) next.set('peek', peekPageId);
        else next.delete('peek');
        return next;
      },
      { replace }
    );
  }, [peekPageId, setSearchParams]);

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
