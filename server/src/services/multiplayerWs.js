// ─── Multiplayer WebSocket Handler ───────────────────────────────────────────
// Handles /ws/multiplayer connections: origin validation, app slug validation,
// message routing to room manager, heartbeat, reconnection support.

import db from '../db/db.js';
import { roomManager, generateName } from './roomManager.js';

const HEARTBEAT_MS = 25_000;
const MAX_CONNECTIONS_PER_IP = 10;

// Track connections per IP for basic rate limiting
const ipConnections = new Map(); // ip -> count

// ─── Origin validation ───────────────────────────────────────────────────────

export function isValidMultiplayerOrigin(request) {
  const origin = request.headers.origin || '';
  if (!origin) return true; // non-browser clients (curl, etc.) — app slug validation is the real gate

  let hostname;
  try { hostname = new URL(origin).hostname; } catch { return false; }

  const appsHost = (process.env.APPS_HOST || '').split(':')[0];
  const mainHost = (() => {
    try { return new URL(process.env.MAIN_ORIGIN || '').hostname; } catch { return ''; }
  })();

  // Accept: apps subdomain, main domain, localhost, private networks
  if (appsHost && hostname === appsHost) return true;
  if (mainHost && hostname === mainHost) return true;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
  if (hostname.startsWith('192.168.') || hostname.startsWith('10.')) return true;
  return false;
}

// ─── App slug validation ─────────────────────────────────────────────────────

function validateApp(appSlug) {
  if (!appSlug || typeof appSlug !== 'string') return false;
  const parts = appSlug.split('/');
  if (parts.length !== 2) return false;
  const [username, appName] = parts;

  // Resolve user
  let user = db.prepare('SELECT id FROM users WHERE public_slug = ? AND is_active = 1').get(username);
  if (!user) user = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND is_active = 1').get(username);
  if (!user) return false;

  // Check app exists in metadata
  const app = db.prepare('SELECT 1 FROM app_metadata WHERE user_id = ? AND app_name = ?').get(user.id, appName);
  return !!app;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

export function setupMultiplayerWs(wss) {
  console.log('[mp] Multiplayer WebSocket ready on /ws/multiplayer');

  // Heartbeat: ping every 25s, terminate unresponsive sockets
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws._mpAlive === false) {
        try { ws.terminate(); } catch { /* ignore */ }
        continue;
      }
      ws._mpAlive = false;
      try { ws.ping(); } catch { /* ignore */ }
    }
  }, HEARTBEAT_MS);
  wss.on('close', () => clearInterval(heartbeat));

  wss.on('connection', (ws, request) => {
    ws._mpAlive = true;
    ws.on('pong', () => { ws._mpAlive = true; });

    // Rate limit by IP
    const ip = request.headers['x-forwarded-for']?.split(',')[0]?.trim() || request.socket.remoteAddress || 'unknown';
    const current = ipConnections.get(ip) || 0;
    if (current >= MAX_CONNECTIONS_PER_IP) {
      ws.close(4029, 'Too many connections');
      return;
    }
    ipConnections.set(ip, current + 1);

    // Parse query params
    const url = new URL(request.url, `http://${request.headers.host}`);
    const appSlug = url.searchParams.get('app');

    // Validate app
    if (!validateApp(appSlug)) {
      ws.close(4004, 'Invalid app');
      ipConnections.set(ip, Math.max(0, (ipConnections.get(ip) || 1) - 1));
      return;
    }

    // Player identity
    const playerId = url.searchParams.get('playerId') || crypto.randomUUID();
    const playerName = url.searchParams.get('playerName') || generateName();
    const reconnectRoom = url.searchParams.get('reconnectRoom') || null;

    // Send welcome
    send(ws, {
      type: 'welcome',
      playerId,
      playerName,
      app: appSlug,
    });

    // Try auto-reconnect to room
    if (reconnectRoom) {
      const result = roomManager.reconnectToRoom({ playerId, roomCode: reconnectRoom, ws, ip });
      if (!result.error) {
        send(ws, { type: 'room_joined', room: result.room.toJoinInfo() });
      }
      // If reconnect failed, that's OK — player just lands in the lobby
    }

    // ─── Message handling ────────────────────────────────────────────────
    ws.on('message', (raw) => {
      ws._mpAlive = true;
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (!msg || typeof msg.type !== 'string') return;

      switch (msg.type) {
        case 'create': {
          // Leave any current room first
          roomManager.leaveRoom(playerId);
          const result = roomManager.createRoom({
            appSlug,
            playerId,
            playerName,
            ws,
            ip,
            visibility: msg.visibility,
            passcode: typeof msg.passcode === 'string' ? msg.passcode : undefined,
            maxPlayers: typeof msg.maxPlayers === 'number' ? msg.maxPlayers : undefined,
          });
          if (result.error) {
            send(ws, { type: 'error', message: result.error });
          } else {
            send(ws, { type: 'room_created', room: result.room.toJoinInfo() });
          }
          break;
        }

        case 'join': {
          roomManager.leaveRoom(playerId);
          const result = roomManager.joinRoom({
            code: msg.code,
            playerId,
            playerName,
            ws,
            ip,
            passcode: typeof msg.passcode === 'string' ? msg.passcode : undefined,
            appSlug,
          });
          if (result.error) {
            send(ws, { type: 'error', message: result.error });
          } else {
            send(ws, { type: 'room_joined', room: result.room.toJoinInfo() });
          }
          break;
        }

        case 'leave': {
          roomManager.leaveRoom(playerId);
          send(ws, { type: 'room_left' });
          break;
        }

        case 'list': {
          const rooms = roomManager.listRooms(appSlug);
          send(ws, { type: 'room_list', rooms });
          break;
        }

        case 'state': {
          if (msg.data !== undefined) {
            roomManager.relayState(playerId, msg.data);
          }
          break;
        }

        case 'message': {
          if (typeof msg.id === 'string' && msg.id.length <= 50) {
            roomManager.relayMessage(playerId, msg.id);
          }
          break;
        }

        case 'kick': {
          if (typeof msg.playerId === 'string') {
            const result = roomManager.kickPlayer(playerId, msg.playerId);
            if (result.error) send(ws, { type: 'error', message: result.error });
          }
          break;
        }
      }
    });

    // ─── Cleanup on disconnect ───────────────────────────────────────────
    const cleanup = () => {
      ipConnections.set(ip, Math.max(0, (ipConnections.get(ip) || 1) - 1));
      roomManager.handleDisconnect(playerId);
    };
    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });
}

function send(ws, msg) {
  try { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); } catch { /* ignore */ }
}

// Need crypto for UUID generation
import crypto from 'crypto';
