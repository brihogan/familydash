import { useState, useEffect, useCallback } from 'react';
import { isDebugEnabled } from '../../debug/eventLog.js';

// A copy-paste diagnostic overlay, shown only when ?debug=1. It reports the
// real geometry of the viewport, the document, the safe-area insets, the CSS
// viewport units (dvh/svh/lvh/vh), and where the app shell + nav actually
// render — so layout problems in in-app browsers (e.g. HappyWeb's overlay
// search bar) can be diagnosed from real numbers instead of guesswork.

function probeUnit(value) {
  const d = document.createElement('div');
  d.style.cssText = `position:absolute;top:-9999px;left:-9999px;width:1px;height:${value};`;
  document.body.appendChild(d);
  const h = d.offsetHeight;
  d.remove();
  return h;
}

function safeAreaInsets() {
  const d = document.createElement('div');
  d.style.cssText = 'position:absolute;top:-9999px;left:-9999px;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
  document.body.appendChild(d);
  const cs = getComputedStyle(d);
  const out = { top: cs.paddingTop, right: cs.paddingRight, bottom: cs.paddingBottom, left: cs.paddingLeft };
  d.remove();
  return out;
}

function rectOf(sel) {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) };
}

function gather() {
  const vv = window.visualViewport;
  const de = document.documentElement;
  const sa = safeAreaInsets();
  const lines = [
    `time: ${new Date().toISOString().slice(11, 19)}`,
    `ua: ${navigator.userAgent}`,
    `standalone: ${window.navigator.standalone === true}  dpr: ${window.devicePixelRatio}`,
    `screen: ${screen.width}x${screen.height}  avail: ${screen.availWidth}x${screen.availHeight}`,
    `window.inner: ${window.innerWidth}x${window.innerHeight}`,
    `window.scroll: x=${window.scrollX} y=${window.scrollY}`,
    vv ? `visualViewport: ${Math.round(vv.width)}x${Math.round(vv.height)} offsetTop=${Math.round(vv.offsetTop)} pageTop=${Math.round(vv.pageTop)} scale=${vv.scale}` : 'visualViewport: (none)',
    `documentElement: client=${de.clientWidth}x${de.clientHeight} scroll=${de.scrollWidth}x${de.scrollHeight} scrollTop=${de.scrollTop}`,
    `body: scrollHeight=${document.body.scrollHeight} scrollTop=${document.body.scrollTop}`,
    `units: 100vh=${probeUnit('100vh')} 100dvh=${probeUnit('100dvh')} 100svh=${probeUnit('100svh')} 100lvh=${probeUnit('100lvh')}`,
    `--app-h: ${getComputedStyle(de).getPropertyValue('--app-h').trim() || '(unset)'}`,
    `safe-area: top=${sa.top} bottom=${sa.bottom} left=${sa.left} right=${sa.right}`,
    `app-shell rect: ${JSON.stringify(rectOf('[data-app-shell]'))}`,
    `mobile-nav rect: ${JSON.stringify(rectOf('[data-debug-nav]'))}`,
    `sidebar rect: ${JSON.stringify(rectOf('aside'))}`,
    `main rect: ${JSON.stringify(rectOf('main'))}`,
  ];
  return lines.join('\n');
}

export default function DebugOverlay() {
  const enabled = isDebugEnabled();
  const [open, setOpen] = useState(true);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(() => setText(gather()), []);

  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const onChange = () => refresh();
    window.addEventListener('scroll', onChange, true);
    window.addEventListener('resize', onChange);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onChange);
    return () => {
      window.removeEventListener('scroll', onChange, true);
      window.removeEventListener('resize', onChange);
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', onChange);
    };
  }, [refresh, enabled]);

  if (!enabled) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.getElementById('fd-debug-ta');
      if (ta) { ta.focus(); ta.select(); document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); refresh(); }}
        style={{ position: 'fixed', top: '40%', left: 4, zIndex: 2147483647, background: '#111', color: '#0f0', border: '1px solid #0f0', borderRadius: 6, fontSize: 11, padding: '4px 8px' }}
      >
        debug
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed', top: '12%', left: 8, right: 8, maxWidth: 520, margin: '0 auto',
        zIndex: 2147483647, background: 'rgba(17,17,17,0.96)', color: '#e5e5e5',
        border: '1px solid #444', borderRadius: 10, padding: 8, fontFamily: 'ui-monospace, monospace',
      }}
    >
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
        <strong style={{ fontSize: 12, color: '#0f0' }}>Layout debug</strong>
        <button onClick={copy} style={{ fontSize: 12, padding: '3px 10px', background: '#0a0', color: '#fff', border: 0, borderRadius: 6 }}>
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
        <button onClick={refresh} style={{ fontSize: 12, padding: '3px 10px', background: '#333', color: '#fff', border: 0, borderRadius: 6 }}>Refresh</button>
        <button onClick={() => setOpen(false)} style={{ marginLeft: 'auto', fontSize: 12, padding: '3px 10px', background: '#333', color: '#fff', border: 0, borderRadius: 6 }}>Hide</button>
      </div>
      <textarea
        id="fd-debug-ta"
        readOnly
        value={text}
        onFocus={(e) => e.target.select()}
        style={{ width: '100%', height: 220, fontSize: 11, lineHeight: 1.35, background: '#000', color: '#0f0', border: '1px solid #333', borderRadius: 6, padding: 6, whiteSpace: 'pre', overflow: 'auto' }}
      />
      <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>
        Scroll the page so the menu bar/search-bar overlap is visible, tap Refresh, then Copy. Disable with ?debug=0
      </div>
    </div>
  );
}
