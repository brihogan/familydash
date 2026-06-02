// Keeps the CSS variable --app-h in sync with the *actual* visible viewport
// height, measured in JS.
//
// Why: mobile in-app browsers (notably "HappyWeb: Family Browser") can resolve
// the CSS `100dvh` unit TALLER than the area that's actually visible — by the
// height of a custom search/URL bar. That makes the app shell overflow the
// screen, with two consequences the user sees:
//   1. The whole document scrolls (not just the inner content), and hitting the
//      scroll edge triggers the browser's overscroll-reload.
//   2. `position: fixed` bars anchor to the oversized layout viewport, so the
//      bottom nav lands below the fold and you must scroll to reach it.
// `window.innerHeight` reflects the real visible area in these browsers where
// `dvh` does not, so we drive the layout height off it instead.
function update() {
  const h = window.innerHeight;
  if (h) document.documentElement.style.setProperty('--app-h', `${h}px`);
}

export function initAppHeight() {
  update();
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  // Some WebViews only fire viewport changes on the visualViewport.
  if (window.visualViewport) window.visualViewport.addEventListener('resize', update);
  // Catch the case where the view changed while the page was backgrounded.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
}
