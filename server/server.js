// SyncWatch Relay Server with Persistent SQLite Database & Host-Member Hierarchy
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const db = require('./db');

function normalizeUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    const searchParams = new URLSearchParams(u.search);
    for (const key of [...searchParams.keys()]) {
      if (key.startsWith('utm_') || key === 'fbclid') searchParams.delete(key);
    }
    u.search = searchParams.toString();
    return u.toString().replace(/\/+$/, '');
  } catch {
    return String(rawUrl).trim().replace(/\/+$/, '');
  }
}

const server = http.createServer((req, res) => {
  const reqUrl = req.url.split('?')[0];

  // API endpoints for inspecting the Database
  if (reqUrl === '/api/rooms') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(db.getAllRooms()));
  }

  if (reqUrl.startsWith('/api/rooms/')) {
    const parts = reqUrl.replace('/api/rooms/', '').split('/');
    const roomId = decodeURIComponent(parts[0]);
    if (parts[1] === 'events') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify(db.getRecentEvents(roomId)));
    }
    const state = db.getRoom(roomId);
    if (!state) {
      res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ error: 'Room not found' }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(state));
  }

  // Static files (Test player & video)
  const filename = reqUrl === '/' ? 'index.html' : reqUrl.replace(/^\/+/, '');
  const filePath = path.join(__dirname, 'public', filename);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const contentType = ext === '.html' ? 'text/html' : ext === '.mp4' ? 'video/mp4' : 'text/plain';
    res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const wss = new WebSocketServer({ server });
const rooms = new Map(); // roomId -> Set of ws

function leave(ws) {
  if (!ws.room) return;
  const set = rooms.get(ws.room);
  if (set) {
    set.delete(ws);
    const count = set.size;
    if (!count) {
      rooms.delete(ws.room);
    } else {
      // Broadcast peer left
      for (const peer of set) {
        if (peer.readyState === 1) {
          peer.send(JSON.stringify({ type: 'peer_left', room: ws.room, clientCount: count }));
        }
      }
    }
  }
  ws.room = null;
}

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    let m;
    try {
      m = JSON.parse(data);
    } catch {
      return;
    }

    if (m.type === 'ping') {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'pong' }));
      return;
    }

    // 1. CREATE ROOM (Creator becomes Host/Owner)
    if (m.type === 'create') {
      leave(ws);
      const roomId = String(m.room || Math.random().toString(36).slice(2, 8).toUpperCase()).slice(0, 40);
      const hostUrl = m.url || '';
      const initialTime = typeof m.t === 'number' ? m.t : 0;
      const initialPaused = m.paused != null ? Boolean(m.paused) : true;
      const ownerId = m.clientId || String(Date.now());

      ws.room = roomId;
      ws.isOwner = true;
      ws.clientId = ownerId;

      if (!rooms.has(roomId)) rooms.set(roomId, new Set());
      rooms.get(roomId).add(ws);

      // Persist in SQLite
      db.createRoom({
        id: roomId,
        ownerId,
        targetUrl: hostUrl,
        currentTime: initialTime,
        isPaused: initialPaused
      });

      console.log(`[CREATE] Room "${roomId}" created by owner "${ownerId}" at ${hostUrl} (t=${initialTime}s)`);

      ws.send(JSON.stringify({
        type: 'created',
        room: roomId,
        isOwner: true,
        targetUrl: hostUrl,
        t: initialTime,
        paused: initialPaused,
        clientCount: 1
      }));
      return;
    }

    // 2. JOIN ROOM (Member checks URL match and syncs to Host timestamp)
    if (m.type === 'join') {
      leave(ws);
      const roomId = String(m.room || '').slice(0, 40);
      const memberUrl = m.url || '';
      const memberClientId = m.clientId || String(Date.now());

      const room = db.getRoom(roomId);
      if (!room) {
        ws.send(JSON.stringify({
          type: 'join_error',
          code: 'ROOM_NOT_FOUND',
          message: `Room "${roomId}" does not exist. Please check the room code or ask the host!`
        }));
        return;
      }

      // Check whether member is on the exact same video URL as the host
      const normHostUrl = normalizeUrl(room.targetUrl);
      const normMemberUrl = normalizeUrl(memberUrl);

      if (normHostUrl && normMemberUrl && normHostUrl !== normMemberUrl) {
        console.log(`[MISMATCH] Member URL "${normMemberUrl}" does not match Host URL "${normHostUrl}" for room "${roomId}"`);
        ws.send(JSON.stringify({
          type: 'join_error',
          code: 'URL_MISMATCH',
          message: `URL Mismatch! The room creator is watching on a different page.`,
          targetUrl: room.targetUrl,
          yourUrl: memberUrl
        }));
        return;
      }

      // Valid URL match -> Join room
      ws.room = roomId;
      ws.clientId = memberClientId;
      ws.isOwner = (room.ownerId === memberClientId);

      if (!rooms.has(roomId)) rooms.set(roomId, new Set());
      rooms.get(roomId).add(ws);
      const count = rooms.get(roomId).size;

      console.log(`[JOIN] Member joined "${roomId}". Syncing to Host timestamp ${room.currentTime}s (Paused: ${room.isPaused})`);

      // Immediately sync member video to Host's exact timestamp & state from DB
      ws.send(JSON.stringify({
        type: 'state',
        room: roomId,
        t: room.currentTime,
        paused: room.isPaused,
        isOwner: ws.isOwner,
        targetUrl: room.targetUrl,
        clientCount: count,
        source: 'host_sync'
      }));

      // Broadcast to existing peers in room
      for (const peer of rooms.get(roomId) || []) {
        if (peer !== ws && peer.readyState === 1) {
          peer.send(JSON.stringify({
            type: 'peer_joined',
            room: roomId,
            clientCount: count
          }));
        }
      }
      return;
    }

    if (!ws.room) return;
    const roomId = ws.room;

    // Handle Play / Pause / Seek / State and update SQLite DB
    if (m.type === 'play') {
      db.updateRoomState(roomId, m.t, false, 'play');
    } else if (m.type === 'pause') {
      db.updateRoomState(roomId, m.t, true, 'pause');
    } else if (m.type === 'seek') {
      const current = db.getRoom(roomId);
      db.updateRoomState(roomId, m.t, current ? current.isPaused : true, 'seek');
    } else if (m.type === 'state') {
      db.updateRoomState(roomId, m.t, m.paused, 'state');
    }

    // Broadcast sync event to all other peers in the room
    const peers = rooms.get(roomId) || [];
    for (const peer of peers) {
      if (peer !== ws && peer.readyState === 1) {
        peer.send(data.toString());
      }
    }
  });

  ws.on('close', () => leave(ws));
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🎬 SyncWatch Server & SQLite DB running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket relay listening on ws://localhost:${PORT}`);
  console.log(`👑 Among Us style Room Hierarchy (Host / Member) & Strict URL Verification Enabled`);
});
