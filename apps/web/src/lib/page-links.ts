/**
 * Helpers for internal page-navigation affordances rendered as real anchors.
 *
 * Every affordance that navigates to a page renders an `<a href={pageHref(id)}>`
 * so the browser's native "Open in new tab" (context menu) and middle-click work.
 * Plain left-clicks are intercepted and run the SPA behavior (navigate / peek);
 * modified clicks (ctrl/cmd/shift/alt) and non-primary buttons fall through to
 * the browser default.
 */

export function pageHref(id: string): string {
  return `/page/${id}`;
}

// Structural param type so it accepts React.MouseEvent AND native MouseEvent
// (the mention NodeView is plain JS/DOM).
export function isNewTabClick(e: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

// Capture-phase guard for composite anchors (rows/cards containing buttons or
// editable cells): stopPropagation on inner controls does NOT cancel the
// anchor's native navigation — only preventDefault does, and it works from the
// capture phase for the whole subtree in one place.
export function suppressNativeNavForPlainClick(e: React.MouseEvent): void {
  if (!isNewTabClick(e)) e.preventDefault();
}
