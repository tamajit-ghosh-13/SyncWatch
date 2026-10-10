// Database layer for SyncWatch using Node.js built-in SQLite engine
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbFile = path.join(dataDir, 'syncwatch.sqlite');
const db = new DatabaseSync(dbFile);

// Enable WAL mode for high concurrency
db.exec('PRAGMA journal_mode = WAL;');

// Initialize tables with owner_id and target_url
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    owner_id TEXT,
    target_url TEXT,
    current_time REAL DEFAULT 0.0,
    is_paused INTEGER DEFAULT 1,
    client_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sync_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    t REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(room_id) REFERENCES rooms(id)
  );
`);

// Safe migration if columns were missing
try { db.exec('ALTER TABLE rooms ADD COLUMN owner_id TEXT;'); } catch (_) {}
try { db.exec('ALTER TABLE rooms ADD COLUMN target_url TEXT;'); } catch (_) {}

// NOTE: Qualify rooms.current_time to avoid SQLite built-in CURRENT_TIME function keyword collision!
const stmtGetRoom = db.prepare(`
  SELECT id, owner_id, target_url, rooms.current_time AS current_time, is_paused, client_count, created_at, updated_at 
  FROM rooms WHERE id = ?
`);

const stmtInsertRoom = db.prepare(`
  INSERT INTO rooms (id, owner_id, target_url, current_time, is_paused)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    owner_id = coalesce(excluded.owner_id, rooms.owner_id),
    target_url = coalesce(excluded.target_url, rooms.target_url),
    current_time = excluded.current_time,
    is_paused = excluded.is_paused,
    updated_at = datetime('now')
`);

const stmtUpdateRoom = db.prepare(`
  UPDATE rooms 
  SET current_time = ?, is_paused = ?, updated_at = datetime('now')
  WHERE id = ?
`);

const stmtInsertEvent = db.prepare(`
  INSERT INTO sync_events (room_id, event_type, t) VALUES (?, ?, ?)
`);

const stmtGetRecentEvents = db.prepare(`
  SELECT id, room_id, event_type, t, created_at 
  FROM sync_events 
  WHERE room_id = ? 
  ORDER BY id DESC LIMIT 20
`);

const stmtGetAllRooms = db.prepare(`
  SELECT id, owner_id, target_url, rooms.current_time AS current_time, is_paused, updated_at 
  FROM rooms 
  ORDER BY updated_at DESC LIMIT 50
`);

module.exports = {
  createRoom({ id, ownerId, targetUrl, currentTime = 0, isPaused = 1 }) {
    stmtInsertRoom.run(id, ownerId, targetUrl, Number(currentTime) || 0, isPaused ? 1 : 0);
    return this.getRoom(id);
  },

  getRoom(roomId) {
    const row = stmtGetRoom.get(roomId);
    if (!row) return null;
    return {
      id: row.id,
      ownerId: row.owner_id,
      targetUrl: row.target_url,
      currentTime: Number(row.current_time),
      isPaused: Boolean(row.is_paused),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  },

  getOrCreateRoom(roomId, defaults = {}) {
    let room = this.getRoom(roomId);
    if (!room) {
      this.createRoom({
        id: roomId,
        ownerId: defaults.ownerId || null,
        targetUrl: defaults.targetUrl || null,
        currentTime: defaults.currentTime || 0,
        isPaused: defaults.isPaused != null ? defaults.isPaused : 1
      });
      room = this.getRoom(roomId);
    }
    return room;
  },

  updateRoomState(roomId, currentTime, isPaused, eventType) {
    const existing = this.getRoom(roomId);
    const validTime = Number(currentTime) || 0;
    if (!existing) {
      this.createRoom({ id: roomId, currentTime: validTime, isPaused });
    } else {
      const newPaused = isPaused != null ? (isPaused ? 1 : 0) : (existing.isPaused ? 1 : 0);
      stmtUpdateRoom.run(validTime, newPaused, roomId);
    }
    if (eventType) {
      stmtInsertEvent.run(roomId, eventType, validTime);
    }
    return this.getRoom(roomId);
  },

  getRecentEvents(roomId) {
    return stmtGetRecentEvents.all(roomId);
  },

  getAllRooms() {
    return stmtGetAllRooms.all();
  }
};
