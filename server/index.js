import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import app from './src/app.js';
import { setupTerminalWs } from './src/services/wsService.js';
import { setupMultiplayerWs, isValidMultiplayerOrigin } from './src/services/multiplayerWs.js';

const PORT = process.env.PORT || 3001;
const server = createServer(app);

// ─── WebSocket servers (noServer mode for path-based routing) ────────────────
const terminalWss = new WebSocketServer({ noServer: true });
setupTerminalWs(terminalWss);

const multiplayerWss = new WebSocketServer({ noServer: true });
setupMultiplayerWs(multiplayerWss);

// Route upgrade requests to the correct WebSocket server by path
server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url, `http://${request.headers.host}`);

  if (pathname === '/ws/terminal') {
    terminalWss.handleUpgrade(request, socket, head, (ws) => {
      terminalWss.emit('connection', ws, request);
    });
  } else if (pathname === '/ws/multiplayer') {
    // Reject invalid origins before accepting the WebSocket
    if (!isValidMultiplayerOrigin(request)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    multiplayerWss.handleUpgrade(request, socket, head, (ws) => {
      multiplayerWss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`Family Dashboard server running on port ${PORT}`);
});
