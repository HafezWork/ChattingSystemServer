# Migration Summary: Demo UI Features → Electron App

## Overview
Successfully adapted key features from the demo UI to the Electron project, implementing RSA-OAEP encryption, secure key management, and WebSocket real-time messaging.

## Completed Changes

### 1. ✅ Crypto Updates (RSA-OAEP)
**Files Modified:**
- `crypto/encryptForUser.js` - Added SHA-256 OAEP hash parameter
- `crypto/decryptRoomKey.js` - Added SHA-256 OAEP hash parameter

**Changes:**
- Updated RSA-OAEP encryption to match Web Crypto API settings
- Added `oaepHash: 'sha256'` to both encrypt and decrypt functions
- Added JSDoc comments explaining parameters and return values

### 2. ✅ Database Schema Update
**Files Modified:**
- `db.js` - Completely restructured database schema

**Removed:**
- `identity` table (keys no longer stored in database)

**Added Tables:**
- `rooms` - Chat room information with peer details
- `room_keys` - Encrypted room keys with version support
- `messages` - Encrypted messages with metadata (content, IV, tag)
- `devices` - Multi-device support table

**Preserved:**
- `auth` table - JWT and user session storage

### 3. ✅ Registration Flow (Key Export)
**Files Modified:**
- `main.js` - Complete rewrite of `user:register` handler

**New Flow:**
1. Generate RSA-2048 keypair (SPKI public, PKCS#8 private)
2. Send public key (base64) to backend `/api/Auth/register`
3. Store userUid in `auth` table
4. Store keypair in **memory only** (`currentUserKeyPair`)
5. Return private key PEM to renderer for download

**Security:**
- Private keys NEVER stored in SQLite
- Keypair held in main process memory only

### 4. ✅ Login Flow (Key Import)
**Files Modified:**
- `main.js` - Complete rewrite of `user:login` handler

**New Flow:**
1. Accept `privateKeyPEM` parameter from renderer
2. Import and validate private key
3. Store in memory as `currentUserKeyPair`
4. Authenticate with backend `/api/Auth/login`
5. Store JWT in `auth` table
6. Clear keypair on failed login

**Memory Management:**
- `currentUserKeyPair` - Private/public keys
- `currentUserUid` - Current user ID
- `currentJWT` - Authentication token
- All cleared on app quit via `before-quit` event

### 5. ✅ File Dialog Operations
**Files Modified:**
- `main.js` - Added new IPC handlers

**New Handlers:**
- `file:savePrivateKey` - Save private key to `{username}_private_key.pem`
- `file:openPrivateKey` - Open and read private key file

**Features:**
- Native Electron file dialogs
- PEM file filtering
- Error handling for file operations
- Returns `{success, filePath/privateKeyPEM, error}`

### 6. ✅ IPC Communication Updates
**Files Modified:**
- `preload.js` - Exposed new APIs to renderer

**New APIs:**
- `api.register(username, password)` - Returns `{success, privateKey, username}`
- `api.login(username, password, privateKeyPEM)` - Requires private key
- `api.savePrivateKey(pem, username)` - Trigger save dialog
- `api.openPrivateKey()` - Trigger open dialog
- `api.createDM(peerUsername)` - Create direct message
- `api.ws.*` - WebSocket operations (see below)

### 7. ✅ WebSocket Integration
**Files Created:**
- `websocket.js` - Complete WebSocket manager (ported from demo UI)

**Features:**
- Auto-reconnect with exponential backoff (5 attempts max)
- Pending message queue (sent when reconnected)
- Duplicate message prevention via messageId tracking
- Event-based message handling

**IPC Handlers:**
- `ws:connect(jwt)` - Connect to `ws://localhost:8181`
- `ws:disconnect()` - Clean disconnect
- `ws:sendMessage(roomId, ciphertext, nonce, senderId, keyVersion)` - Send encrypted message
- `ws:fetchMessages(roomId, afterMessageId)` - Fetch message history

**Renderer Events:**
- `ws:message` - Incoming WebSocket envelope
- `ws:reconnected` - Successful reconnection

**Exposed in preload.js:**
```javascript
api.ws.connect(jwt)
api.ws.disconnect()
api.ws.sendMessage(roomId, ciphertext, nonce, senderId, keyVersion)
api.ws.fetchMessages(roomId, afterMessageId)
api.ws.onMessage(callback)
api.ws.onReconnected(callback)
```

### 8. ✅ DM Creation Update
**Files Modified:**
- `main.js` - Updated `dm:create` handler

**Changes:**
- Uses in-memory `currentUserKeyPair` instead of database identity
- Uses `currentJWT` and `currentUserUid` from memory
- Stores room info in new `rooms` table
- Stores encrypted room key in `room_keys` table
- Better error handling and logging

## Dependencies Added
**File Modified:** `package.json`
```json
"ws": "^8.18.0"
```

## Files to Delete
These files are no longer needed:
- `identity.js` - Replaced by in-memory key management
- `old_db/*` - Legacy database files

## Next Steps for Renderer Implementation

### Required Renderer Changes
1. **Registration UI:**
   ```javascript
   const result = await api.register(username, password)
   if (result.success) {
     // Trigger file save dialog
     await api.savePrivateKey(result.privateKey, result.username)
     // Show success message
   }
   ```

2. **Login UI:**
   ```javascript
   // Prompt user to select private key file
   const keyFile = await api.openPrivateKey()
   if (keyFile.success) {
     const result = await api.login(username, password, keyFile.privateKeyPEM)
     // Connect WebSocket on successful login
     if (result.success) {
       await api.ws.connect(jwt) // Get JWT from backend
     }
   }
   ```

3. **Message Sending:**
   ```javascript
   // Encrypt message with room key (use crypto/messageCrypto.js logic)
   const { content, iv, tag } = encryptMessage(roomKey, plaintext)
   
   // Send via WebSocket
   await api.ws.sendMessage(roomId, content, iv, senderId, keyVersion)
   ```

4. **Message Receiving:**
   ```javascript
   api.ws.onMessage((envelope) => {
     // envelope.Type = "message" or "fetch_response"
     // envelope.Ciphertext, envelope.Nonce, envelope.RoomId
     // Decrypt and display message
   })
   ```

### Demo UI Files to Reference
- `demo ui/auth.js` - Registration/login UI patterns
- `demo ui/chat.js` - Message encryption/decryption
- `demo ui/crypto.js` - Web Crypto → Node.js crypto conversion guide
- `demo ui/websocket.js` - Original WebSocket implementation

## Testing Checklist
- [ ] Run `npm install` to install `ws` package
- [ ] Test registration → private key download
- [ ] Test login → private key upload
- [ ] Test WebSocket connection with valid JWT
- [ ] Test message sending via WebSocket
- [ ] Test message receiving and decryption
- [ ] Test auto-reconnect after connection loss
- [ ] Test pending messages sent after reconnect
- [ ] Verify private keys never stored in SQLite
- [ ] Verify keys cleared from memory on app quit

## Architecture Alignment
The Electron app now matches the demo UI's security model:
- ✅ RSA-OAEP 2048-bit encryption with SHA-256
- ✅ Private keys in user-controlled files only
- ✅ AES-256-GCM for message encryption
- ✅ WebSocket real-time messaging
- ✅ Offline message queueing
- ✅ Auto-reconnect with backoff

## Configuration
**Backend API:** `http://192.168.8.102:5087/api/` (hardcoded in main.js)
**WebSocket:** `ws://localhost:8181` (hardcoded in websocket.js)

To change these, update:
- `main.js` lines with `fetch("http://192.168.8.102:5087/api/...`
- `websocket.js` line `this.wsURL = "ws://localhost:8181"`
