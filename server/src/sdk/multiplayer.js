// ─── FamilyDash Multiplayer SDK ──────────────────────────────────────────────
// Self-contained browser SDK for multiplayer rooms. No dependencies.
// iPad-hardened: visibilitychange, pageshow, heartbeat, exponential backoff.
// Built-in UI: lobby overlay, status badge, player list with kick.
(function () {
  'use strict';
  if (window.MultiPlayer) return; // already loaded

  // ─── Fun name generator ──────────────────────────────────────────────
  var ADJS = ['Swift','Brave','Clever','Sneaky','Mighty','Lucky','Turbo','Cosmic',
    'Pixel','Neon','Zippy','Fuzzy','Epic','Stealth','Rocket','Shadow','Thunder',
    'Crystal','Glow','Hyper','Wild','Mega','Ultra','Blaze','Storm','Flash',
    'Frost','Star','Solar','Lunar','Aqua','Iron','Golden','Silver','Crimson',
    'Violet','Ember','Nimble','Rapid','Copper'];
  var ANIMALS = ['Fox','Panda','Owl','Wolf','Tiger','Falcon','Otter','Koala',
    'Penguin','Lynx','Hawk','Bear','Eagle','Dolphin','Jaguar','Raven','Gecko',
    'Cobra','Shark','Phoenix','Dragon','Panther','Leopard','Badger','Moose',
    'Bison','Crane','Finch','Robin','Marten','Turtle','Squid','Parrot','Seal',
    'Coyote','Puma','Ferret','Heron','Osprey','Mantis'];
  function randomName() {
    return ADJS[Math.floor(Math.random()*ADJS.length)] + ANIMALS[Math.floor(Math.random()*ANIMALS.length)];
  }

  // ─── App detection ───────────────────────────────────────────────────
  function detectApp() {
    var p = location.pathname;
    if (p.indexOf('/apps/') === 0) p = p.slice(5);
    var parts = p.split('/').filter(Boolean);
    return parts.length >= 2 ? parts[0] + '/' + parts[1] : null;
  }

  // ─── Session storage helpers ─────────────────────────────────────────
  var SS_ID = 'mp_playerId';
  var SS_NAME = 'mp_playerName';
  var SS_ROOM = 'mp_roomCode';
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch {} }
  function ssRemove(k) { try { sessionStorage.removeItem(k); } catch {} }

  // ─── CSS ─────────────────────────────────────────────────────────────
  var CSS = '\
#mp-root,#mp-root *{all:revert;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}\
#mp-badge{position:fixed;bottom:env(safe-area-inset-bottom,12px);right:12px;z-index:99999;\
  padding:8px 14px;border-radius:20px;cursor:pointer;font-size:14px;font-weight:600;\
  color:#fff;background:#6d28d9;box-shadow:0 2px 12px rgba(0,0,0,.35);display:flex;\
  align-items:center;gap:6px;user-select:none;-webkit-tap-highlight-color:transparent;\
  transition:background .15s,transform .1s;margin-bottom:12px;}\
#mp-badge:active{transform:scale(.95);}\
#mp-badge .mp-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}\
#mp-badge .mp-dot.on{background:#4ade80;}#mp-badge .mp-dot.off{background:#f87171;}\
#mp-badge .mp-dot.warn{background:#fbbf24;}\
\
.mp-overlay{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);\
  display:flex;align-items:center;justify-content:center;padding:16px;\
  -webkit-tap-highlight-color:transparent;}\
.mp-panel{background:#1e1b4b;color:#e5e7eb;border-radius:16px;width:100%;max-width:400px;\
  max-height:85vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.5);}\
.mp-panel-header{display:flex;align-items:center;justify-content:space-between;\
  padding:16px 20px 12px;border-bottom:1px solid rgba(255,255,255,.08);}\
.mp-panel-header h2{margin:0;font-size:18px;color:#fff;}\
.mp-close{background:none;border:none;color:#9ca3af;font-size:22px;cursor:pointer;\
  padding:4px 8px;border-radius:8px;line-height:1;}\
.mp-close:hover{color:#fff;background:rgba(255,255,255,.1);}\
.mp-body{padding:16px 20px 20px;}\
\
.mp-section{margin-bottom:16px;}\
.mp-section:last-child{margin-bottom:0;}\
.mp-section-title{font-size:12px;text-transform:uppercase;letter-spacing:.5px;\
  color:#9ca3af;margin-bottom:8px;font-weight:600;}\
\
.mp-name-row{display:flex;align-items:center;gap:8px;margin-bottom:4px;}\
.mp-name-display{font-size:16px;font-weight:600;color:#c4b5fd;}\
.mp-btn-sm{background:rgba(139,92,246,.3);border:1px solid rgba(139,92,246,.4);\
  color:#c4b5fd;padding:4px 10px;border-radius:8px;font-size:12px;cursor:pointer;}\
.mp-btn-sm:hover{background:rgba(139,92,246,.5);}\
\
.mp-input{width:100%;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.12);\
  background:rgba(255,255,255,.06);color:#fff;font-size:14px;outline:none;}\
.mp-input:focus{border-color:rgba(139,92,246,.5);}\
.mp-input::placeholder{color:#6b7280;}\
\
.mp-select{width:100%;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.12);\
  background:rgba(15,13,40,.8);color:#fff;font-size:14px;outline:none;appearance:auto;}\
\
.mp-btn{width:100%;padding:12px;border-radius:12px;border:none;font-size:15px;\
  font-weight:600;cursor:pointer;transition:background .15s;}\
.mp-btn-primary{background:#7c3aed;color:#fff;}\
.mp-btn-primary:hover{background:#6d28d9;}\
.mp-btn-danger{background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.2);}\
.mp-btn-danger:hover{background:rgba(239,68,68,.25);}\
\
.mp-room-card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);\
  border-radius:12px;padding:12px;margin-bottom:8px;cursor:pointer;\
  transition:background .15s;display:flex;align-items:center;justify-content:space-between;}\
.mp-room-card:hover{background:rgba(255,255,255,.1);}\
.mp-room-name{font-weight:600;color:#fff;font-size:14px;}\
.mp-room-info{font-size:12px;color:#9ca3af;margin-top:2px;}\
.mp-room-players{font-size:13px;color:#c4b5fd;white-space:nowrap;}\
.mp-empty{text-align:center;color:#6b7280;padding:16px;font-size:14px;}\
\
.mp-player-row{display:flex;align-items:center;justify-content:space-between;\
  padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06);}\
.mp-player-row:last-child{border-bottom:none;}\
.mp-player-name{font-size:14px;color:#e5e7eb;display:flex;align-items:center;gap:6px;}\
.mp-crown{color:#fbbf24;font-size:14px;}\
.mp-you{font-size:11px;color:#9ca3af;}\
.mp-kick{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.2);\
  color:#f87171;padding:4px 10px;border-radius:8px;font-size:12px;cursor:pointer;}\
.mp-kick:hover{background:rgba(239,68,68,.25);}\
\
.mp-row{display:flex;gap:8px;margin-bottom:8px;}\
.mp-row .mp-input{flex:1;}\
.mp-row .mp-btn{width:auto;padding:10px 16px;}\
.mp-passcode-row{margin-top:8px;display:none;max-width:200px;}\
\
.mp-error{background:rgba(239,68,68,.12);color:#f87171;padding:10px 14px;\
  border-radius:10px;font-size:13px;margin-bottom:12px;display:none;}\
\
.mp-toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:100001;\
  padding:10px 20px;border-radius:12px;font-size:14px;font-weight:500;\
  color:#fff;pointer-events:none;opacity:0;transition:opacity .3s;\
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}\
.mp-toast.show{opacity:1;}\
.mp-toast.info{background:#6d28d9;}\
.mp-toast.warn{background:#d97706;}\
';

  // ─── MultiPlayer class ───────────────────────────────────────────────
  function MultiPlayer(opts) {
    opts = opts || {};
    this._app = detectApp();
    if (!this._app) { console.error('[MultiPlayer] Could not detect app from URL'); return; }

    this._handlers = {};
    this._ws = null;
    this._connected = false;
    this._roomCode = null;
    this._room = null;       // current room info { code, name, hostId, players, ... }
    this._players = [];      // current player list
    this._backoff = 100;
    this._maxBackoff = 5000;
    this._reconnecting = false;
    this._destroyed = false;

    // Player identity
    this._playerId = ssGet(SS_ID) || null;
    this._playerName = ssGet(SS_NAME) || null;
    if (!this._playerName) {
      this._playerName = randomName();
      ssSet(SS_NAME, this._playerName);
    }

    // Inject styles + UI
    this._injectCSS();
    this._buildUI();
    this._connect();
    this._setupVisibilityHandlers();
  }

  var P = MultiPlayer.prototype;

  // ─── Event system ────────────────────────────────────────────────────
  P.on = function (evt, fn) {
    if (!this._handlers[evt]) this._handlers[evt] = [];
    this._handlers[evt].push(fn);
    return this;
  };
  P.off = function (evt, fn) {
    if (!this._handlers[evt]) return this;
    this._handlers[evt] = this._handlers[evt].filter(function (f) { return f !== fn; });
    return this;
  };
  P._emit = function (evt) {
    var args = Array.prototype.slice.call(arguments, 1);
    var fns = this._handlers[evt];
    if (fns) fns.forEach(function (fn) { try { fn.apply(null, args); } catch (e) { console.error('[MultiPlayer]', e); } });
  };

  // ─── Public API ──────────────────────────────────────────────────────
  P.sendState = function (data) { this._send({ type: 'state', data: data }); };
  P.sendMessage = function (id) { this._send({ type: 'message', id: id }); };
  P.getPlayers = function () { return this._players.slice(); };
  P.getMe = function () { return { id: this._playerId, name: this._playerName }; };
  P.isHost = function () { return this._room && this._room.hostId === this._playerId; };
  P.getRoomCode = function () { return this._roomCode; };
  P.isInRoom = function () { return !!this._roomCode; };
  P.showLobby = function () { this._showLobby(); };

  P.createRoom = function (opts) {
    opts = opts || {};
    this._send({
      type: 'create',
      visibility: opts.visibility || 'public',
      passcode: opts.passcode,
      maxPlayers: opts.maxPlayers || 8,
    });
  };

  P.joinRoom = function (code, opts) {
    opts = opts || {};
    this._send({ type: 'join', code: code, passcode: opts.passcode });
  };

  P.leaveRoom = function () {
    this._send({ type: 'leave' });
    // Emit leave for every other player so game code cleans up its tracking
    var self = this;
    this._players.forEach(function (p) {
      if (p.id !== self._playerId) self._emit('leave', { id: p.id, name: p.name });
    });
    this._roomCode = null;
    this._room = null;
    this._players = [];
    ssRemove(SS_ROOM);
    this._updateBadge();
    this._emit('leave_room');
  };

  P.destroy = function () {
    this._destroyed = true;
    if (this._ws) this._ws.close();
    var el = document.getElementById('mp-root');
    if (el) el.remove();
    var st = document.getElementById('mp-style');
    if (st) st.remove();
  };

  // ─── WebSocket connection (iPad-hardened) ────────────────────────────
  P._connect = function () {
    if (this._destroyed) return;
    var self = this;
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var url = proto + '//' + location.host + '/ws/multiplayer?app=' + encodeURIComponent(this._app);
    if (this._playerId) url += '&playerId=' + encodeURIComponent(this._playerId);
    if (this._playerName) url += '&playerName=' + encodeURIComponent(this._playerName);
    var reconnectRoom = ssGet(SS_ROOM);
    if (reconnectRoom) url += '&reconnectRoom=' + encodeURIComponent(reconnectRoom);

    try { this._ws = new WebSocket(url); } catch (e) { this._scheduleReconnect(); return; }

    this._ws.onopen = function () {
      self._connected = true;
      self._backoff = 100;
      self._reconnecting = false;
      self._updateBadge();
    };

    this._ws.onmessage = function (e) {
      var msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      self._handleMessage(msg);
    };

    this._ws.onclose = function () {
      self._connected = false;
      self._updateBadge();
      self._scheduleReconnect();
    };

    this._ws.onerror = function () {
      // onclose will fire after onerror
    };
  };

  P._scheduleReconnect = function () {
    if (this._destroyed || this._reconnecting) return;
    this._reconnecting = true;
    var self = this;
    var delay = Math.min(this._backoff + Math.random() * 100, this._maxBackoff);
    this._backoff = Math.min(this._backoff * 2, this._maxBackoff);
    setTimeout(function () {
      self._reconnecting = false;
      self._connect();
    }, delay);
  };

  P._send = function (msg) {
    if (this._ws && this._ws.readyState === 1) {
      this._ws.send(JSON.stringify(msg));
    }
  };

  // ─── iPad / mobile visibility handling ───────────────────────────────
  P._setupVisibilityHandlers = function () {
    var self = this;

    // visibilitychange: fires when tab is hidden/shown, screen locks/unlocks
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        // Tab became visible — check if WS is still alive
        if (!self._ws || self._ws.readyState !== 1) {
          self._backoff = 100; // reset backoff for quick reconnect
          self._connect();
        } else {
          // Send a probe to see if the connection is actually alive.
          // iOS Safari can leave readyState=OPEN on a dead socket.
          self._send({ type: 'ping' });
          self._visibilityProbe = setTimeout(function () {
            // If we don't get a pong-like response within 3s, reconnect
            if (self._ws && self._ws.readyState === 1) {
              self._ws.close();
            }
          }, 3000);
        }
      }
    });

    // pageshow: fires when page is restored from bfcache (iOS Safari)
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) {
        self._backoff = 100;
        if (!self._ws || self._ws.readyState !== 1) {
          self._connect();
        }
      }
    });

    // online/offline events
    window.addEventListener('online', function () {
      if (!self._connected && !self._reconnecting) {
        self._backoff = 100;
        self._connect();
      }
    });
  };

  // ─── Message handling ────────────────────────────────────────────────
  P._handleMessage = function (msg) {
    // Clear visibility probe on any message from server
    if (this._visibilityProbe) { clearTimeout(this._visibilityProbe); this._visibilityProbe = null; }

    switch (msg.type) {
      case 'welcome':
        this._playerId = msg.playerId;
        this._playerName = msg.playerName;
        ssSet(SS_ID, msg.playerId);
        ssSet(SS_NAME, msg.playerName);
        this._emit('ready', { id: msg.playerId, name: msg.playerName });
        break;

      case 'room_created':
      case 'room_joined':
        this._roomCode = msg.room.code;
        this._room = msg.room;
        this._players = msg.room.players || [];
        ssSet(SS_ROOM, msg.room.code);
        this._updateBadge();
        this._closeLobby();
        this._emit('room', { code: msg.room.code, name: msg.room.name, players: this._players });
        break;

      case 'room_left':
        this._roomCode = null;
        this._room = null;
        this._players = [];
        ssRemove(SS_ROOM);
        this._updateBadge();
        break;

      case 'player_joined':
        this._players.push(msg.player);
        if (this._room) this._room.players = this._players;
        this._updateBadge();
        this._updatePlayerList();
        this._toast(msg.player.name + ' joined', 'info');
        this._emit('join', msg.player);
        break;

      case 'player_left':
        this._players = this._players.filter(function (p) { return p.id !== msg.playerId; });
        if (this._room) this._room.players = this._players;
        this._updateBadge();
        this._updatePlayerList();
        this._toast(msg.playerName + ' left', 'info');
        this._emit('leave', { id: msg.playerId, name: msg.playerName });
        break;

      case 'host_changed':
        if (this._room) this._room.hostId = msg.playerId;
        // Update isHost flags
        this._players.forEach(function (p) { p.isHost = p.id === msg.playerId; });
        this._updatePlayerList();
        if (msg.playerId === this._playerId) this._toast('You are now the host!', 'info');
        this._emit('host_changed', { id: msg.playerId, name: msg.playerName });
        break;

      case 'state':
        this._emit('state', { id: msg.playerId, name: msg.playerName }, msg.data);
        break;

      case 'message':
        this._emit('message', { id: msg.playerId, name: msg.playerName }, msg.id);
        break;

      case 'kicked':
        // Emit leave for every other player so game code cleans up its tracking
        var self2 = this;
        this._players.forEach(function (p) {
          if (p.id !== self2._playerId) self2._emit('leave', { id: p.id, name: p.name });
        });
        this._roomCode = null;
        this._room = null;
        this._players = [];
        ssRemove(SS_ROOM);
        this._updateBadge();
        this._toast('You were kicked from the room', 'warn');
        this._emit('kicked');
        break;

      case 'room_list':
        this._renderRoomList(msg.rooms);
        break;

      case 'error':
        this._showError(msg.message);
        this._emit('error', msg.message);
        break;
    }
  };

  // ─── CSS injection ───────────────────────────────────────────────────
  P._injectCSS = function () {
    if (document.getElementById('mp-style')) return;
    var style = document.createElement('style');
    style.id = 'mp-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  };

  // ─── Toast notifications ─────────────────────────────────────────────
  P._toast = function (text, type) {
    var el = document.getElementById('mp-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mp-toast';
      el.className = 'mp-toast';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.className = 'mp-toast ' + (type || 'info') + ' show';
    clearTimeout(this._toastTimer);
    var self = this;
    this._toastTimer = setTimeout(function () { el.className = 'mp-toast'; }, 2500);
  };

  // ─── UI building ─────────────────────────────────────────────────────
  P._buildUI = function () {
    // Badge (floating button)
    var badge = document.createElement('div');
    badge.id = 'mp-badge';
    badge.innerHTML = '<span class="mp-dot off"></span> Multiplayer';
    var self = this;
    badge.addEventListener('click', function (e) {
      e.stopPropagation();
      if (self._roomCode) {
        self._togglePlayerList();
      } else {
        self._showLobby();
      }
    });
    document.body.appendChild(badge);
    this._badge = badge;
  };

  P._updateBadge = function () {
    if (!this._badge) return;
    var dot = this._badge.querySelector('.mp-dot');
    if (this._roomCode) {
      dot.className = 'mp-dot ' + (this._connected ? 'on' : 'warn');
      this._badge.innerHTML = '';
      this._badge.appendChild(dot);
      this._badge.appendChild(document.createTextNode(' ' + this._players.length + ' player' + (this._players.length !== 1 ? 's' : '')));
    } else {
      dot.className = 'mp-dot ' + (this._connected ? 'on' : 'off');
      this._badge.innerHTML = '';
      this._badge.appendChild(dot);
      this._badge.appendChild(document.createTextNode(' Multiplayer'));
    }
  };

  // ─── Lobby overlay ───────────────────────────────────────────────────
  P._showLobby = function () {
    if (document.getElementById('mp-lobby')) return;
    var self = this;

    var overlay = document.createElement('div');
    overlay.id = 'mp-lobby';
    overlay.className = 'mp-overlay';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) self._closeLobby(); });

    overlay.innerHTML = '\
<div class="mp-panel">\
  <div class="mp-panel-header">\
    <h2>Multiplayer</h2>\
    <button class="mp-close" id="mp-lobby-close">&times;</button>\
  </div>\
  <div class="mp-body">\
    <div class="mp-section">\
      <div class="mp-section-title">Your Name</div>\
      <div class="mp-name-row">\
        <span class="mp-name-display" id="mp-my-name"></span>\
        <button class="mp-btn-sm" id="mp-reroll">Reroll</button>\
      </div>\
    </div>\
    <div class="mp-error" id="mp-error"></div>\
    <div class="mp-section">\
      <div class="mp-section-title">Rooms</div>\
      <div id="mp-room-list"><div class="mp-empty">Loading...</div></div>\
    </div>\
    <div class="mp-section">\
      <div class="mp-section-title">Join by Code</div>\
      <div class="mp-row">\
        <input class="mp-input" id="mp-join-code" placeholder="ABCD" maxlength="6" style="text-transform:uppercase;font-size:18px;letter-spacing:2px;text-align:center;">\
        <button class="mp-btn mp-btn-primary" id="mp-join-btn" style="font-size:14px;">Join</button>\
      </div>\
    </div>\
    <div class="mp-section">\
      <div class="mp-section-title">Create Room</div>\
      <select class="mp-select" id="mp-create-vis" style="margin-bottom:8px;">\
        <option value="public">Public (anyone can find it)</option>\
        <option value="unlisted">Unlisted (join by code only)</option>\
        <option value="private">Private (passcode)</option>\
      </select>\
      <div class="mp-passcode-row" id="mp-passcode-row">\
        <input class="mp-input" id="mp-create-pass" placeholder="Passcode" maxlength="20">\
      </div>\
      <button class="mp-btn mp-btn-primary" id="mp-create-btn" style="margin-top:8px;">Create Room</button>\
    </div>\
  </div>\
</div>';

    document.body.appendChild(overlay);

    // Wire up events
    document.getElementById('mp-lobby-close').addEventListener('click', function () { self._closeLobby(); });
    document.getElementById('mp-my-name').textContent = this._playerName;
    document.getElementById('mp-reroll').addEventListener('click', function () {
      self._playerName = randomName();
      ssSet(SS_NAME, self._playerName);
      document.getElementById('mp-my-name').textContent = self._playerName;
    });

    document.getElementById('mp-create-vis').addEventListener('change', function () {
      document.getElementById('mp-passcode-row').style.display = this.value === 'private' ? 'block' : 'none';
    });

    document.getElementById('mp-create-btn').addEventListener('click', function () {
      var vis = document.getElementById('mp-create-vis').value;
      var pass = document.getElementById('mp-create-pass').value.trim();
      self.createRoom({ visibility: vis, passcode: vis === 'private' ? pass : undefined });
    });

    document.getElementById('mp-join-btn').addEventListener('click', function () {
      var code = document.getElementById('mp-join-code').value.trim().toUpperCase();
      if (!code) return;
      self.joinRoom(code);
    });
    document.getElementById('mp-join-code').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') document.getElementById('mp-join-btn').click();
    });

    // Request room list + auto-refresh every 3s while lobby is open
    this._send({ type: 'list' });
    this._lobbyRefresh = setInterval(function () {
      if (document.getElementById('mp-lobby')) self._send({ type: 'list' });
      else clearInterval(self._lobbyRefresh);
    }, 3000);
  };

  P._closeLobby = function () {
    if (this._lobbyRefresh) { clearInterval(this._lobbyRefresh); this._lobbyRefresh = null; }
    var el = document.getElementById('mp-lobby');
    if (el) el.remove();
  };

  P._showError = function (msg) {
    var el = document.getElementById('mp-error');
    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
      clearTimeout(this._errorTimer);
      this._errorTimer = setTimeout(function () { el.style.display = 'none'; }, 4000);
    }
  };

  P._renderRoomList = function (rooms) {
    var container = document.getElementById('mp-room-list');
    if (!container) return;
    var self = this;

    if (!rooms || rooms.length === 0) {
      container.innerHTML = '<div class="mp-empty">No rooms yet. Create one!</div>';
      return;
    }

    container.innerHTML = '';
    rooms.forEach(function (r) {
      var isPrivate = r.visibility === 'private';
      var lock = isPrivate ? ' \uD83D\uDD12' : '';
      var card = document.createElement('div');
      card.className = 'mp-room-card';
      card.innerHTML = '<div><div class="mp-room-name">' + esc(r.name) + lock + '</div>' +
        '<div class="mp-room-info">Host: ' + esc(r.hostName) + ' \u00B7 Code: ' + esc(r.code) + '</div></div>' +
        '<div class="mp-room-players">' + r.playerCount + '/' + r.maxPlayers + '</div>';
      card.addEventListener('click', function () {
        if (isPrivate) {
          var pass = prompt('Enter passcode for ' + r.name + ':');
          if (pass !== null) self.joinRoom(r.code, { passcode: pass });
        } else {
          self.joinRoom(r.code);
        }
      });
      container.appendChild(card);
    });
  };

  // ─── Player list panel ───────────────────────────────────────────────
  P._togglePlayerList = function () {
    var existing = document.getElementById('mp-playerlist');
    if (existing) { existing.remove(); return; }
    this._showPlayerList();
  };

  P._showPlayerList = function () {
    if (document.getElementById('mp-playerlist')) document.getElementById('mp-playerlist').remove();
    if (!this._roomCode) return;
    var self = this;

    var overlay = document.createElement('div');
    overlay.id = 'mp-playerlist';
    overlay.className = 'mp-overlay';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

    var isHost = this.isHost();
    var playersHtml = '';
    this._players.forEach(function (p) {
      var crown = p.id === (self._room && self._room.hostId) ? '<span class="mp-crown">\u{1F451}</span>' : '';
      var you = p.id === self._playerId ? ' <span class="mp-you">(you)</span>' : '';
      var kick = isHost && p.id !== self._playerId
        ? '<button class="mp-kick" data-kick="' + esc(p.id) + '">Kick</button>' : '';
      playersHtml += '<div class="mp-player-row"><span class="mp-player-name">' + crown + esc(p.name) + you + '</span>' + kick + '</div>';
    });

    overlay.innerHTML = '\
<div class="mp-panel">\
  <div class="mp-panel-header">\
    <h2>Room: ' + esc(this._room ? this._room.name : this._roomCode) + '</h2>\
    <button class="mp-close" id="mp-pl-close">&times;</button>\
  </div>\
  <div class="mp-body">\
    <div class="mp-section">\
      <div class="mp-section-title">Code: ' + esc(this._roomCode) + '</div>\
      <div id="mp-player-rows">' + playersHtml + '</div>\
    </div>\
    <button class="mp-btn mp-btn-danger" id="mp-leave-btn">Leave Room</button>\
  </div>\
</div>';

    document.body.appendChild(overlay);

    document.getElementById('mp-pl-close').addEventListener('click', function () { overlay.remove(); });
    document.getElementById('mp-leave-btn').addEventListener('click', function () {
      self.leaveRoom();
      overlay.remove();
    });

    // Kick buttons
    overlay.querySelectorAll('.mp-kick').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        self._send({ type: 'kick', playerId: btn.getAttribute('data-kick') });
      });
    });
  };

  P._updatePlayerList = function () {
    var overlay = document.getElementById('mp-playerlist');
    if (overlay) {
      overlay.remove();
      this._showPlayerList();
    }
  };

  // ─── Helpers ─────────────────────────────────────────────────────────
  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // ─── Export ──────────────────────────────────────────────────────────
  window.MultiPlayer = MultiPlayer;
})();
