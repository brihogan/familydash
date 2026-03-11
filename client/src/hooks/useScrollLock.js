import { useEffect } from 'react';

function isScrollable(el) {
  const style = window.getComputedStyle(el);
  return /(auto|scroll)/.test(style.overflow + style.overflowY);
}

function getScrollParent(el) {
  let node = el;
  while (node && node !== document.body) {
    if (isScrollable(node) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

export default function useScrollLock(isLocked) {
  useEffect(() => {
    if (!isLocked) return;
    const scrollY = window.scrollY;
    const body = document.body;
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    const prevent = (e) => {
      const scrollParent = getScrollParent(e.target);
      if (!scrollParent) { e.preventDefault(); return; }
      const { scrollTop, scrollHeight, clientHeight } = scrollParent;
      const atTop = scrollTop <= 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight;
      const touch = e.touches[0];
      const dy = touch.clientY - (prevent._lastY || touch.clientY);
      prevent._lastY = touch.clientY;
      if ((atTop && dy > 0) || (atBottom && dy < 0)) e.preventDefault();
    };
    const trackStart = (e) => { prevent._lastY = e.touches[0].clientY; };
    document.addEventListener('touchstart', trackStart, { passive: true });
    document.addEventListener('touchmove', prevent, { passive: false });
    return () => {
      document.removeEventListener('touchstart', trackStart);
      document.removeEventListener('touchmove', prevent);
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.overflow = '';
      body.style.overscrollBehavior = '';
      window.scrollTo(0, scrollY);
    };
  }, [isLocked]);
}
