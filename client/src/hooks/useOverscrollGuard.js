import { useEffect } from 'react';

// Stops the browser's native vertical overscroll (pull-to-refresh / chrome
// toggle) from firing — which in HappyWeb reloads the page. On a page tall
// enough to scroll, the swipe is absorbed by the inner scroller and nothing is
// prevented; on a short page (nothing to scroll) or at a scroller's edge, the
// gesture has nowhere to go and would become a document overscroll, so we
// preventDefault it. Horizontal gestures are left untouched so the horizontal
// nav still scrolls. This is the always-on form of the guard that
// `useScrollLock` already applies while a modal is open.
//
// Only meaningful for the app shell, where scrolling happens in inner
// containers and the document itself never scrolls. Do NOT use on pages that
// rely on document/body scrolling (login, register) — there the body is the
// scroller and this would block it.
export default function useOverscrollGuard(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    let startX = 0;
    let startY = 0;

    const onStart = (e) => {
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
    };

    const onMove = (e) => {
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // Leave horizontal gestures alone (e.g. the horizontal nav strip).
      if (Math.abs(dx) > Math.abs(dy)) return;

      // Find the nearest ancestor that can actually scroll vertically in the
      // direction of the gesture.
      let node = e.target instanceof Element ? e.target : null;
      while (node && node !== document.body) {
        const s = window.getComputedStyle(node);
        if (/(auto|scroll)/.test(s.overflowY) && node.scrollHeight > node.clientHeight) {
          const atTop = node.scrollTop <= 0;
          const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
          // dy > 0 means scrolling toward the top; dy < 0 toward the bottom.
          if ((dy > 0 && !atTop) || (dy < 0 && !atBottom)) return; // it can move — allow
          break; // found the scroller, but it's at the edge in this direction
        }
        node = node.parentElement;
      }
      // No scrollable ancestor (short page) or at the edge → would overscroll
      // the document and reload in HappyWeb. Block it.
      if (e.cancelable) e.preventDefault();
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
    };
  }, [enabled]);
}
