import sqlite3
from pathlib import Path

DB_NAME = "ra3d.db"

def create_db():
    conn = sqlite3.connect(Path(DB_NAME))
    cur = conn.cursor()

    cur.execute("PRAGMA foreign_keys = ON;")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_uuid TEXT UNIQUE NOT NULL,
        public_key BLOB NOT NULL,
        private_key BLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS rooms (
        room_id TEXT PRIMARY KEY,
        peer_uuid TEXT NOT NULL,
        peer_pub_shared BLOB NOT NULL,
        personal_pub_shared BLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS room_keys (
        key_id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        peer_pub_shared BLOB NOT NULL,
        personal_pub_shared BLOB NOT NULL,
        version INTEGER NOT NULL,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
    );
    """)

    cur.execute("""
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
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS attachments (
        attachment_id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        content BLOB NOT NULL,
        iv BLOB NOT NULL,
        tag BLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES messages(message_id) ON DELETE CASCADE
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS devices (
        device_id TEXT PRIMARY KEY,
        user_uuid TEXT NOT NULL,
        device_pub_key BLOB NOT NULL,
        last_seen DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS trust_state (
        peer_uuid TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        verified INTEGER DEFAULT 0,
        verified_at DATETIME
    );
    """)

    cur.execute("""
CREATE TABLE IF NOT EXISTS auth_tokens (
    token_id TEXT PRIMARY KEY,
    user_uuid TEXT NOT NULL,
    access_token BLOB NOT NULL,
    refresh_token BLOB,
    expires_at DATETIME,
    device_id TEXT,
    revoked INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
""")

    cur.execute("""
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user
ON auth_tokens(user_uuid, revoked);
""")

    cur.execute("CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, seq);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_messages_time ON messages(created_at);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_room_keys_active ON room_keys(room_id, active);")

    conn.commit()
    conn.close()
    print("[+] ra3d.db created successfully (extended)")

if __name__ == "__main__":
    create_db()
