import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '@/stores/uiStore';
import PageContent from '../page/PageContent';

const MIN_PEEK_WIDTH = 480;

function getDefaultWidth() {
  return Math.max(Math.round(window.innerWidth * 0.55), MIN_PEEK_WIDTH);
}

export default function SidePanel() {
  const { peekPageId, closePeekPanel, searchOpen, peekPanelWidth, setPeekPanelWidth } = useUiStore();
  const navigate = useNavigate();

  // Animation state
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const contentPageIdRef = useRef<string | null>(null);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, width: 0 });

  const actualWidth = peekPanelWidth || getDefaultWidth();

  // Open/close triggers
  useEffect(() => {
    if (peekPageId) {
      contentPageIdRef.current = peekPageId;
      if (!visible) {
        // Initialize default width on first open if not set
        if (!peekPanelWidth) {
          setPeekPanelWidth(getDefaultWidth());
        }
        setVisible(true);
      }
    } else if (visible) {
      setExpanded(false);
      // Fallback cleanup in case transitionEnd doesn't fire
      const timer = setTimeout(() => {
        setVisible(false);
        contentPageIdRef.current = null;
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [peekPageId, visible, peekPanelWidth, setPeekPanelWidth]);

  // After mount, animate open
  useEffect(() => {
    if (visible && peekPageId) {
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setExpanded(true));
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [visible, peekPageId]);

  // After close animation
  const handleTransitionEnd = useCallback(() => {
    if (!expanded && !peekPageId) {
      setVisible(false);
      contentPageIdRef.current = null;
    }
  }, [expanded, peekPageId]);

  // Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !searchOpen && peekPageId) {
        closePeekPanel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closePeekPanel, searchOpen, peekPageId]);

  // Drag resize handler
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, width: actualWidth };

    const handleMove = (moveEvent: MouseEvent) => {
      // Dragging left increases width (panel grows from right)
      const delta = dragStartRef.current.x - moveEvent.clientX;
      const newWidth = dragStartRef.current.width + delta;
      setPeekPanelWidth(newWidth);
    };

    const handleUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [actualWidth, setPeekPanelWidth]);

  if (!visible) return null;

  const displayPageId = peekPageId || contentPageIdRef.current;

  const handleOpenFullPage = () => {
    const id = displayPageId;
    closePeekPanel();
    if (id) navigate(`/page/${id}`);
  };

  return (
    <div
      style={{ width: expanded ? actualWidth : 0 }}
      className={`flex-shrink-0 overflow-hidden ${isDragging ? '' : 'transition-[width] duration-200 ease-out'}`}
      onTransitionEnd={handleTransitionEnd}
    >
      <div style={{ width: actualWidth }} className="h-full border-l border-notion-border bg-notion-bg overflow-auto relative">
        {/* Drag handle */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400/50 active:bg-blue-400 z-30"
          onMouseDown={handleDragStart}
        >
          <div className="absolute inset-y-0 -left-1 -right-1" />
        </div>

        {displayPageId && (
          <PageContent
            pageId={displayPageId}
            variant="peek"
            onClose={closePeekPanel}
            onOpenFullPage={handleOpenFullPage}
          />
        )}
      </div>
    </div>
  );
}
