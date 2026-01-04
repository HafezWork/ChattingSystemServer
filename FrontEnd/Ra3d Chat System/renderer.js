/**
 * Renderer Process - Ra3d Chat System
 * Handles UI interactions, encryption/decryption, and WebSocket messaging
 */

// ==================== STATE MANAGEMENT ====================
const state = {
  currentUser: null,
  currentRoom: null,
  roomKeys: new Map(), // roomId -> AES key (base64)
  isLoggedIn: false,
  jwt: null,
  userCache: new Map(), // Cache for user info (userId -> {username, publicKey})
  pendingMessages: null, // Temporary storage for batching historical messages
  unreadCounts: new Map() // roomId -> unread count
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Convert ArrayBuffer to Base64
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Convert Base64 to ArrayBuffer
 */
function base64ToArrayBuffer(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

/**
 * Generate random AES-256 key (for room keys)
 */
function generateRoomKey() {
  const array = new Uint8Array(32) // 256 bits
  crypto.getRandomValues(array)
  return arrayBufferToBase64(array)
}

// ==================== VIEW SWITCHING ====================

function switchView(viewName) {
  const views = document.querySelectorAll('.view')
  views.forEach(v => v.classList.remove('active'))
  document.getElementById(viewName + 'View').classList.add('active')
}

function showChatApp() {
  document.getElementById('authView').classList.remove('active')
  document.getElementById('chatApp').classList.add('active')
}

function showAuthView() {
  document.getElementById('chatApp').classList.remove('active')
  document.getElementById('authView').classList.add('active')
  document.getElementById('loginView').classList.add('active')
}

// ==================== AUTHENTICATION ====================

/**
 * Handle Registration
 */
async function doRegister() {
  const inputs = document.querySelectorAll('#registerView input')
  const username = inputs[0].value.trim()
  const password = inputs[1].value
  const confirmPassword = inputs[2].value

  if (!username || !password) {
    alert('Please fill in all fields')
    return
  }

  if (password !== confirmPassword) {
    alert('Passwords do not match')
    return
  }

  try {
    // Call backend registration (generates RSA keypair in main process)
    const result = await api.register(username, password)

    if (result.success) {
      // Trigger save dialog for private key
      const saveResult = await api.savePrivateKey(result.privateKey, result.username)
      
      if (saveResult.success) {
        alert(`Registration successful!\n\nYour private key has been saved to:\n${saveResult.filePath}\n\nKeep this file safe! You'll need it to login.`)
        switchView('login')
        inputs[0].value = ''
        inputs[1].value = ''
        inputs[2].value = ''
      } else if (!saveResult.canceled) {
        alert('Failed to save private key: ' + saveResult.error)
      }
    }
  } catch (error) {
    alert('Registration failed: ' + error)
  }
}

/**
 * Handle Login
 */
async function doLogin() {
  const inputs = document.querySelectorAll('#loginView input')
  const username = inputs[0].value.trim()
  const password = inputs[1].value

  if (!username || !password) {
    alert('Please fill in all fields')
    return
  }

  try {
    // Prompt user to select private key file
    const keyFileResult = await api.openPrivateKey()
    
    if (keyFileResult.canceled) {
      return // User canceled file selection
    }

    if (!keyFileResult.success) {
      alert('Failed to load private key: ' + keyFileResult.error)
      return
    }

    // Login with private key
    const result = await api.login(username, password, keyFileResult.privateKeyPEM)

    if (result.success) {
      state.currentUser = {
        userId: result.userUid,
        username: username
      }
      state.isLoggedIn = true
      state.jwt = result.jwt // Store JWT for API calls and WebSocket
      
      showChatApp()
      await initializeChat()
    }
  } catch (error) {
    alert('Login failed: ' + error)
  }
}

/**
 * Handle Logout
 */
async function doLogout() {
  // Disconnect WebSocket
  await api.ws.disconnect()
  
  // Clear state
  state.currentUser = null
  state.isLoggedIn = false
  state.jwt = null
  state.roomKeys.clear()
  state.currentRoom = null
  
  // Show auth view
  showAuthView()
}

// ==================== CHAT INITIALIZATION ====================

/**
 * Initialize chat after successful login
 */
async function initializeChat() {
  // Setup WebSocket message handler
  api.ws.onMessage(handleIncomingMessage)
  api.ws.onReconnected(handleReconnect)
  
  // Load existing rooms
  await loadRooms()
  
  // Connect WebSocket with JWT
  if (state.jwt) {
    try {
      const wsResult = await api.ws.connect(state.jwt)
      if (wsResult.success) {
        console.log('[CHAT] WebSocket connected successfully')
      } else {
        console.error('[CHAT] WebSocket connection failed:', wsResult.error)
      }
    } catch (error) {
      console.error('[CHAT] WebSocket connection error:', error)
    }
  } else {
    console.warn('[CHAT] No JWT available for WebSocket connection')
  }
  
  console.log('[CHAT] Chat initialized')
}

/**
 * Handle reconnection - fetch missed messages
 */
async function handleReconnect() {
  console.log('[CHAT] Reconnected, fetching missed messages')
  if (state.currentRoom) {
    await api.ws.fetchMessages(state.currentRoom, null)
  }
}

// ==================== MESSAGE HANDLING ====================

/**
 * Handle incoming WebSocket message
 */
function handleIncomingMessage(envelope) {
  console.log('[WS] Received envelope:', envelope)
  
  // Handle different message types from backend
  if (envelope.Type === 'send' || envelope.Type === 'send_message') {
    // Check if this is a historical message (has Id) or new real-time message
    if (envelope.Id && envelope.Id !== '00000000-0000-0000-0000-000000000000') {
      // Historical message - collect for batch processing
      if (!state.pendingMessages || state.pendingMessages.length === 0) {
        console.log('[WS] Starting new message batch')
        state.pendingMessages = []
        
        // Process batch after a short delay (allows all messages to arrive)
        setTimeout(() => {
          console.log('[WS] Processing batched messages:', state.pendingMessages.length)
          processPendingMessages()
        }, 500)
      }
      state.pendingMessages.push(envelope)
      console.log('[WS] Added to batch, total:', state.pendingMessages.length)
    } else {
      // Real-time new message - process immediately
      console.log('[WS] Processing real-time message')
      handleNewMessage(envelope)
    }
  } else if (envelope.Type === 'message') {
    handleNewMessage(envelope)
  } else if (envelope.Type === 'fetch_response') {
    handleFetchedMessages(envelope)
  } else {
    console.log('[WS] Unknown envelope type:', envelope.Type)
  }
}

/**
 * Process pending messages in sorted order
 */
async function processPendingMessages() {
  if (!state.pendingMessages || state.pendingMessages.length === 0) {
    console.log('[WS] No pending messages to process')
    return
  }
  
  console.log('[WS] Processing', state.pendingMessages.length, 'pending messages')
  
  // Sort by timestamp (use Timestamp field or CreatedAt)
  const sorted = state.pendingMessages.sort((a, b) => {
    const timeA = new Date(a.Timestamp || a.CreatedAt || 0).getTime()
    const timeB = new Date(b.Timestamp || b.CreatedAt || 0).getTime()
    return timeA - timeB
  })
  
  // Process each message in order
  for (const envelope of sorted) {
    await handleNewMessage(envelope)
  }
  
  console.log('[WS] Finished processing batch')
  
  // Clear pending messages
  state.pendingMessages = []
}

/**
 * Handle new message
 */
async function handleNewMessage(envelope) {
  try {
    const isCurrentRoom = state.currentRoom && envelope.RoomId === state.currentRoom
    
    // If not current room, store to DB and update room list
    if (!isCurrentRoom) {
      console.log('[CHAT] Message for different room, storing and updating UI')
      
      // Store to local DB (even if not viewing this room)
      await api.storeMessage({
        messageId: envelope.Id || envelope.MessageId || crypto.randomUUID(),
        roomId: envelope.RoomId,
        senderId: envelope.SenderId,
        ciphertext: envelope.Ciphertext,
        nonce: envelope.Nonce,
        timestamp: envelope.Timestamp || envelope.CreatedAt || new Date().toISOString()
      })
      
      // Decrypt the message for preview
      let messagePreview = '🔒 New message'
      try {
        const keyResult = await api.getRoomKey(envelope.RoomId)
        if (keyResult.success && keyResult.roomKey) {
          const decrypted = await decryptMessage(
            envelope.Ciphertext,
            envelope.Nonce,
            keyResult.roomKey
          )
          messagePreview = decrypted.length > 50 ? decrypted.substring(0, 50) + '...' : decrypted
        }
      } catch (error) {
        console.error('[CHAT] Failed to decrypt for preview:', error)
      }
      
      // Increment unread count
      const currentUnread = state.unreadCounts.get(envelope.RoomId) || 0
      state.unreadCounts.set(envelope.RoomId, currentUnread + 1)
      
      // Update the specific room's preview in the UI
      updateRoomPreview(envelope.RoomId, messagePreview, currentUnread + 1)
      
      // Show system notification
      showNotification('New Message', messagePreview)
      
      console.log('[CHAT] New message in room:', envelope.RoomId, 'Unread:', currentUnread + 1)
      return
    }

    // Get room key
    const roomKey = state.roomKeys.get(envelope.RoomId)
    if (!roomKey) {
      console.error('[CHAT] No room key for room:', envelope.RoomId)
      return
    }

    // Decrypt message
    const decrypted = await decryptMessage(
      envelope.Ciphertext,
      envelope.Nonce,
      roomKey
    )

    // Get sender name
    const isMine = envelope.SenderId === state.currentUser.userId
    let senderName = isMine ? state.currentUser.username : 'User'
    
    if (!isMine) {
      // Try to get from cache
      if (state.userCache.has(envelope.SenderId)) {
        senderName = state.userCache.get(envelope.SenderId).username
      } else {
        // Fetch from backend
        try {
          const userResult = await api.getUserById(envelope.SenderId)
          if (userResult.success && userResult.user) {
            const username = userResult.user.userName || userResult.user.UserName || 'User'
            state.userCache.set(envelope.SenderId, { username })
            senderName = username
          }
        } catch (error) {
          console.error('[CHAT] Failed to fetch sender name:', error)
        }
      }
    }

    // Store to local DB
    await api.storeMessage({
      messageId: envelope.Id || envelope.MessageId || crypto.randomUUID(),
      roomId: envelope.RoomId,
      senderId: envelope.SenderId,
      ciphertext: envelope.Ciphertext,
      nonce: envelope.Nonce,
      timestamp: envelope.Timestamp || envelope.CreatedAt || new Date().toISOString()
    })

    // Display message
    displayMessage({
      messageId: envelope.Id || envelope.MessageId || crypto.randomUUID(),
      roomId: envelope.RoomId,
      senderId: envelope.SenderId,
      content: decrypted,
      timestamp: new Date(),
      isMine,
      senderName
    })
    
    console.log('[CHAT] Message stored and displayed:', decrypted)
  } catch (error) {
    console.error('[CHAT] Error handling message:', error)
  }
}

/**
 * Handle fetched messages response
 */
function handleFetchedMessages(envelope) {
  if (envelope.Messages && Array.isArray(envelope.Messages)) {
    envelope.Messages.forEach(msg => handleNewMessage(msg))
  }
}

/**
 * Send a message
 */
async function sendMessage() {
  const input = document.getElementById('messageInput')
  const content = input.value.trim()
  
  if (!content || !state.currentRoom) {
    return
  }

  try {
    // Get room key
    const roomKey = state.roomKeys.get(state.currentRoom)
    if (!roomKey) {
      console.error('[CHAT] No room key available')
      alert('Room key not available. Cannot send message.')
      return
    }

    // Encrypt message
    const { ciphertext, nonce } = await encryptMessage(content, roomKey)

    // Send via WebSocket
    const sent = await api.ws.sendMessage(
      state.currentRoom,
      ciphertext,
      nonce,
      state.currentUser.userId,
      1 // keyVersion
    )

    if (sent.success) {
      // Display message immediately (optimistic UI)
      displayMessage({
        messageId: crypto.randomUUID(),
        roomId: state.currentRoom,
        senderId: state.currentUser.userId,
        content: content,
        timestamp: new Date(),
        isMine: true
      })

      // Clear input
      input.value = ''
    } else {
      alert('Failed to send message. Message queued for retry.')
    }
  } catch (error) {
    console.error('[CHAT] Error sending message:', error)
    alert('Error sending message: ' + error.message)
  }
}

/**
 * Display stored encrypted message (decrypt first)
 */
async function displayStoredMessage(storedMsg) {
  try {
    // Get room key
    const roomKey = state.roomKeys.get(storedMsg.room_id)
    if (!roomKey) {
      console.error('[CHAT] No room key for stored message')
      return
    }
    
    // Decrypt
    const decrypted = await decryptMessage(
      storedMsg.content,
      storedMsg.iv,
      roomKey
    )
    
    // Get sender name
    const isMine = storedMsg.sender_uuid === state.currentUser.userId
    let senderName = isMine ? state.currentUser.username : 'User'
    
    if (!isMine) {
      if (state.userCache.has(storedMsg.sender_uuid)) {
        senderName = state.userCache.get(storedMsg.sender_uuid).username
      } else {
        try {
          const userResult = await api.getUserById(storedMsg.sender_uuid)
          if (userResult.success && userResult.user) {
            const username = userResult.user.userName || userResult.user.UserName || 'User'
            state.userCache.set(storedMsg.sender_uuid, { username })
            senderName = username
          }
        } catch (error) {
          console.error('[CHAT] Failed to fetch sender name:', error)
        }
      }
    }
    
    // Display
    displayMessage({
      messageId: storedMsg.message_id,
      roomId: storedMsg.room_id,
      senderId: storedMsg.sender_uuid,
      content: decrypted,
      timestamp: new Date(storedMsg.created_at),
      isMine: isMine,
      senderName: senderName
    })
  } catch (error) {
    console.error('[CHAT] Error displaying stored message:', error)
  }
}

/**
 * Display message in UI
 */
function displayMessage(message) {
  const messagesDiv = document.getElementById('messages')
  
  // Remove welcome message if it exists
  const welcomeMsg = messagesDiv.querySelector('.welcome-message')
  if (welcomeMsg) {
    welcomeMsg.remove()
  }
  
  const messageEl = document.createElement('div')
  messageEl.className = 'message' + (message.isMine ? ' mine' : '')
  
  const time = message.timestamp.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })
  
  const senderName = message.isMine ? 'You' : (message.senderName || 'User')
  
  messageEl.innerHTML = `
    <div class="message-header">
      <span class="sender">${senderName}</span>
      <span class="time">${time}</span>
    </div>
    <div class="message-content">${escapeHtml(message.content)}</div>
  `
  
  messagesDiv.appendChild(messageEl)
  messagesDiv.scrollTop = messagesDiv.scrollHeight
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// ==================== ENCRYPTION/DECRYPTION ====================

/**
 * Encrypt message with AES-256-GCM (matching backend format)
 * @param {string} plaintext - Message to encrypt
 * @param {string} roomKeyBase64 - Base64-encoded 32-byte AES key
 * @returns {Promise<{ciphertext: string, nonce: string}>}
 */
async function encryptMessage(plaintext, roomKeyBase64) {
  // Decode room key from base64
  const roomKeyBytes = base64ToArrayBuffer(roomKeyBase64)
  
  // Generate random 12-byte IV (nonce)
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  
  // Import key for Web Crypto API
  const key = await crypto.subtle.importKey(
    'raw',
    roomKeyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  )
  
  // Encode plaintext
  const encoder = new TextEncoder()
  const data = encoder.encode(plaintext)
  
  // Encrypt with AES-GCM
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    data
  )
  
  return {
    ciphertext: arrayBufferToBase64(encrypted),
    nonce: arrayBufferToBase64(iv)
  }
}

/**
 * Decrypt message with AES-256-GCM
 * @param {string} ciphertextBase64 - Base64-encoded ciphertext
 * @param {string} nonceBase64 - Base64-encoded nonce/IV
 * @param {string} roomKeyBase64 - Base64-encoded 32-byte AES key
 * @returns {Promise<string>} Decrypted plaintext
 */
async function decryptMessage(ciphertextBase64, nonceBase64, roomKeyBase64) {
  try {
    // Decode from base64
    const ciphertext = base64ToArrayBuffer(ciphertextBase64)
    const nonce = base64ToArrayBuffer(nonceBase64)
    const roomKeyBytes = base64ToArrayBuffer(roomKeyBase64)
    
    // Import key
    const key = await crypto.subtle.importKey(
      'raw',
      roomKeyBytes,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    )
    
    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce },
      key,
      ciphertext
    )
    
    // Decode to string
    const decoder = new TextDecoder()
    return decoder.decode(decrypted)
  } catch (error) {
    console.error('[CRYPTO] Decryption failed:', error)
    throw new Error('Failed to decrypt message')
  }
}

// ==================== NOTIFICATIONS ====================

/**
 * Show system notification
 */
function showNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '' })
  } else if ('Notification' in window && Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification(title, { body, icon: '' })
      }
    })
  }
}

/**
 * Update room preview without reloading entire list
 */
function updateRoomPreview(roomId, messageText, unreadCount) {
  const roomEl = document.querySelector(`.room-item[data-room-id="${roomId}"]`)
  if (!roomEl) {
    console.log('[ROOM] Room element not found, loading all rooms')
    loadRooms()
    return
  }
  
  // Update last message text
  const lastMessageEl = roomEl.querySelector('.room-last-message')
  if (lastMessageEl) {
    lastMessageEl.textContent = messageText
  }
  
  // Update or add unread badge
  const headerRow = roomEl.querySelector('.room-header-row')
  if (headerRow) {
    let badge = headerRow.querySelector('.unread-badge')
    if (unreadCount > 0) {
      if (badge) {
        badge.textContent = unreadCount
      } else {
        badge = document.createElement('span')
        badge.className = 'unread-badge'
        badge.textContent = unreadCount
        headerRow.appendChild(badge)
      }
    }
  }
  
  console.log('[ROOM] Updated preview for room:', roomId)
}

// ==================== ROOM MANAGEMENT ====================

/**
 * Load rooms from database
 */
async function loadRooms() {
  try {
    const rooms = await api.listRooms()
    console.log('[ROOM] Loaded rooms:', rooms)
    const roomsList = document.getElementById('roomsList')
    roomsList.innerHTML = ''
    
    if (rooms.length === 0) {
      roomsList.innerHTML = '<div class="no-rooms">No rooms yet. Create one!</div>'
      return
    }
    
    for (const room of rooms) {
      const roomEl = document.createElement('div')
      roomEl.className = 'room-item'
      
      // Use the mapped room properties (id, name, type)
      const roomId = room.id || room.room_id
      const roomName = room.name || `Room ${roomId.substring(0, 8)}`
      
      // Get last message from local DB and decrypt it
      let lastMessageText = 'No messages yet'
      try {
        const localMessages = await api.getMessagesForRoom(roomId)
        if (localMessages && localMessages.length > 0) {
          const lastMsg = localMessages[localMessages.length - 1]
          
          // Get room key to decrypt
          const keyResult = await api.getRoomKey(roomId)
          if (keyResult.success && keyResult.roomKey) {
            try {
              // Decrypt the last message
              const decrypted = await decryptMessage(
                lastMsg.content,
                lastMsg.iv,
                keyResult.roomKey
              )
              // Truncate if too long
              lastMessageText = decrypted.length > 50 
                ? decrypted.substring(0, 50) + '...' 
                : decrypted
            } catch (decryptError) {
              console.error('[ROOM] Failed to decrypt last message:', decryptError)
              lastMessageText = '🔒 Encrypted message'
            }
          } else {
            lastMessageText = '🔒 Encrypted message'
          }
        }
      } catch (error) {
        console.error('[ROOM] Error loading last message:', error)
      }
      
      // Get unread count
      const unreadCount = state.unreadCounts.get(roomId) || 0
      const unreadBadge = unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''
      
      roomEl.innerHTML = `
        <div class="room-header-row">
          <div class="room-name">${roomName}</div>
          ${unreadBadge}
        </div>
        <div class="room-last-message">${lastMessageText}</div>
      `
      roomEl.dataset.roomId = roomId
      roomEl.onclick = () => selectRoom(roomId)
      roomsList.appendChild(roomEl)
    }
  } catch (error) {
    console.error('[ROOM] Error loading rooms:', error)
  }
}

/**
 * Select a room
 */
async function selectRoom(roomId) {
  try {
    console.log('[ROOM] Selecting room:', roomId)
    
    // Get room key
    const keyResult = await api.getRoomKey(roomId)
    
    if (!keyResult.success) {
      alert('Failed to load room key: ' + keyResult.error)
      return
    }
    
    // Store room key
    state.roomKeys.set(roomId, keyResult.roomKey)
    state.currentRoom = roomId
    
    // Clear pending messages to avoid stale batch
    state.pendingMessages = []
    
    // Clear unread count for this room
    state.unreadCounts.set(roomId, 0)
    
    // Update UI - find the room to get its name
    const rooms = await api.listRooms()
    const room = rooms.find(r => (r.id || r.room_id) === roomId)
    const roomName = room ? (room.name || `Room ${roomId.substring(0, 8)}`) : `Room ${roomId.substring(0, 8)}`
    
    document.querySelectorAll('.room-item').forEach(el => {
      el.classList.remove('active')
      if (el.dataset.roomId === roomId) {
        el.classList.add('active')
      }
    })
    
    // Update chat header
    document.querySelector('.chat-header h4').textContent = `# ${roomName}`
    
    // Clear messages UI
    const messagesDiv = document.getElementById('messages')
    messagesDiv.innerHTML = ''
    
    // Load local messages first
    console.log('[ROOM] Loading local messages...')
    const localMessages = await api.getMessagesForRoom(roomId)
    
    if (localMessages && localMessages.length > 0) {
      console.log('[ROOM] Found', localMessages.length, 'local messages')
      // Display local messages
      for (const msg of localMessages) {
        await displayStoredMessage(msg)
      }
    }
    
    // Fetch new messages from server (incremental update)
    const lastMessageId = await api.getLastMessageId(roomId)
    console.log('[ROOM] Fetching updates after message ID:', lastMessageId)
    await api.ws.fetchMessages(roomId, lastMessageId)
    
    console.log('[ROOM] Selected room complete:', roomId)
  } catch (error) {
    console.error('[ROOM] Error selecting room:', error)
    alert('Failed to select room: ' + error)
  }
}

/**
 * Show create room dialog
 */
function showCreateRoomDialog() {
  document.getElementById('createRoomDialog').style.display = 'flex'
}

/**
 * Hide create room dialog
 */
function hideCreateRoomDialog() {
  document.getElementById('createRoomDialog').style.display = 'none'
  // Clear inputs
  document.getElementById('dmUsername').value = ''
  document.getElementById('groupRoomName').value = ''
  document.getElementById('groupUsernames').value = ''
}

/**
 * Switch between DM and Group tabs
 */
function switchRoomTab(tab) {
  const tabs = document.querySelectorAll('.tab')
  const tabContents = document.querySelectorAll('.tab-content')
  
  tabs.forEach(t => t.classList.remove('active'))
  tabContents.forEach(tc => tc.classList.remove('active'))
  
  if (tab === 'dm') {
    tabs[0].classList.add('active')
    document.getElementById('dmTab').classList.add('active')
  } else {
    tabs[1].classList.add('active')
    document.getElementById('groupTab').classList.add('active')
  }
}

/**
 * Create a direct message room
 */
async function createDMRoom() {
  const username = document.getElementById('dmUsername').value.trim()
  
  if (!username) {
    alert('Please enter a username')
    return
  }
  
  try {
    const result = await api.createDM(username)
    
    if (result.roomId) {
      alert(`DM created successfully with ${username}!`)
      hideCreateRoomDialog()
      await loadRooms()
      await selectRoom(result.roomId)
    }
  } catch (error) {
    alert('Failed to create DM: ' + error)
  }
}

/**
 * Create a group room
 */
async function createGroupRoom() {
  const roomName = document.getElementById('groupRoomName').value.trim()
  const usernamesText = document.getElementById('groupUsernames').value.trim()
  
  if (!roomName) {
    alert('Please enter a room name')
    return
  }
  
  if (!usernamesText) {
    alert('Please enter at least one username')
    return
  }
  
  // Parse usernames (one per line)
  const usernames = usernamesText.split('\n')
    .map(u => u.trim())
    .filter(u => u.length > 0)
  
  if (usernames.length === 0) {
    alert('Please enter at least one valid username')
    return
  }
  
  try {
    const result = await api.createGroup(roomName, usernames)
    
    if (result.roomId) {
      alert(`Group "${roomName}" created successfully with ${usernames.length} member(s)!`)
      hideCreateRoomDialog()
      await loadRooms()
      await selectRoom(result.roomId)
    }
  } catch (error) {
    alert('Failed to create group: ' + error)
  }
}

/**
 * Create a direct message room (kept for compatibility)
 */
async function createDM() {
  showCreateRoomDialog()
  switchRoomTab('dm')
}

// ==================== EVENT LISTENERS ====================

// Enter key to send message
document.addEventListener('DOMContentLoaded', () => {
  const messageInput = document.getElementById('messageInput')
  if (messageInput) {
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage()
      }
    })
  }
})

// Expose functions to global scope for onclick handlers
window.switchView = switchView
window.doRegister = doRegister
window.doLogin = doLogin
window.doLogout = doLogout
window.sendMessage = sendMessage
window.createDM = createDM
window.showCreateRoomDialog = showCreateRoomDialog
window.hideCreateRoomDialog = hideCreateRoomDialog
window.switchRoomTab = switchRoomTab
window.createDMRoom = createDMRoom
window.createGroupRoom = createGroupRoom
window.selectRoom = selectRoom
  