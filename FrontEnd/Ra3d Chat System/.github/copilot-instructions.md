# Copilot Instructions for Ra3d Chat System (Electron)

## Architecture Overview
This is an **end-to-end encrypted Electron chat application** (in active development) with:
- **Client**: Electron desktop app (main.js, renderer.js) with SQLite local database
- **Cryptography**: **RSA-OAEP for user keys** (matching demo UI), AES-256-GCM for message encryption
- **Backend Integration**: REST API at `http://192.168.8.102:5087/api/` (configurable)
- **Database**: SQLite3 stored in Electron userData directory (`ra3d.db`)
- **Key Management**: Export private keys on registration, import on login (matching demo UI security model)
- **Reference Implementation**: `demo ui/` folder contains **complete working browser implementation** showing target functionality

## Key Architecture Patterns

### RSA key generation**: Use Node.js crypto equivalent of Web Crypto's RSA-OAEP (2048-bit, SHA-256)
- **Registration flow**: Generate RSA keypair → export private key to file → send public key to backend
- **Login flow**: Prompt user to upload private key file → import and store in session (not persisted to disk)
- **Security model**: Private keys NEVER stored in SQLite, only in user-downloaded files (matching demo UI pattern)
- **Key format**: PKCS#8 for private keys, SPKI for public keys, PEM encoding
- **Device management**: Each device gets unique UUID (see [devices.js](devices.js)vate keys
- **Device management**: Each device gets unique UUID + X25519 keypair via [devices.js](devices.js)
auth` (user session with JWT), `devices` (multi-device support), `rooms`, `room_keys`, `messages`
- **Extended schema**: See [db_init.py](db_init.py) for full schema including `attachments`, `trust_state`
- **Session management**: JWT token + userUid stored in `auth` table after successful login
- **NO private key storage**: Unlike old implementation, private keys are NOT stored in database
- **In-memory keys**: Current session's keypair held in main process memory after import
- **Example pattern**:
```javascript
// Store JWT after login
db.run("INSERT INTO auth (user_uid, jwt) VALUES (?, ?)", [userUid, jwt])

// Private key held in memory only
let currentUserKeyPair = null // Set during login importif (err || !row) return reject("Identity not initialized")
  // Use row.sign_public_key
})Room key encryption**: Encrypt room key with RSA-OAEP for each participant's public key
3. **Message encryption**: AES-256-GCM with 12-byte IV and authentication tag (see [crypto/messageCrypto.js](crypto/messageCrypto.js))
4. **Message decryption**: Decrypt room key with private RSA key → decrypt message with AES-GCM room key
5. **Encrypted payload format**: `{content: base64, iv: base64, tag: base64}`

**Node.js RSA-OAEP Pattern**:
```javascript
// Encrypt (padding: crypto.constants.RSA_PKCS1_OAEP_PADDING)
const encrypted = crypt
  - `user:register` → generates RSA keypair, downloads private key file, sends public key to backend
  - `user:login` → accepts privateKeyPEM from renderer, stores in memory, authenticates with backend
- **Key file operations**: Add IPC handlers for file dialogs (save private key, open private key)
- **DM creation**: `dm:create` (generates room key, encrypts with RSA-OAEP
  padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
  oaepHash: 'sha256'
}, Buffer.from(data))

// Decrypt
const decrypted = crypto.privateDecrypt({
  key: privateKeyPEM,
  padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
  oaepHash: 'sha256'
}, encryptedBuffer)
``
### Encryption Workflow
1. **Room key generation**: 256-bit random key via `crypto/roomKey.js`
2. **Per-participant encryption**: Room key encrypted separately for each user with their public key
3. **Message encryption**: AES-256-GCM with 12-byte IV and authentication tag (see [crypto/messageCrypto.js](crypto/messageCrypto.js))
4. **Encrypted payload format**: `{content: base64, iv: base64, tag: base64}`

### IPC Communication (Main ↔ Renderer)
- **Window controls**: `win:min`, `win:max`, `win:close` (see [preload.js](preload.js))
- **User operations**: `user:register`, `user:login` (handles identity setup + API calls)
- **DM creation**: `dm:create` (generates room key, encrypts for both parties)
- **Security**: Context isolation enabled, all APIs exposed through `contextBridge`

## Critical Integration Points

### Backend API Endpoints
- **Base URL**: `http://192.168.8.102:5087/api/` (hardcoded in [main.js](main.js#L60))
- **Auth**: `/Auth/register` (POST with username, password, publicKey), `/Auth/login` (POST returns JWT)
- **Users**: `/Users` (POST with username, requires Bearer token)
- **Rooms**: `/rooms/directMessage` (POST with secondUser, encrypted room keys for both users)

### Key Exchange Protocol
When creating DM (see [main.js](main.js#L146-L190)):
1. Fetch peer's public key from `/api/Users`
2. Generate 256-bit AES room key

**Registration**:
1. User enters username/password
2. Generate RSA-2048 keypair (Node.js crypto.generateKeyPairSync)
3. Export private key to PEM format → trigger download as `{username}_private_key.pem`
4. Send pustore private keys in database**: Download to user-controlled file only
- **In-memory key lifecycle**: Import during login → hold in main process → clear on logout
- **Key format**: RSA-2048, PEM encoding, PKCS#8 (private) / SPKI (public)
- **RSA-OAEP parameters**: SHA-256 hash, OAEP padding (match demo UI Web Crypto settings)
- **Encryption order**: Generate room key → encrypt with RSA-OAEP for each participant → send to backend
- **File naming**: `{username}_private_key.pem` for consistency with demo UI pattern
**Login**:
1. Prompt user to upload private key file (`{username}_private_key.pem`)
2. Parse PEM file content in renderer → send to main process
3. Import private key with `crypto.createPrivateKey()`
4. Store keypair in main process memory (`currentUserKeyPair` variable)
5. Authenticate with backend → receive JWT → store in `auth` table
6. **Critical**: Private key remains in memory only, cleared on logout/app close
## Development Workflow

### Running the App
```bash
npm install          # Install electron, sqlite3, node-fetch
npm start           # Launches Electron app
```

### Database Location
- **Path**: `app.getPath("userData") + "/ra3d.db"` (printed on startup)
- **Windows**: `%APPDATA%/ra3d-chat-system/ra3d.db`
- **Initialization**: Run [db_init.py](db_init.py) for full schema setup (optional, basic schema auto-created)

### Debugging
- Open DevTools: Add `win.webContents.openDevTools()` in [main.js](main.js#L23)
- Check console logs: Identity initialization, DB operations logged with `[IDENTITY]`, `[DB]` prefixes
- SQLite queries: Use `db.run()` for writes, `db.get()` for single row, wrap in Promises for async/await

## Common Patterns & Gotchas
RSA-OAEP) ✅ |
| **Storage** | IndexedDB | SQLite |
| **Key Management** | Manual file upload on login | Same pattern (file upload) ✅ |
| **Private Keys** | Never stored, downloaded files | Same security model ✅end → stores userUid locally
2. **Login**: Validates credentials → receives JWT → stores in `auth` table
3. **Critical**: Always check identity exists before registration/login (enforced in handlers)

### Cryptography Best Practices
   - Web Crypto `generateKey()` → Node.js `crypto.generateKeyPairSync('rsa', {...})`
   - Web Crypto `encrypt()/decrypt()` → `crypto.publicEncrypt()/privateDecrypt()` with RSA-OAEP
   - Web Crypto `exportKey()` → `.export({type: 'pkcs8', format: 'pem'})`
3. **Convert storage**: Replace IndexedDB calls with SQLite queries (match [db_init.py](db_init.py) schema)
4. **Add IPC handlers**: Expose functionality to renderer via `contextBridge` in [preload.js](preload.js)
5. **File operations**: Add Electron dialog APIs for saving/opening private key files`
- **Encryption order**: Generate room key → encrypt for each participant → send to backend → store locally

### Error Handling
- **Network errors**: Wrapped in try/catch, rejected with descriptive messages
- **Database errors**: Passed through Promise reject (check `err` in callbacks)
- **Registration failures**: Backend returns text error message (not JSON)

## Demo UI as Reference Implementation

The `demo ui/` folder contains a **fully functional browser-based implementation** that serves as the reference for features to be ported to Electron:

### Implemented in Demo UI (Target for Electron)
- **WebSocket real-time messaging**: `ws://localhost:8181` with auto-reconnect and offline queue (see [demo ui/websocket.js](demo ui/websocket.js))
- **Complete message flow**: Encryption, sending, receiving, decryption with proper error handling
- **IndexedDB storage**: Full message persistence, room management, attachment handling
- **UI components**: Chat interface, user search, room creation, message display
- **Duplicate prevention**: Message hash tracking to prevent duplicate processing

### Currently in Electron
- ✅ Identity generation and management
- ✅ Registration and login with backend
- ✅ Direct message room creation with key exchange
- ⚠️ **Missing**: WebSocket integration, message send/receive, UI implementation

### Key Differences When Porting
| Feature | Demo UI | Electron Target |
|---------|---------|-----------------|
| **Crypto** | Web Crypto API (RSA-OAEP) | Node.js crypto (X25519 DH) |
| **Storage** | IndexedDB + downloaded keys | SQLite with persistent keys |
| **Key Management** | Manual upload on login | Automatic from local DB |
| **Communication** | WebSocket + HTTP fallback | HTTP (WebSocket planned) |

### Porting Workflow
1. **Study demo UI implementation**: Read corresponding file in `demo ui/` for feature logic
2. **Adapt crypto operations**: Replace Web Crypto with Node.js crypto equivalents
3. **Convert storage**: Replace IndexedDB calls with SQLite queries (match [db_init.py](db_init.py) schema)
4. **Add IPC handlers**: Expose functionality to renderer via `contextBridge` in [preload.js](preload.js)

## File Organization
- **Root files**: Electron main process (main.js), renderer (renderer.js), DB init
- **crypto/**: Encryption utilities (message, room keys, user key operations)
- **demo ui/**: Standalone web implementation (different architecture, see [demo ui/.github/copilot-instructions.md](demo ui/.github/copilot-instructions.md))
- **old_db/**: Legacy database files (ignore for new development)
