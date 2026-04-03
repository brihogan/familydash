import { WebSocketServer } from 'ws';
import { createExecSession, touchActivity, resizeExec } from './dockerService.js';

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws/terminal' });
  console.log('[ws] WebSocket server ready on /ws/terminal');

  wss.on('connection', async (ws, req) => {
    console.log('[ws] New connection attempt');
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

      const kidId = entry.kidId;
      console.log('[ws] Authenticated via ticket, kidId:', kidId);

      // 3. Create Docker exec session
      console.log('[ws] Creating Docker exec session for kid', kidId);
      const { exec, stream } = await createExecSession(kidId);
      console.log('[ws] Docker exec session created successfully');

      // Docker stdout -> WebSocket
      stream.on('data', (chunk) => {
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
        stream.end();
      });

      ws.on('error', () => {
        stream.end();
      });
    } catch (err) {
      console.error('[ws] WebSocket terminal error:', err.message, err.stack);
      if (ws.readyState === ws.OPEN) {
        ws.close(4500, 'Container error');
      }
    }
  });
}
