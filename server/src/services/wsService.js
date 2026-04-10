import { createExecSession, touchActivity, resizeExec } from './dockerService.js';

export function setupTerminalWs(wss) {
  const activeConnections = new Map(); // kidId -> count
  const MAX_WS_PER_KID = 3;
  console.log('[ws] WebSocket server ready on /ws/terminal');

  // Keepalive: send a WS ping every 25s to every open terminal socket. This
  // keeps the connection warm through Cloudflare (~100s idle cap), reverse
  // proxies, and stateful middleboxes that silently drop idle TCP streams.
  // Without this the terminal looks fine until the user starts typing after
  // being idle, then loses the session. Sockets that don't pong within the
  // next interval are considered dead and terminated so the client can
  // reconnect cleanly.
  const HEARTBEAT_MS = 25_000;
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        try { ws.terminate(); } catch { /* ignore */ }
        continue;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* ignore */ }
    }
  }, HEARTBEAT_MS);
  wss.on('close', () => clearInterval(heartbeat));

  wss.on('connection', async (ws, req) => {
    console.log('[ws] New connection attempt');
    // Mark alive on every pong so the heartbeat interval knows this socket
    // is still responsive. Any real traffic (data from the PTY, resize
    // messages, etc.) doesn't need to touch this because the ping frame is
    // sent unconditionally every interval and the response is what we're
    // gating on.
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    let kidId = null;
    try {
      // 1. Parse ticket from query params
      const url = new URL(req.url, `http://${req.headers.host}`);
      const ticket = url.searchParams.get('ticket');

      if (!ticket) {
        ws.close(4001, 'Missing ticket');
        return;
      }

      // 2. Validate one-time ticket (issued by POST /api/claude/:userId/ws-ticket)
      const { wsTickets } = await import('../routes/claude.js');
      const entry = wsTickets.get(ticket);
      if (!entry || entry.expiresAt < Date.now()) {
        wsTickets.delete(ticket);
        console.log('[ws] REJECTED: invalid or expired ticket');
        ws.close(4001, 'Invalid or expired ticket');
        return;
      }
      wsTickets.delete(ticket); // One-time use

      kidId = entry.kidId;
      const isParent = entry.role === 'parent';
      console.log('[ws] Authenticated via ticket, kidId:', kidId, 'role:', entry.role);

      // 3. Connection limit per kid
      const current = activeConnections.get(kidId) || 0;
      if (current >= MAX_WS_PER_KID) {
        ws.close(4029, 'Too many connections');
        return;
      }
      activeConnections.set(kidId, current + 1);

      // 4. Check daily limit for kids before creating container
      if (!isParent) {
        const { getDailyRemainingSeconds } = await import('../routes/claude.js');
        const remainingSec = getDailyRemainingSeconds(kidId);
        if (remainingSec <= 0) {
          ws.close(4008, 'Daily time limit reached');
          return;
        }
      }

      // 4. Create Docker exec session
      // Look up model preference (dynamic import to avoid circular dep)
      const db = (await import('../db/db.js')).default;
      const userRow = db.prepare('SELECT claude_model FROM users WHERE id = ?').get(kidId);
      console.log('[ws] Creating Docker exec session for kid', kidId, 'model:', userRow?.claude_model || 'sonnet');
      const { exec, stream } = await createExecSession(kidId, { model: userRow?.claude_model });
      console.log('[ws] Docker exec session created successfully');

      // 5. Time limit timers (kids only)
      let warnTimer = null;
      let cutoffTimer = null;

      if (!isParent) {
        const { getDailyRemainingSeconds } = await import('../routes/claude.js');
        const remainingSec = getDailyRemainingSeconds(kidId);
        const remainingMs = remainingSec * 1000;

        ws.send(JSON.stringify({ type: 'time_limit', seconds: remainingSec }));

        const warnMs = remainingMs - 5 * 60 * 1000;
        warnTimer = warnMs > 0 ? setTimeout(() => {
          if (ws.readyState === ws.OPEN) {
            const left = getDailyRemainingSeconds(kidId);
            ws.send(JSON.stringify({ type: 'time_warning', remainingSeconds: left }));
          }
        }, warnMs) : null;

        cutoffTimer = setTimeout(() => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'time_expired' }));
            setTimeout(() => {
              stream.end();
              ws.close(4008, 'Daily time limit reached');
            }, 2000);
          }
        }, remainingMs);
      }

      // Docker stdout -> WebSocket
      stream.on('data', (chunk) => {
        touchActivity(kidId);
        if (ws.readyState === ws.OPEN) {
          ws.send(chunk);
        }
      });

      stream.on('end', () => {
        console.log('[ws] Docker stream ended');
        if (ws.readyState === ws.OPEN) {
          ws.close(1000, 'Session ended');
        }
      });

      stream.on('error', (err) => {
        console.error('[ws] Docker stream error:', err.message);
      });

      // WebSocket -> Docker stdin
      ws.on('message', (data) => {
        touchActivity(kidId);

        // Check for JSON control messages (resize)
        if (typeof data === 'string' || (data instanceof Buffer && data[0] === 0x7b)) {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'resize' && msg.cols && msg.rows) {
              resizeExec(exec, msg.cols, msg.rows);
              return;
            }
          } catch {
            // Not JSON — treat as terminal input
          }
        }

        stream.write(data);
      });

      ws.on('close', () => {
        activeConnections.set(kidId, Math.max(0, (activeConnections.get(kidId) || 1) - 1));
        clearTimeout(warnTimer);
        clearTimeout(cutoffTimer);
        stream.end();
      });

      ws.on('error', () => {
        activeConnections.set(kidId, Math.max(0, (activeConnections.get(kidId) || 1) - 1));
        clearTimeout(warnTimer);
        clearTimeout(cutoffTimer);
        stream.end();
      });
    } catch (err) {
      console.error('[ws] WebSocket terminal error:', err.message);
      // Decrement connection counter on failure
      if (kidId) activeConnections.set(kidId, Math.max(0, (activeConnections.get(kidId) || 1) - 1));
      if (ws.readyState === ws.OPEN) {
        ws.close(4500, 'Container error');
      }
    }
  });
}
