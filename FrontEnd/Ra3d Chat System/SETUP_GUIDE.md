# Ra3d Chat System - Setup & Testing Guide

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

This installs:
- `electron` - Desktop app framework
- `sqlite3` - Local database
- `node-fetch` - HTTP requests
- `ws` - WebSocket support

### 2. Run the Application
```bash
npm start
```

## 📋 Testing Checklist

### ✅ Registration Flow
1. Click "Register" on the login screen
2. Enter username, password, and confirm password
3. Click "Create Account"
4. **Save dialog appears** - Select location to save private key file
5. File saved as `{username}_private_key.pem`
6. Alert confirms successful registration
7. View switches to login screen

### ✅ Login Flow
1. Enter username and password on login screen
2. Click "Login"
3. **File picker appears** - Select your private key file (`{username}_private_key.pem`)
4. If successful, chat interface appears

### ✅ WebSocket Connection
- After login, WebSocket should auto-connect (requires JWT from backend)
- Check console for `[WS] Connected successfully to ws://localhost:8181`
- If connection fails, check backend WebSocket server is running

### ✅ Send Message (When Room Key Available)
1. Type message in input box
2. Press Enter or click send button (➤)
3. Message encrypts with AES-256-GCM
4. Sends via WebSocket
5. Displays immediately in chat (optimistic UI)

### ✅ Receive Message
1. When peer sends message via WebSocket
2. Message decrypts using room key
3. Displays in chat interface
4. Shows sender name and timestamp

## 🔧 Configuration

### Backend API (Change if needed)
**File:** `main.js`
```javascript
// Line ~60, ~105, ~147, ~179
"http://192.168.8.102:5087/api/Auth/register"
"http://192.168.8.102:5087/api/Auth/login"
"http://192.168.8.102:5087/api/Users"
"http://192.168.8.102:5087/api/rooms/directMessage"
```

### WebSocket Server (Change if needed)
**File:** `websocket.js`
```javascript
// Line ~9
this.wsURL = "ws://localhost:8181"
```

## 🗄️ Database Location

SQLite database is stored in:
- **Windows:** `%APPDATA%/ra3d-chat-system/ra3d.db`
- **macOS:** `~/Library/Application Support/ra3d-chat-system/ra3d.db`
- **Linux:** `~/.config/ra3d-chat-system/ra3d.db`

Path is printed in console on startup: `[DB] path = ...`

## 🔐 Security Features

### Private Key Management
- ✅ **Never stored in database** - Only in user-downloaded files
- ✅ **PEM format** - Standard PKCS#8 private key format
- ✅ **In-memory during session** - Cleared on logout/app close
- ✅ **File naming** - `{username}_private_key.pem`

### Encryption
- ✅ **RSA-OAEP 2048-bit** - User keypairs with SHA-256 hash
- ✅ **AES-256-GCM** - Message encryption
- ✅ **Per-room keys** - Each room has unique symmetric key
- ✅ **Random IVs** - 12-byte nonce for each message

## 🐛 Debugging

### Enable DevTools
**File:** `main.js` (line ~23)
```javascript
function createWindow() {
  const win = new BrowserWindow({
    // ... existing config
  })
  win.loadFile("index.html")
  win.webContents.openDevTools() // Add this line
}
```

### Console Logs
- `[APP]` - Application lifecycle
- `[DB]` - Database operations
- `[AUTH]` - Authentication events
- `[WS]` - WebSocket messages
- `[CHAT]` - Chat operations
- `[CRYPTO]` - Encryption/decryption
- `[FILE]` - File operations

### Common Issues

**"Private key is required" error:**
- User canceled file picker or file is invalid
- Ensure `.pem` file was properly saved during registration

**"Room key not available" when sending:**
- Room key not loaded from database
- Create DM first or fetch room keys after login

**WebSocket not connecting:**
- Backend WebSocket server not running on `ws://localhost:8181`
- JWT not available (check login response includes JWT)
- Firewall blocking WebSocket connection

**Messages not decrypting:**
- Room key mismatch or corruption
- IV/nonce not properly base64-encoded
- Check backend encryption format matches

## 📂 Project Structure

```
├── main.js              # Main process (Node.js)
│   ├── IPC handlers (register, login, file dialogs, DM)
│   ├── Backend API calls
│   └── In-memory keypair storage
│
├── renderer.js          # Renderer process (Browser)
│   ├── UI handlers (register, login, send message)
│   ├── Encryption/decryption (Web Crypto API)
│   └── WebSocket message handling
│
├── preload.js           # Context bridge (IPC exposure)
├── websocket.js         # WebSocket manager
├── db.js                # SQLite schema
│
├── crypto/
│   ├── encryptForUser.js    # RSA-OAEP encrypt
│   ├── decryptRoomKey.js    # RSA-OAEP decrypt
│   ├── messageCrypto.js     # AES-GCM (unused in renderer)
│   └── roomKey.js           # Generate 256-bit key
│
├── index.html           # UI layout
└── style.css            # Styling
```

## 🔄 Workflow

### Registration
```
User Input → Main Process:
1. Generate RSA-2048 keypair
2. Send public key to backend
3. Return private key to renderer

Renderer → User:
4. Trigger save dialog
5. Save as {username}_private_key.pem
6. Show success message
```

### Login
```
User → Renderer:
1. Select private key file

Renderer → Main Process:
2. Send credentials + private key PEM
3. Import key to memory
4. Authenticate with backend
5. Store JWT in database

Main Process → Renderer:
6. Return success
7. Show chat interface
```

### Send Message
```
Renderer:
1. Encrypt with room key (AES-GCM)
2. Generate random IV
3. Call IPC: ws:sendMessage

Main Process:
4. Send via WebSocket
5. Queue if offline

Backend → Peers:
6. Broadcast to room participants
```

### Receive Message
```
WebSocket → Main Process:
1. Receive encrypted message

Main Process → Renderer:
2. Forward via IPC event

Renderer:
3. Decrypt with room key
4. Display in UI
```

## 📝 Next Steps

### Missing Features
- [ ] **Room key loading** - Decrypt room keys from database on login
- [ ] **JWT storage** - Get JWT from login response for WebSocket
- [ ] **Room list UI** - Display available rooms/DMs
- [ ] **User search** - Find users to create DMs
- [ ] **Message persistence** - Save decrypted messages to database
- [ ] **Read receipts** - Track message delivery status
- [ ] **Typing indicators** - Show when peer is typing
- [ ] **File attachments** - Encrypt/decrypt file uploads

### Improvements
- [ ] Better error handling with user-friendly messages
- [ ] Loading states during async operations
- [ ] Message pagination (load older messages)
- [ ] Unread message counter
- [ ] Notification support
- [ ] Dark/light theme toggle

## 🧪 Manual Testing Script

```bash
# Terminal 1 - Start backend (if not running)
# (Backend server commands here)

# Terminal 2 - Start Electron app
cd "e:\dark\work\training\chattingSystem\Ra3d Chat System"
npm install  # First time only
npm start

# Test Flow:
# 1. Register user "alice" with password "test123"
#    - Save key to Desktop/alice_private_key.pem
# 2. Logout (reload app)
# 3. Login as "alice" with key file
# 4. Verify chat interface loads
# 5. Create DM with peer "bob"
# 6. Send test message
# 7. Check console for encryption logs
```

## 📞 Support

Check:
- [MIGRATION_SUMMARY.md](MIGRATION_SUMMARY.md) - Detailed changes from demo UI
- [.github/copilot-instructions.md](.github/copilot-instructions.md) - Architecture guide
- Console logs with DevTools enabled
