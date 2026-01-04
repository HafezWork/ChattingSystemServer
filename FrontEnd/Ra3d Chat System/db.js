const { app } = require("electron")
const sqlite3 = require("sqlite3").verbose()
const path = require("path")

const dbPath = path.join(app.getPath("userData"), "ra3d.db")
console.log("[DB] path =", dbPath)
const db = new sqlite3.Database(dbPath)

// Initialize database schema matching db_init.py (without identity table)
db.serialize(() => {
  // Auth table for JWT and user session
  db.run(`
    CREATE TABLE IF NOT EXISTS auth (
      id INTEGER PRIMARY KEY,
      user_uid TEXT NOT NULL,
      jwt TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Rooms table for chat rooms
  db.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      room_id TEXT PRIMARY KEY,
      peer_uuid TEXT NOT NULL,
      peer_pub_shared BLOB,
      personal_pub_shared BLOB,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Room keys table for encrypted room keys
  db.run(`
    CREATE TABLE IF NOT EXISTS room_keys (
      key_id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      encrypted_key BLOB NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
    )
  `)

  // Messages table for encrypted messages
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      message_id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      sender_uuid TEXT NOT NULL,
      status TEXT NOT NULL,
      type TEXT NOT NULL,
      content BLOB NOT NULL,
      iv BLOB NOT NULL,
      tag BLOB NOT NULL,
      seq INTEGER,
      msg_hash BLOB,
      key_id TEXT,
      deleted_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE,
      FOREIGN KEY (key_id) REFERENCES room_keys(key_id)
    )
  `)

  // Devices table for multi-device support
  db.run(`
    CREATE TABLE IF NOT EXISTS devices (
      device_id TEXT PRIMARY KEY,
      user_uuid TEXT NOT NULL,
      device_pub_key BLOB NOT NULL,
      last_seen DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  console.log("[DB] Schema initialized")
})

module.exports = db
