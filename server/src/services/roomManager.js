// ─── Multiplayer Room Manager ────────────────────────────────────────────────
// In-memory room lifecycle: create, join, leave, kick, list, state relay,
// message relay, auto-cleanup of idle rooms, disconnect grace period.

const ADJECTIVES = [
  'Swift','Brave','Clever','Sneaky','Mighty','Lucky','Turbo','Cosmic','Pixel',
  'Neon','Zippy','Fuzzy','Epic','Stealth','Rocket','Shadow','Thunder','Crystal',
  'Glow','Hyper','Wild','Mega','Ultra','Blaze','Storm','Flash','Frost','Star',
  'Solar','Lunar','Aqua','Iron','Copper','Golden','Silver','Crimson','Violet',
  'Ember','Nimble','Rapid',
];
const ANIMALS = [
  'Fox','Panda','Owl','Wolf','Tiger','Falcon','Otter','Koala','Penguin','Lynx',
  'Hawk','Bear','Eagle','Dolphin','Jaguar','Raven','Gecko','Cobra','Shark',
  'Phoenix','Dragon','Panther','Leopard','Badger','Moose','Bison','Crane',
  'Finch','Robin','Marten','Turtle','Squid','Parrot','Seal','Coyote','Puma',
  'Ferret','Heron','Osprey','Mantis',
];

// Characters that are easy to distinguish (no O/0, I/1, L)
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LEN = 4;
const CLEANUP_INTERVAL_MS = 60_000;       // check every 60s
const EMPTY_ROOM_TTL_MS = 10 * 60_000;    // remove empty rooms after 10 min
const DISCONNECT_GRACE_MS = 30_000;        // hold spot for 30s on disconnect
const MAX_ROOMS = 200;                     // global cap
const MAX_ROOMS_PER_APP = 50;
const MAX_PLAYERS_CAP = 16;
const STATE_THROTTLE_MS = 50;              // max 20 state updates/sec per player
const MESSAGE_THROTTLE_MS = 200;           // max 5 messages/sec per player
const BAN_DURATION_MS = 5 * 60_000;        // kicked players banned for 5 min

// ─── Name generation ─────────────────────────────────────────────────────────

export function generateName() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return adj + animal;
}

// ─── Room name generation (safe — no user input) ────────────────────────────

const COLORS = [
  'Red','Blue','Green','Gold','Pink','Teal','Plum','Jade','Mint','Lime',
  'Sage','Coral','Amber','Ruby','Onyx','Navy','Aqua','Rose','Ice','Sun',
];
const PLACES = [
  'Castle','Mountain','River','Forest','Valley','Bridge','Tower','Island',
  'Garden','Harbor','Canyon','Meadow','Comet','Ridge','Falls','Lake','Cave',
  'Peak','Reef','Cove','Dune','Fort','Den','Bay','Nest','Mesa','Glen',
];

function generateRoomName() {
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const place = PLACES[Math.floor(Math.random() * PLACES.length)];
  return color + ' ' + place;
}

// ─── Room code generation ────────────────────────────────────────────────────

function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LEN; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

// ─── Room class ──────────────────────────────────────────────────────────────

class Room {
  constructor({ code, name, appSlug, hostId, visibility, passcode, maxPlayers }) {
    this.code = code;
    this.name = name;
    this.appSlug = appSlug;             // "username/appName"
    this.hostId = hostId;
    this.visibility = visibility;       // 'public' | 'unlisted' | 'private'
    this.passcode = passcode || null;
    this.maxPlayers = Math.min(maxPlayers || 8, MAX_PLAYERS_CAP);
    this.players = new Map();           // playerId -> { id, name, ip, ws, state, joinedAt }
    this.disconnected = new Map();      // playerId -> { name, state, disconnectedAt }
    this.bans = new Map();              // key (playerId or ip) -> expiresAt
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
  }

  get playerCount() {
    return this.players.size;
  }

  get isEmpty() {
    return this.players.size === 0 && this.disconnected.size === 0;
  }

  touch() {
    this.lastActivity = Date.now();
  }

  addPlayer(id, name, ws, ip) {
    this.players.set(id, { id, name, ip, ws, state: null, joinedAt: Date.now(), lastState: 0, lastMsg: 0 });
    this.disconnected.delete(id);
    this.touch();
  }

  banPlayer(playerId) {
    this.bans.set(playerId, Date.now() + BAN_DURATION_MS);
  }

  isBanned(playerId) {
    const expiresAt = this.bans.get(playerId);
    if (expiresAt && expiresAt > Date.now()) return true;
    return false;
  }

  purgeExpiredBans() {
    const now = Date.now();
    for (const [key, expiresAt] of this.bans) {
      if (expiresAt <= now) this.bans.delete(key);
    }
  }

  removePlayer(id) {
    const p = this.players.get(id);
    this.players.delete(id);
    this.disconnected.delete(id);
    // Transfer host if host left
    if (id === this.hostId && this.players.size > 0) {
      this.hostId = this.players.keys().next().value;
      return { hostChanged: true, newHostId: this.hostId };
    }
    return { hostChanged: false };
  }

  disconnectPlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.disconnected.set(id, { name: p.name, state: p.state, disconnectedAt: Date.now() });
    this.players.delete(id);
    this.touch();
  }

  reconnectPlayer(id, ws) {
    const d = this.disconnected.get(id);
    if (!d) return false;
    if (Date.now() - d.disconnectedAt > DISCONNECT_GRACE_MS) {
      this.disconnected.delete(id);
      return false;
    }
    this.players.set(id, { id, name: d.name, ws, state: d.state, joinedAt: Date.now(), lastState: 0, lastMsg: 0 });
    this.disconnected.delete(id);
    this.touch();
    return true;
  }

  purgeExpiredDisconnects() {
    const now = Date.now();
    for (const [id, d] of this.disconnected) {
      if (now - d.disconnectedAt > DISCONNECT_GRACE_MS) {
        this.disconnected.delete(id);
      }
    }
  }

  broadcast(msg, excludeId) {
    const data = JSON.stringify(msg);
    for (const [id, p] of this.players) {
      if (id === excludeId) continue;
      try { if (p.ws.readyState === 1) p.ws.send(data); } catch { /* ignore */ }
    }
  }

  toListEntry() {
    return {
      code: this.code,
      name: this.name,
      hostName: this.players.get(this.hostId)?.name || '?',
      playerCount: this.playerCount,
      maxPlayers: this.maxPlayers,
      visibility: this.visibility,
    };
  }

  toJoinInfo() {
    const players = [];
    for (const [, p] of this.players) {
      players.push({ id: p.id, name: p.name, isHost: p.id === this.hostId, state: p.state });
    }
    return {
      code: this.code,
      name: this.name,
      hostId: this.hostId,
      maxPlayers: this.maxPlayers,
      visibility: this.visibility,
      players,
    };
  }
}

// ─── Room Manager ────────────────────────────────────────────────────────────

class RoomManager {
  constructor() {
    this.rooms = new Map();         // code -> Room
    this.playerRoom = new Map();    // playerId -> roomCode
    this._cleanupTimer = setInterval(() => this._cleanup(), CLEANUP_INTERVAL_MS);
  }

  createRoom({ appSlug, playerId, playerName, ws, ip, visibility, passcode, maxPlayers }) {
    // Enforce per-app room cap
    let appCount = 0;
    for (const r of this.rooms.values()) {
      if (r.appSlug === appSlug) appCount++;
    }
    if (appCount >= MAX_ROOMS_PER_APP) return { error: 'Too many rooms for this app' };
    if (this.rooms.size >= MAX_ROOMS) return { error: 'Server room limit reached' };

    // Generate unique code
    let code;
    let attempts = 0;
    do {
      code = generateCode();
      attempts++;
    } while (this.rooms.has(code) && attempts < 100);
    if (this.rooms.has(code)) return { error: 'Could not generate room code' };

    const room = new Room({
      code,
      name: generateRoomName(),
      appSlug,
      hostId: playerId,
      visibility: ['public', 'unlisted', 'private'].includes(visibility) ? visibility : 'public',
      passcode: visibility === 'private' ? (passcode || '').slice(0, 20) : null,
      maxPlayers,
    });
    room.addPlayer(playerId, playerName, ws, ip);
    this.rooms.set(code, room);
    this.playerRoom.set(playerId, code);

    console.log(`[mp] Room ${code} created by ${playerName} for ${appSlug} (${visibility})`);
    return { room };
  }

  joinRoom({ code, playerId, playerName, ws, ip, passcode, appSlug }) {
    const room = this.rooms.get(code?.toUpperCase());
    if (!room) return { error: 'Room not found' };
    if (room.isBanned(playerId)) return { error: 'You are temporarily banned from this room' };
    if (room.appSlug !== appSlug) return { error: 'Room is for a different app' };
    if (room.playerCount >= room.maxPlayers) return { error: 'Room is full' };
    if (room.visibility === 'private' && room.passcode && room.passcode !== passcode) {
      return { error: 'Incorrect passcode' };
    }

    room.addPlayer(playerId, playerName, ws, ip);
    this.playerRoom.set(playerId, room.code);

    // Notify existing players
    room.broadcast({ type: 'player_joined', player: { id: playerId, name: playerName, isHost: false } }, playerId);

    console.log(`[mp] ${playerName} joined room ${room.code}`);
    return { room };
  }

  reconnectToRoom({ playerId, roomCode, ws, ip }) {
    const room = this.rooms.get(roomCode);
    if (!room) return { error: 'Room no longer exists' };
    if (room.isBanned(playerId)) return { error: 'You are temporarily banned from this room' };
    if (!room.reconnectPlayer(playerId, ws)) return { error: 'Reconnect window expired' };

    this.playerRoom.set(playerId, room.code);
    const playerName = room.players.get(playerId)?.name || '?';

    // Notify others that player is back
    room.broadcast({ type: 'player_joined', player: { id: playerId, name: playerName, isHost: playerId === room.hostId } }, playerId);

    console.log(`[mp] ${playerName} reconnected to room ${room.code}`);
    return { room };
  }

  leaveRoom(playerId) {
    const code = this.playerRoom.get(playerId);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room) { this.playerRoom.delete(playerId); return; }

    const playerName = room.players.get(playerId)?.name || '?';
    const { hostChanged, newHostId } = room.removePlayer(playerId);
    this.playerRoom.delete(playerId);

    room.broadcast({ type: 'player_left', playerId, playerName });
    if (hostChanged) {
      const newHost = room.players.get(newHostId);
      room.broadcast({ type: 'host_changed', playerId: newHostId, playerName: newHost?.name || '?' });
    }

    console.log(`[mp] ${playerName} left room ${code}`);
  }

  // Called when a player's WS disconnects (may reconnect)
  handleDisconnect(playerId) {
    const code = this.playerRoom.get(playerId);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room) { this.playerRoom.delete(playerId); return; }

    const playerName = room.players.get(playerId)?.name || '?';
    room.disconnectPlayer(playerId);
    // Don't remove from playerRoom yet — they might reconnect
    // Notify others
    room.broadcast({ type: 'player_left', playerId, playerName });

    // If host disconnected, transfer
    if (playerId === room.hostId && room.players.size > 0) {
      room.hostId = room.players.keys().next().value;
      const newHost = room.players.get(room.hostId);
      room.broadcast({ type: 'host_changed', playerId: room.hostId, playerName: newHost?.name || '?' });
    }
  }

  kickPlayer(hostId, targetId) {
    const code = this.playerRoom.get(hostId);
    if (!code) return { error: 'Not in a room' };
    const room = this.rooms.get(code);
    if (!room) return { error: 'Room not found' };
    if (room.hostId !== hostId) return { error: 'Only the host can kick' };
    if (targetId === hostId) return { error: 'Cannot kick yourself' };

    const target = room.players.get(targetId);
    if (!target) return { error: 'Player not found' };

    // Ban the player for 5 minutes (by ID — survives page refresh within same tab)
    room.banPlayer(targetId);

    // Notify the kicked player
    try { if (target.ws.readyState === 1) target.ws.send(JSON.stringify({ type: 'kicked' })); } catch { /* ignore */ }

    const targetName = target.name;
    room.removePlayer(targetId);
    this.playerRoom.delete(targetId);

    room.broadcast({ type: 'player_left', playerId: targetId, playerName: targetName });
    console.log(`[mp] ${targetName} kicked from room ${code}`);
    return { ok: true };
  }

  listRooms(appSlug) {
    const list = [];
    for (const room of this.rooms.values()) {
      if (room.appSlug !== appSlug) continue;
      if (room.visibility === 'unlisted') continue;
      if (room.playerCount === 0) continue;
      list.push(room.toListEntry());
    }
    return list;
  }

  relayState(playerId, data) {
    const code = this.playerRoom.get(playerId);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room) return;
    const player = room.players.get(playerId);
    if (!player) return;

    // Throttle
    const now = Date.now();
    if (now - player.lastState < STATE_THROTTLE_MS) return;
    player.lastState = now;
    player.state = data;
    room.touch();

    room.broadcast({ type: 'state', playerId, playerName: player.name, data }, playerId);
  }

  relayMessage(playerId, messageId) {
    const code = this.playerRoom.get(playerId);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room) return;
    const player = room.players.get(playerId);
    if (!player) return;

    // Throttle
    const now = Date.now();
    if (now - player.lastMsg < MESSAGE_THROTTLE_MS) return;
    player.lastMsg = now;
    room.touch();

    room.broadcast({ type: 'message', playerId, playerName: player.name, id: messageId }, playerId);
  }

  getPlayerRoom(playerId) {
    const code = this.playerRoom.get(playerId);
    return code ? this.rooms.get(code) : null;
  }

  _cleanup() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      room.purgeExpiredDisconnects();
      room.purgeExpiredBans();
      if (room.players.size === 0 && room.disconnected.size === 0 &&
          now - room.lastActivity > EMPTY_ROOM_TTL_MS) {
        this.rooms.delete(code);
        console.log(`[mp] Room ${code} cleaned up (idle)`);
      }
    }
  }

  shutdown() {
    clearInterval(this._cleanupTimer);
  }
}

// Singleton
export const roomManager = new RoomManager();
export default roomManager;
