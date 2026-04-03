import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { claudeApi } from '../../api/claude.api.js';

export default function ClaudeTerminal({ userId, onClose }) {
  const containerRef = useRef(null);
  const cleanupRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    const init = async () => {
      // Get a one-time ticket via normal authenticated HTTP (handles token refresh)
      let ticket;
      try {
        const data = await claudeApi.getWsTicket(userId);
        ticket = data.ticket;
      } catch (err) {
        console.error('[claude-terminal] Failed to get ticket:', err);
        return;
      }
      if (cancelled) return;

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        scrollback: 5000,
        theme: {
          background: '#1a1b26',
          foreground: '#a9b1d6',
          cursor: '#c0caf5',
          selectionBackground: '#33467c',
        },
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
      term.open(containerRef.current);
      fitAddon.fit();

      // Connect WebSocket with ticket (no JWT needed)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/terminal?ticket=${encodeURIComponent(ticket)}`;
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      };

      ws.onmessage = (event) => {
        term.write(event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : event.data);
      };

      ws.onclose = (event) => {
        term.writeln(`\r\n\x1b[90m--- Session closed${event.reason ? ': ' + event.reason : ''} ---\x1b[0m`);
      };

      ws.onerror = () => {
        term.writeln('\r\n\x1b[31m--- Connection error ---\x1b[0m');
      };

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      });

      const handleResize = () => {
        fitAddon.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        }
      };
      window.addEventListener('resize', handleResize);

      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      term.focus();

      cleanupRef.current = () => {
        window.removeEventListener('resize', handleResize);
        ws.close();
        term.dispose();
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
      };
    };

    init();

    return () => {
      cancelled = true;
      if (cleanupRef.current) cleanupRef.current();
    };
  }, [userId]);

  return createPortal(
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100dvh', zIndex: 9999, display: 'flex', flexDirection: 'column', background: '#1a1b26' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#16161e', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
          <span style={{ fontSize: 13, fontFamily: 'monospace', color: '#9ca3af' }}>Claude Code</span>
        </div>
        <button
          onClick={onClose}
          style={{ padding: '4px 12px', fontSize: 13, color: '#9ca3af', border: '1px solid #4b5563', borderRadius: 4, background: 'transparent', cursor: 'pointer' }}
        >
          Exit
        </button>
      </div>
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden' }} />
    </div>,
    document.body,
  );
}
