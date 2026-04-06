import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTerminal, faRocket, faXmark, faChevronDown, faUpRightFromSquare, faCompress, faTableColumns, faGripLines, faRotateRight, faChevronLeft, faChevronRight, faMagnifyingGlass, faStar } from '@fortawesome/free-solid-svg-icons';
import { claudeApi } from '../../api/claude.api.js';

const MAX_RUNNING_APPS = 3;
const BAR_H = 52;
// Apps subdomain origin — if set, iframes load from there instead of same-origin /apps/
const APPS_ORIGIN = import.meta.env.VITE_APPS_ORIGIN || '';
const PANEL_RIGHT_W = 400;
const PANEL_BOTTOM_H = 300;
const MIN_W = 200;
const MIN_H = 150;

// ─── Small icon button used in title bars ──────────────────────────────────
function TitleBtn({ icon, title, onClick, active }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 24, height: 24, border: 'none', borderRadius: 4, fontSize: 11,
        background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
        color: active ? '#c0caf5' : '#9ca3af', cursor: 'pointer',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <FontAwesomeIcon icon={icon} />
    </button>
  );
}

// ─── Sub-bar button ────────────────────────────────────────────────────────
const subBtnStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, border: 'none', borderRadius: 6,
  background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontSize: 12,
};

function SubBtn({ icon, title, onClick }) {
  return (
    <button
      onClick={onClick} title={title} style={subBtnStyle}
      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      <FontAwesomeIcon icon={icon} />
    </button>
  );
}

// ─── Panel title bar (shared by right/bottom panels) ───────────────────────
function PanelTitleBar({ mode, onSetMode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 8px', height: 30, background: '#16161e',
      borderBottom: mode === 'right' ? undefined : '1px solid rgba(255,255,255,0.1)',
      borderLeft: mode === 'right' ? '1px solid rgba(255,255,255,0.1)' : undefined,
      flexShrink: 0, userSelect: 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} />
        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#9ca3af' }}>Terminal</span>
      </div>
      <div style={{ display: 'flex', gap: 2 }}>
        <TitleBtn icon={faUpRightFromSquare} title="Float" onClick={() => onSetMode('float')} active={false} />
        <TitleBtn icon={faTableColumns} title="Dock right" onClick={() => onSetMode('right')} active={mode === 'right'} />
        <TitleBtn icon={faGripLines} title="Dock bottom" onClick={() => onSetMode('bottom')} active={mode === 'bottom'} />
        <TitleBtn icon={faCompress} title="Dock to tab" onClick={() => onSetMode('tab')} active={false} />
      </div>
    </div>
  );
}

// ─── Terminal pane with auto-reconnect ─────────────────────────────────────
function TerminalPane({ userId, visible, onTimeUpdate, containerRef, reloadKey }) {
  const cleanupRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';
    let cancelled = false;
    let reconnectTimeout = null;
    let currentWs = null;

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

    // Connect (or reconnect) the WebSocket
    const connect = async () => {
      if (cancelled) return;

      let ticket;
      try {
        const data = await claudeApi.getWsTicket(userId);
        ticket = data.ticket;
      } catch (err) {
        console.error('[terminal] Failed to get ticket:', err);
        // Retry after a delay
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
            if (msg.type === 'time_limit') { onTimeUpdate({ type: 'init', seconds: msg.seconds }); return; }
            if (msg.type === 'time_warning') {
              term.writeln(`\r\n\x1b[33m\u26a0 ${Math.ceil(msg.remainingSeconds / 60)} minutes remaining.\x1b[0m`);
              onTimeUpdate({ type: 'warning', remainingSeconds: msg.remainingSeconds });
              return;
            }
            if (msg.type === 'time_expired') {
              term.writeln(`\r\n\x1b[31m\u23f0 Time limit reached. Session ending.\x1b[0m`);
              onTimeUpdate({ type: 'expired' });
              return;
            }
          } catch { /* not JSON */ }
        }
        term.write(event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : event.data);
      };

      ws.onclose = (event) => {
        if (cancelled) return;
        // Don't reconnect if time expired or intentionally closed
        if (event.code === 4008 || event.code === 1000) {
          const reason = event.reason || 'Session ended';
          term.writeln(`\r\n\x1b[90m--- ${reason} ---\x1b[0m`);
          return;
        }
        // Auto-reconnect on unexpected close
        term.writeln('\r\n\x1b[33m--- Connection lost. Reconnecting... ---\x1b[0m');
        reconnectTimeout = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        // onclose will fire after this — reconnect happens there
      };
    };

    connect();

    containerRef.current._refit = handleResize;

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimeout);
      window.removeEventListener('resize', handleResize);
      if (currentWs) currentWs.close();
      term.dispose();
    };
  }, [userId, reloadKey]);

  useEffect(() => {
    if (visible && containerRef.current?._refit) {
      const t = setTimeout(() => containerRef.current._refit(), 60);
      return () => clearTimeout(t);
    }
  }, [visible]);

  return null;
}

// ─── Draggable + resizable floating window ─────────────────────────────────
function FloatingTerminal({ terminalRef, onSetMode }) {
  const boxRef = useRef(null);
  const posRef = useRef({ x: 40, y: 80 });
  const sizeRef = useRef({ w: 380, h: 440 });
  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const [, forceRender] = useState(0);

  const onDragDown = useCallback((e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { offsetX: e.clientX - posRef.current.x, offsetY: e.clientY - posRef.current.y };
  }, []);

  const onDragMove = useCallback((e) => {
    if (!dragRef.current) return;
    posRef.current = { x: e.clientX - dragRef.current.offsetX, y: e.clientY - dragRef.current.offsetY };
    if (boxRef.current) {
      boxRef.current.style.left = posRef.current.x + 'px';
      boxRef.current.style.top = posRef.current.y + 'px';
    }
  }, []);

  const onDragUp = useCallback(() => { dragRef.current = null; }, []);

  const onResizeDown = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: sizeRef.current.w, startH: sizeRef.current.h };
  }, []);

  const onResizeMove = useCallback((e) => {
    if (!resizeRef.current) return;
    const { startX, startY, startW, startH } = resizeRef.current;
    sizeRef.current = { w: Math.max(MIN_W, startW + (e.clientX - startX)), h: Math.max(MIN_H, startH + (e.clientY - startY)) };
    if (boxRef.current) { boxRef.current.style.width = sizeRef.current.w + 'px'; boxRef.current.style.height = sizeRef.current.h + 'px'; }
  }, []);

  const onResizeUp = useCallback(() => {
    resizeRef.current = null;
    forceRender((n) => n + 1);
    if (terminalRef.current?._refit) setTimeout(() => terminalRef.current._refit(), 30);
  }, [terminalRef]);

  useEffect(() => {
    if (terminalRef.current?._refit) setTimeout(() => terminalRef.current._refit(), 80);
  }, []);

  return (
    <div
      ref={boxRef}
      style={{
        position: 'fixed', left: posRef.current.x, top: posRef.current.y,
        width: sizeRef.current.w, height: sizeRef.current.h,
        zIndex: 10001, borderRadius: 10, overflow: 'hidden',
        boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.1)',
        display: 'flex', flexDirection: 'column', background: '#1a1b26',
      }}
    >
      {/* Drag handle / title bar */}
      <div
        onPointerDown={onDragDown}
        onPointerMove={onDragMove}
        onPointerUp={onDragUp}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 8px', height: 30, background: '#16161e',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          cursor: 'grab', userSelect: 'none', flexShrink: 0, touchAction: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} />
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#9ca3af' }}>Terminal</span>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <TitleBtn icon={faUpRightFromSquare} title="Float" active />
          <TitleBtn icon={faTableColumns} title="Dock right" onClick={() => onSetMode('right')} />
          <TitleBtn icon={faGripLines} title="Dock bottom" onClick={() => onSetMode('bottom')} />
          <TitleBtn icon={faCompress} title="Dock to tab" onClick={() => onSetMode('tab')} />
        </div>
      </div>

      {/* Terminal host */}
      <div ref={(el) => {
        if (el && terminalRef.current && terminalRef.current.parentNode !== el) {
          el.appendChild(terminalRef.current);
          if (terminalRef.current._refit) setTimeout(() => terminalRef.current._refit(), 80);
        }
      }} style={{ flex: 1, overflow: 'hidden' }} />

      {/* Resize handle */}
      <div
        onPointerDown={onResizeDown} onPointerMove={onResizeMove} onPointerUp={onResizeUp}
        style={{ position: 'absolute', right: 0, bottom: 0, width: 20, height: 20, cursor: 'nwse-resize', touchAction: 'none', zIndex: 2 }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" style={{ position: 'absolute', right: 2, bottom: 2 }}>
          <line x1="14" y1="20" x2="20" y2="14" stroke="#555" strokeWidth="1.5" />
          <line x1="10" y1="20" x2="20" y2="10" stroke="#555" strokeWidth="1.5" />
          <line x1="6" y1="20" x2="20" y2="6" stroke="#555" strokeWidth="1.5" />
        </svg>
      </div>
    </div>
  );
}

// ─── Main workspace ────────────────────────────────────────────────────────
export default function KidWorkspace({ userId, timeLimit, allApps: initialApps, initialView, onClose }) {
  const [activeTab, setActiveTab] = useState(initialView === 'terminal' ? 'terminal' : null);
  const [runningApps, setRunningApps] = useState([]);
  const [showAppList, setShowAppList] = useState(false);
  const [appSearch, setAppSearch] = useState('');
  const [allApps, setAllApps] = useState(initialApps);
  const [expandedOwners, setExpandedOwners] = useState(new Set());
  const [remainingSec, setRemainingSec] = useState(timeLimit * 60); // seconds
  const [unlimited, setUnlimited] = useState(false);
  // 'tab' = docked in main content, 'float' = floating window, 'right' = panel right, 'bottom' = panel bottom
  const [terminalMode, setTerminalModeRaw] = useState('tab');
  const [terminalReloadKey, setTerminalReloadKey] = useState(0);
  const [appReloadKeys, setAppReloadKeys] = useState({}); // appKey -> number
  const heartbeatRef = useRef(null);
  const appListRef = useRef(null);
  const terminalContainerRef = useRef(null);
  const dockedHostRef = useRef(null);
  const panelHostRef = useRef(null);
  const iframeRefs = useRef({});
  const expired = !unlimited && remainingSec <= 0;

  // Move terminal container to the right host when mode changes
  const moveTerminalTo = useCallback((host) => {
    if (host && terminalContainerRef.current && terminalContainerRef.current.parentNode !== host) {
      host.appendChild(terminalContainerRef.current);
    }
    if (terminalContainerRef.current?._refit) setTimeout(() => terminalContainerRef.current._refit(), 80);
  }, []);

  const setTerminalMode = useCallback((mode) => {
    setTerminalModeRaw((prev) => {
      // When switching from tab to something else, auto-switch active tab away if needed
      if (prev === 'tab' && mode !== 'tab' && activeTab === 'terminal' && runningApps.length > 0) {
        setActiveTab(runningApps[0].key);
      }
      // When switching back to tab, make terminal the active tab
      if (mode === 'tab') {
        setActiveTab('terminal');
        requestAnimationFrame(() => moveTerminalTo(dockedHostRef.current));
      } else if (mode === 'right' || mode === 'bottom') {
        // Panel hosts are rendered conditionally — defer the move
        requestAnimationFrame(() => {
          requestAnimationFrame(() => moveTerminalTo(panelHostRef.current));
        });
      }
      // 'float' → FloatingTerminal handles its own mounting
      return mode;
    });
  }, [activeTab, runningApps, moveTerminalTo]);

  // If launched with an app, add it to running immediately
  useEffect(() => {
    if (initialView && initialView !== 'terminal') {
      const app = { url: initialView.url, appName: initialView.appName, key: initialView.appName };
      setRunningApps([app]);
      setActiveTab(app.key);
    }
  }, []);

  // Daily time tracking via server heartbeat
  useEffect(() => {
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    // Fetch initial remaining time
    claudeApi.getDailyRemaining()
      .then((data) => {
        if (data.unlimited) { setUnlimited(true); return; }
        setRemainingSec(data.remainingSeconds);
      })
      .catch(() => {});

    // Heartbeat every 30s — server adds 30s usage, returns remaining
    heartbeatRef.current = setInterval(() => {
      claudeApi.heartbeat()
        .then((data) => {
          if (data.unlimited) { setUnlimited(true); return; }
          setRemainingSec(data.remainingSeconds);
        })
        .catch(() => {});
    }, 30000);

    return () => {
      clearInterval(heartbeatRef.current);
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, []);

  // Handle time messages from terminal WebSocket (server-authoritative)
  const handleTimeUpdate = useCallback((msg) => {
    if (msg.type === 'init') {
      setRemainingSec(msg.seconds);
    } else if (msg.type === 'warning') {
      setRemainingSec(msg.remainingSeconds);
    } else if (msg.type === 'expired') {
      setRemainingSec(0);
    }
  }, []);

  // Close app list on outside click
  useEffect(() => {
    if (!showAppList) return;
    const handler = (e) => {
      if (appListRef.current && !appListRef.current.contains(e.target)) { setShowAppList(false); setAppSearch(''); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAppList]);

  const launchApp = (appEntry) => {
    setShowAppList(false);
    setAppSearch('');
    const { url, appName, username } = appEntry;
    const existing = runningApps.find((a) => a.key === appName);
    if (existing) { setActiveTab(appName); return; }
    let updated = [...runningApps];
    if (updated.length >= MAX_RUNNING_APPS) {
      const replaceIdx = updated.findIndex((a) => a.key !== activeTab);
      if (replaceIdx >= 0) updated.splice(replaceIdx, 1);
      else updated.shift();
    }
    const app = { url, appName, key: appName };
    updated.push(app);
    setRunningApps(updated);
    setActiveTab(appName);
    if (username) claudeApi.launchApp(username, appName).catch(() => {});
  };

  const closeApp = (key) => {
    setRunningApps((prev) => prev.filter((a) => a.key !== key));
    if (activeTab === key) {
      const others = runningApps.filter((a) => a.key !== key);
      setActiveTab(others.length > 0 ? others[0].key : 'terminal');
    }
  };

  const formatRemaining = (sec) => {
    const mins = Math.ceil(sec / 60);
    if (mins >= 60) { const h = Math.floor(mins / 60); const m = mins % 60; return m > 0 ? `${h}h ${m}m` : `${h}h`; }
    return `${mins}m`;
  };

  const isLow = remainingSec > 0 && remainingSec <= 300; // 5 minutes
  const isDetached = terminalMode !== 'tab';
  const termDockedVisible = terminalMode === 'tab' && activeTab === 'terminal';

  // Tab style helper
  const tabStyle = (active) => ({
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '0 14px', fontSize: 13, fontFamily: 'sans-serif',
    borderRadius: '8px 8px 0 0',
    background: active ? '#1a1b26' : 'transparent',
    color: active ? '#c0caf5' : '#6b7280',
    border: active ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
    borderBottom: active ? '1px solid #1a1b26' : '1px solid transparent',
    cursor: 'pointer', height: 38, marginTop: BAR_H - 38,
  });

  // The panel terminal (right or bottom)
  const panelTerminal = (terminalMode === 'right' || terminalMode === 'bottom') && !expired ? (
    <div style={{
      display: 'flex', flexDirection: 'column',
      width: terminalMode === 'right' ? PANEL_RIGHT_W : '100%',
      height: terminalMode === 'bottom' ? PANEL_BOTTOM_H : '100%',
      flexShrink: 0, background: '#1a1b26',
      borderLeft: terminalMode === 'right' ? '1px solid rgba(255,255,255,0.1)' : undefined,
      borderTop: terminalMode === 'bottom' ? '1px solid rgba(255,255,255,0.1)' : undefined,
    }}>
      <PanelTitleBar mode={terminalMode} onSetMode={setTerminalMode} />
      <div
        ref={(el) => {
          panelHostRef.current = el;
          if (el && terminalContainerRef.current && terminalContainerRef.current.parentNode !== el) {
            el.appendChild(terminalContainerRef.current);
            if (terminalContainerRef.current._refit) setTimeout(() => terminalContainerRef.current._refit(), 80);
          }
        }}
        style={{ flex: 1, overflow: 'hidden' }}
      />
    </div>
  ) : null;

  return createPortal(
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100dvh', zIndex: 99999, display: 'flex', flexDirection: 'column', background: '#1a1b26', overflow: 'hidden', touchAction: 'manipulation' }}>
      {/* ─── Taskbar ─── */}
      <div style={{ display: 'flex', alignItems: 'end', padding: '0 10px', height: BAR_H, background: '#16161e', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0, gap: 3, position: 'relative', zIndex: 10 }}>
        {/* Terminal tab */}
        <div style={{ display: 'flex', alignItems: 'center', ...tabStyle(terminalMode === 'tab' && activeTab === 'terminal') }}>
          <button
            onClick={() => { if (isDetached) { setTerminalMode('tab'); } setActiveTab('terminal'); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, font: 'inherit' }}
          >
            <FontAwesomeIcon icon={faTerminal} style={{ fontSize: 11 }} />
            Terminal
          </button>
          {terminalMode === 'tab' && (
            <button
              onClick={(e) => { e.stopPropagation(); setTerminalMode('float'); }}
              title="Float terminal"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 4, border: 'none', background: 'transparent', color: '#6b7280', cursor: 'pointer', fontSize: 10, marginLeft: 2 }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <FontAwesomeIcon icon={faUpRightFromSquare} />
            </button>
          )}
          {isDetached && (
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a78bfa', marginLeft: 4 }} title={terminalMode} />
          )}
        </div>

        {/* Running app tabs */}
        {runningApps.map((app) => (
          <div key={app.key} style={{ display: 'flex', alignItems: 'center', ...tabStyle(activeTab === app.key), maxWidth: 160 }}>
            <span
              onClick={() => setActiveTab(app.key)}
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
            >
              {app.appName.replace(/[-_]/g, ' ')}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); closeApp(app.key); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 4, border: 'none', background: 'transparent', color: '#6b7280', cursor: 'pointer', flexShrink: 0, fontSize: 10, marginLeft: 2 }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        ))}

        <div style={{ flex: 1 }} />

        {/* Apps dropdown */}
        <div ref={appListRef} style={{ position: 'relative', zIndex: 10, marginBottom: 8 }}>
          <button
            onClick={() => {
              setShowAppList((v) => {
                if (!v) {
                  // Refresh apps list when opening the dropdown
                  claudeApi.listApps().then((data) => {
                    const fresh = (data.kids || []).flatMap((k) =>
                      k.apps.map((a) => ({
                        appName: a.name, username: k.username, ownerName: k.name,
                        ownerId: k.id, icon: a.icon, starred: a.starred,
                        url: APPS_ORIGIN
                          ? `${APPS_ORIGIN}/${k.username}/${a.name}/`
                          : `/apps/${k.username}/${a.name}/`,
                      }))
                    );
                    setAllApps(fresh);
                  }).catch(() => {});
                }
                return !v;
              });
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', fontSize: 13, fontFamily: 'sans-serif',
              color: showAppList ? '#c0caf5' : '#9ca3af',
              background: showAppList ? 'rgba(255,255,255,0.08)' : 'transparent',
              border: '1px solid', borderColor: showAppList ? 'rgba(255,255,255,0.15)' : 'transparent',
              borderRadius: 6, cursor: 'pointer', height: 34,
            }}
          >
            <FontAwesomeIcon icon={faRocket} style={{ fontSize: 11 }} />
            Apps
            <FontAwesomeIcon icon={faChevronDown} style={{ fontSize: 9, opacity: 0.6 }} />
          </button>

          {showAppList && (() => {
            const q = appSearch.toLowerCase().trim();
            const filtered = q ? allApps.filter((a) => a.appName.replace(/[-_]/g, ' ').toLowerCase().includes(q) || a.ownerName?.toLowerCase().includes(q)) : allApps;
            const favorites = filtered.filter((a) => a.starred);
            // Group by owner
            const ownerMap = new Map();
            for (const app of filtered) {
              const key = app.ownerId || app.username;
              if (!ownerMap.has(key)) ownerMap.set(key, { name: app.ownerName || app.username, apps: [] });
              ownerMap.get(key).apps.push(app);
            }
            const owners = [...ownerMap.entries()];

            const AppRow = ({ app }) => {
              const isRunning = runningApps.some((r) => r.key === app.appName);
              return (
                <button
                  onClick={() => launchApp(app)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', fontSize: 13, fontFamily: 'sans-serif', color: '#e5e7eb', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ width: 24, height: 24, borderRadius: 5, background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>
                    {app.icon || <FontAwesomeIcon icon={faRocket} style={{ fontSize: 10, color: '#818cf8' }} />}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {app.appName.replace(/[-_]/g, ' ')}
                  </span>
                  {isRunning && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />}
                </button>
              );
            };

            return (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 6,
                width: 300, maxHeight: 420, display: 'flex', flexDirection: 'column',
                background: '#1e1f2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}>
                {/* Search */}
                <div style={{ padding: '8px 8px 4px', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'rgba(255,255,255,0.06)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }}>
                    <FontAwesomeIcon icon={faMagnifyingGlass} style={{ fontSize: 11, color: '#6b7280' }} />
                    <input
                      type="text"
                      value={appSearch}
                      onChange={(e) => setAppSearch(e.target.value)}
                      placeholder="Search apps..."
                      autoFocus
                      style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#e5e7eb', fontSize: 13, fontFamily: 'sans-serif' }}
                    />
                    {appSearch && (
                      <button onClick={() => setAppSearch('')} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 0, fontSize: 11 }}>
                        <FontAwesomeIcon icon={faXmark} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Scrollable content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px 6px' }}>
                  {filtered.length === 0 ? (
                    <div style={{ padding: '16px 12px', textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
                      {allApps.length === 0 ? 'No apps yet' : 'No matches'}
                    </div>
                  ) : (
                    <>
                      {/* Favorites */}
                      {favorites.length > 0 && (
                        <div style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px 4px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#f59e0b' }}>
                            <FontAwesomeIcon icon={faStar} style={{ fontSize: 9 }} />
                            Favorites
                          </div>
                          {favorites.map((app) => <AppRow key={`fav-${app.username}-${app.appName}`} app={app} />)}
                        </div>
                      )}

                      {/* Grouped by owner */}
                      {owners.map(([key, { name, apps }]) => {
                        const isExpanded = q || expandedOwners.has(key) || owners.length === 1;
                        return (
                          <div key={key} style={{ marginBottom: 2 }}>
                            <button
                              onClick={() => setExpandedOwners((prev) => {
                                const next = new Set(prev);
                                next.has(key) ? next.delete(key) : next.add(key);
                                return next;
                              })}
                              style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 10px 4px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                            >
                              <FontAwesomeIcon icon={faChevronDown} style={{ fontSize: 8, transition: 'transform 0.15s', transform: isExpanded ? 'none' : 'rotate(-90deg)' }} />
                              {name}
                              <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 400 }}>({apps.length})</span>
                            </button>
                            {isExpanded && apps.map((app) => <AppRow key={`${app.username}-${app.appName}`} app={app} />)}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Timer (hidden for unlimited/parent users) */}
        {!unlimited && (
          <span style={{
            fontSize: 13, fontFamily: 'monospace', marginLeft: 8, marginBottom: 8,
            color: expired ? '#ef4444' : isLow ? '#f59e0b' : '#6b7280',
          }}>
            {expired ? 'Time up' : `${formatRemaining(remainingSec)} left`}
          </span>
        )}

        {/* Exit */}
        <button
          onClick={onClose}
          style={{ marginLeft: 8, marginBottom: 8, padding: '6px 14px', fontSize: 13, color: '#9ca3af', border: '1px solid #4b5563', borderRadius: 6, background: 'transparent', cursor: 'pointer', height: 34 }}
        >
          Exit
        </button>
      </div>

      {/* ─── Content area ─── */}
      <div style={{
        flex: 1, display: 'flex', overflow: 'hidden',
        flexDirection: terminalMode === 'bottom' ? 'column' : 'row',
      }}>
        {expired ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, background: '#1a1b26' }}>
            <span style={{ fontSize: 48 }}>&#x23F0;</span>
            <p style={{ fontSize: 18, color: '#e5e7eb', fontFamily: 'sans-serif' }}>Time's up!</p>
            <p style={{ fontSize: 14, color: '#9ca3af', fontFamily: 'sans-serif' }}>Your session time limit has been reached.</p>
            <button
              onClick={onClose}
              style={{ marginTop: 8, padding: '10px 28px', fontSize: 15, color: '#fff', background: '#6366f1', border: 'none', borderRadius: 8, cursor: 'pointer' }}
            >
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Main content (apps + docked terminal) */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* ── Sub-bar: terminal reload ── */}
              {termDockedVisible && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '3px 8px', background: '#16161e', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
                  <SubBtn icon={faRotateRight} title="Reload terminal" onClick={() => setTerminalReloadKey((k) => k + 1)} />
                </div>
              )}

              {/* ── Sub-bar: app browser controls ── */}
              {runningApps.map((app) => activeTab === app.key ? (
                <div key={`bar-${app.key}`} style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '3px 8px', background: '#16161e', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
                  <SubBtn icon={faChevronLeft} title="Back" onClick={() => {
                    try {
                      const iframe = iframeRefs.current[app.key];
                      if (!iframe) return;
                      // Only go back if the iframe navigated away from its original URL
                      const currentPath = iframe.contentWindow?.location?.pathname;
                      const originalPath = new URL(app.url, window.location.origin).pathname;
                      if (currentPath && currentPath !== originalPath) iframe.contentWindow.history.back();
                    } catch { /* cross-origin or no navigation */ }
                  }} />
                  <SubBtn icon={faChevronRight} title="Forward" onClick={() => { try { iframeRefs.current[app.key]?.contentWindow?.history.forward(); } catch {} }} />
                  <SubBtn icon={faRotateRight} title="Reload" onClick={() => setAppReloadKeys((prev) => ({ ...prev, [app.key]: (prev[app.key] || 0) + 1 }))} />
                  <span style={{ marginLeft: 8, fontSize: 11, fontFamily: 'monospace', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.url}</span>
                </div>
              ) : null)}

              {/* ── Content panes ── */}
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {/* Docked terminal host */}
                <div
                  ref={(el) => {
                    dockedHostRef.current = el;
                    if (el && terminalContainerRef.current && terminalMode === 'tab' && terminalContainerRef.current.parentNode !== el) {
                      el.appendChild(terminalContainerRef.current);
                    }
                  }}
                  style={{
                    position: 'absolute', inset: 0,
                    display: termDockedVisible ? 'block' : 'none',
                    background: '#1a1b26',
                  }}
                />

                {/* The actual xterm container element — lives in DOM, moved between hosts */}
                <div
                  ref={terminalContainerRef}
                  style={{ width: '100%', height: '100%', background: '#1a1b26' }}
                />

                <TerminalPane userId={userId} visible={termDockedVisible || isDetached} onTimeUpdate={handleTimeUpdate} containerRef={terminalContainerRef} reloadKey={terminalReloadKey} />

                {runningApps.map((app) => {
                  const reloadKey = appReloadKeys[app.key] || 0;
                  // Cache-bust on reload so kids see their latest changes
                  const src = reloadKey > 0 ? `${app.url}?_r=${reloadKey}` : app.url;
                  return (
                    <iframe
                      key={`${app.key}-${reloadKey}`}
                      ref={(el) => { if (el) iframeRefs.current[app.key] = el; }}
                      src={src}
                      title={app.appName}
                      sandbox="allow-scripts allow-same-origin allow-forms"
                      style={{
                        position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none',
                        display: activeTab === app.key ? 'block' : 'none',
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Panel terminal (right or bottom) */}
            {panelTerminal}
          </>
        )}
      </div>

      {/* ─── Floating terminal ─── */}
      {terminalMode === 'float' && !expired && (
        <FloatingTerminal terminalRef={terminalContainerRef} onSetMode={setTerminalMode} />
      )}
    </div>,
    document.body,
  );
}
