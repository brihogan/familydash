import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { claudeApi } from '../../api/claude.api.js';

export default function ClaudeTerminal({ userId, onClose }) {
  const containerRef = useRef(null);
  const [remaining, setRemaining] = useState(null);
  const remainingRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let currentWs = null;
    let reconnectTimeout = null;

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
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fitAddon.fit();

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    term.focus();

    const handleResize = () => {
      fitAddon.fit();
      if (currentWs?.readyState === WebSocket.OPEN) {
        currentWs.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };
    window.addEventListener('resize', handleResize);

    term.onData((data) => {
      if (currentWs?.readyState === WebSocket.OPEN) currentWs.send(data);
    });

    const connect = async () => {
      if (cancelled) return;

      let ticket;
      try {
        const data = await claudeApi.getWsTicket(userId);
        ticket = data.ticket;
      } catch (err) {
        console.error('[claude-terminal] Failed to get ticket:', err);
        if (!cancelled) {
          term.writeln('\r\n\x1b[33mReconnecting...\x1b[0m');
          reconnectTimeout = setTimeout(connect, 3000);
        }
        return;
      }
      if (cancelled) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/terminal?ticket=${encodeURIComponent(ticket)}`);
      ws.binaryType = 'arraybuffer';
      currentWs = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'time_limit') {
              const secs = msg.seconds ?? (msg.minutes * 60);
              remainingRef.current = Date.now() + secs * 1000;
              setRemaining(Math.ceil(secs / 60));
              intervalRef.current = setInterval(() => {
                const left = Math.max(0, Math.ceil((remainingRef.current - Date.now()) / 60000));
                setRemaining(left);
                if (left <= 0) clearInterval(intervalRef.current);
              }, 30000);
              return;
            }
            if (msg.type === 'time_warning') {
              const leftSec = msg.remainingSeconds ?? (msg.remainingMinutes * 60);
              const leftMin = Math.ceil(leftSec / 60);
              term.writeln(`\r\n\x1b[33m\u26a0 ${leftMin} minutes remaining.\x1b[0m`);
              setRemaining(leftMin);
              return;
            }
            if (msg.type === 'time_expired') {
              setRemaining(0);
              term.writeln(`\r\n\x1b[31m\u23f0 Time limit reached.\x1b[0m`);
              return;
            }
          } catch { /* not JSON */ }
        }
        term.write(event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : event.data);
      };

      ws.onclose = (event) => {
        if (cancelled) return;
        if (event.code === 4008 || event.code === 1000) {
          const reason = event.reason || 'Session ended';
          term.writeln(`\r\n\x1b[90m--- ${reason} ---\x1b[0m`);
          return;
        }
        term.writeln('\r\n\x1b[33m--- Connection lost. Reconnecting... ---\x1b[0m');
        reconnectTimeout = setTimeout(connect, 2000);
      };

      ws.onerror = () => {};
    };

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimeout);
      clearInterval(intervalRef.current);
      window.removeEventListener('resize', handleResize);
      if (currentWs) currentWs.close();
      term.dispose();
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, [userId]);

  const formatRemaining = (mins) => {
    if (mins == null) return null;
    if (mins >= 60) { const h = Math.floor(mins / 60); const m = mins % 60; return m > 0 ? `${h}h ${m}m` : `${h}h`; }
    return `${mins}m`;
  };

  const isLow = remaining != null && remaining <= 5;

  return createPortal(
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100dvh', zIndex: 9999, display: 'flex', flexDirection: 'column', background: '#1a1b26' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#16161e', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: remaining === 0 ? '#ef4444' : '#22c55e' }} />
          <span style={{ fontSize: 13, fontFamily: 'monospace', color: '#9ca3af' }}>Claude Code</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {remaining != null && (
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: isLow ? '#f59e0b' : '#6b7280' }}>
              {remaining === 0 ? 'Time up' : `${formatRemaining(remaining)} left`}
            </span>
          )}
          <button
            onClick={onClose}
            style={{ padding: '4px 12px', fontSize: 13, color: '#9ca3af', border: '1px solid #4b5563', borderRadius: 4, background: 'transparent', cursor: 'pointer' }}
          >
            Exit
          </button>
        </div>
      </div>
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden' }} />
    </div>,
    document.body,
  );
}
