# Copilot Instructions for Encrypted Chat Application

## Architecture Overview
This is an end-to-end encrypted chat web application with:
- **Frontend**: Vanilla JavaScript with modular classes (App, AuthHandler, ChatManager, etc.)
- **Crypto**: RSA-OAEP for user keys, AES-GCM for room encryption
- **Storage**: IndexedDB for local data, private keys in downloaded files only
- **Communication**: WebSocket (ws://localhost:8181) with HTTP API fallback (https://localhost:7276)

## Key Patterns & Conventions

### Authentication & Security
- **Private keys**: Never stored in browser; downloaded as `username_private_key.json` files
- **Login flow**: Requires uploading private key file each session
- **Registration**: Generates RSA keypair, downloads private key, sends public key to server
- **Example**: Use `cryptoService.generateKeyPair()` and `cryptoService.exportPrivateKey()` for key management

### Message Encryption
- **Room keys**: Symmetric AES-GCM keys encrypted with RSA for each participant
- **Message flow**: Encrypt with room key → send ciphertext + nonce via WebSocket
- **Example**: `cryptoService.encryptMessage(content, roomKey)` returns `{ciphertext, nonce}`

### Real-time Communication
- **Primary**: WebSocket with auth token in query params
- **Fallback**: HTTP polling every 5 seconds
- **Duplicate prevention**: Track processed messages by ciphertext hash

### Data Storage
- **IndexedDB**: Messages, rooms, settings (not user keys)
- **Room keys**: Stored encrypted in IndexedDB after decryption
- **Example**: `dbService.saveMessage(message)` with decrypted content

### UI Patterns
- **Screens**: Toggle with `screen.active` class
- **Themes**: CSS variables with `data-theme="dark"` attribute
- **Modals**: Overlay with `modal` class and `modal.show` for visibility

### Development Workflow
- **No build**: Open `index.html` directly in browser
- **Debugging**: Check console for WebSocket/API errors
- **Testing crypto**: Use browser dev tools to inspect key operations

## Critical Integration Points
- **API base**: `https://localhost:7276` (update in `api.js`)
- **WebSocket**: `ws://localhost:8181` (update in `websocket.js`)
- **Key handling**: Always check `cryptoService.keyPair` before crypto operations
- **Error handling**: Use `apiService.handleError()` for consistent error messages

## Common Gotchas
- Private keys are **never** saved to IndexedDB (security feature)
- Room creation requires encrypting symmetric key for all participants
- WebSocket messages use envelope format with Type field
- Theme persistence uses localStorage, not IndexedDB