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
  unreadCounts: new Map(), // roomId -> unread count
  displayedMessages: new Set(), // Track displayed message IDs to prevent duplicates
  isFetchingHistory: false, // Flag to prevent notifications during initial fetch
  pagination: {
    pageSize: 50, // Load 50 messages at a time
    hasMore: new Map(), // roomId -> boolean (has more messages to load)
    isLoading: false // Prevent multiple simultaneous loads
  }
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

/**
 * Extract peer user ID from DM room name formatted as "{firstUserId}-{secondUserId}"
 * GUIDs are 36 characters long (including dashes), so room name is 73 chars total
 * @param {string} roomName - The room name in format "userId1-userId2"
 * @param {string} currentUserId - Current user's ID
 * @returns {string|null} The other user's ID or null if parsing fails
 */
function extractPeerIdFromRoomName(roomName, currentUserId) {
  if (!roomName || !currentUserId) return null
  
  // GUIDs are 36 characters: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  // Room name format: {guid1}-{guid2} = 36 + 1 + 36 = 73 characters
  if (roomName.length !== 73) return null
  
  const firstUserId = roomName.substring(0, 36)
  const secondUserId = roomName.substring(37, 73)
  
  // Return the ID that isn't the current user's
  return firstUserId === currentUserId ? secondUserId : firstUserId
}

/**
 * Check if a room is a DM (based on name format)
 * DM format: {guid}-{guid} (73 chars)
 * Group chat: Any other format
 */
function isDMRoom(roomName) {
  if (!roomName) return false
  // DM rooms have exactly 73 characters (36 + 1 + 36)
  return roomName.length === 73
}

// ==================== VIEW SWITCHING ====================

function switchView(viewName) {
  const views = document.querySelectorAll('.view')
  views.forEach(v => v.classList.remove('active'))
  
  const targetView = document.getElementById(viewName + 'View')
  targetView.classList.add('active')
  
  // Force reflow to ensure DOM is updated
  targetView.offsetHeight
  
  // Re-enable all inputs, buttons and focus the first input
  requestAnimationFrame(() => {
    const inputs = targetView.querySelectorAll('input')
    inputs.forEach(input => {
      input.disabled = false
      input.readOnly = false
      input.tabIndex = 0
    })
    
    const buttons = targetView.querySelectorAll('button')
    buttons.forEach(button => {
      button.disabled = false
      button.tabIndex = 0
    })
    
    if (inputs[0]) {
      inputs[0].focus()
    }
  })
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
        // Clear registration form first
        inputs[0].value = ''
        inputs[1].value = ''
        inputs[2].value = ''
        
        // Show success message
        alert(`Registration successful!\n\nYour private key has been saved to:\n${saveResult.filePath}\n\nKeep this file safe! You'll need it to login.`)
        
        // Switch view after alert is dismissed (prevents input blocking)
        setTimeout(() => {
          switchView('login')
        }, 100)
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
  console.log('[AUTH] Login button clicked')
  const inputs = document.querySelectorAll('#loginView input')
  const username = inputs[0].value.trim()
  const password = inputs[1].value
  
  console.log('[AUTH] Username:', username, 'Password length:', password.length)

  if (!username || !password) {
    alert('Please fill in all fields')
    return
  }

  try {
    console.log('[AUTH] Opening private key file dialog...')
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
      
      // Update UI with username
      document.getElementById('currentUsername').textContent = username
      
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
        
        // Fetch latest messages for all rooms after connection
        await fetchAllRoomMessages()
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
 * Fetch latest messages for all rooms
 */
async function fetchAllRoomMessages() {
  try {
    state.isFetchingHistory = true // Disable notifications during history fetch
    
    const rooms = await api.listRooms()
    console.log(`[CHAT] Fetching latest messages for ${rooms.length} rooms`)
    
    for (const room of rooms) {
      const roomId = room.id || room.room_id
      
      // Get the last message ID we have locally
      const lastMessageId = await api.getLastMessageId(roomId)
      
      // Fetch updates from server
      console.log(`[CHAT] Fetching updates for room ${roomId} after message:`, lastMessageId)
      await api.ws.fetchMessages(roomId, lastMessageId)
      
      // Small delay between requests to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    console.log('[CHAT] Finished fetching messages for all rooms')
    
    // Wait a bit for messages to be processed before re-enabling notifications
    await new Promise(resolve => setTimeout(resolve, 500))
    
    console.log('[CHAT] Re-enabling notifications')
  } catch (error) {
    console.error('[CHAT] Error fetching all room messages:', error)
  } finally {
    state.isFetchingHistory = false // Re-enable notifications for real-time messages
  }
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
  } else if (envelope.Type === 'room_created' || envelope.Type === 'RoomCreated') {
    // New room created - refresh rooms list
    console.log('[WS] Room created notification received:', envelope)
    console.log('[WS] Calling loadRooms()...')
    loadRooms().then(() => {
      console.log('[WS] Rooms reloaded successfully')
    }).catch(err => {
      console.error('[WS] Error reloading rooms:', err)
    })
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
      
      // Check if message is from current user (don't count own messages as unread)
      const isMine = envelope.SenderId === state.currentUser?.userId
      
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
      
      // Only increment unread count if message is NOT from current user
      let unreadCount = state.unreadCounts.get(envelope.RoomId) || 0
      if (!isMine) {
        unreadCount = unreadCount + 1
        state.unreadCounts.set(envelope.RoomId, unreadCount)
        
        // Show system notification only for real-time messages (not during history fetch)
        if (!state.isFetchingHistory) {
          // Get sender name
          let senderName = 'User'
          if (state.userCache.has(envelope.SenderId)) {
            senderName = state.userCache.get(envelope.SenderId).username
          } else {
            try {
              const userResult = await api.getUserById(envelope.SenderId)
              if (userResult.success && userResult.user) {
                senderName = userResult.user.userName || userResult.user.UserName || 'User'
                state.userCache.set(envelope.SenderId, { username: senderName })
              }
            } catch (error) {
              console.error('[CHAT] Failed to fetch sender for notification:', error)
            }
          }
          
          // Get room name
          let roomName = `Room ${envelope.RoomId.substring(0, 8)}`
          try {
            const rooms = await api.listRooms()
            const room = rooms.find(r => (r.id || r.room_id) === envelope.RoomId)
            if (room) {
              // For DM rooms, extract peer username
              if (room.name && room.name.length === 73) { // DM format: userId-userId
                const peerId = extractPeerIdFromRoomName(room.name, state.currentUser?.userId)
                if (peerId) {
                  try {
                    const peerInfo = await api.getUserById(peerId)
                    if (peerInfo.success && peerInfo.user) {
                      roomName = `@${peerInfo.user.userName || peerInfo.user.username || peerId}`
                    }
                  } catch (err) {
                    console.error('[CHAT] Failed to fetch peer for notification:', err)
                  }
                }
              } else {
                roomName = room.name || roomName
              }
            }
          } catch (error) {
            console.error('[CHAT] Failed to fetch room for notification:', error)
          }
          
          showNotification(`${senderName} in ${roomName}`, messagePreview)
        }
        
        console.log('[CHAT] New message in room:', envelope.RoomId, 'Unread:', unreadCount)
      } else {
        console.log('[CHAT] Own message in different room:', envelope.RoomId)
      }
      
      // Update the specific room's preview in the UI
      updateRoomPreview(envelope.RoomId, messagePreview, unreadCount)
      
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

    // Store to local DB or update temp ID with server ID
    if (isMine) {
      // Update temp ID with real server ID
      await api.updateMessageId(
        envelope.RoomId,
        envelope.Ciphertext,
        envelope.Id || envelope.MessageId
      )
    } else {
      // Store new message from other users
      await api.storeMessage({
        messageId: envelope.Id || envelope.MessageId || crypto.randomUUID(),
        roomId: envelope.RoomId,
        senderId: envelope.SenderId,
        ciphertext: envelope.Ciphertext,
        nonce: envelope.Nonce,
        timestamp: envelope.Timestamp || envelope.CreatedAt || new Date().toISOString()
      })
    }

    // Display message (use proper timestamp for deduplication)
    // Ensure timestamp is treated as UTC if it doesn't have Z suffix
    let timestamp
    if (envelope.Timestamp || envelope.CreatedAt) {
      const timeStr = envelope.Timestamp || envelope.CreatedAt
      // Add Z suffix if missing to force UTC parsing
      const isoString = timeStr.endsWith('Z') ? timeStr : timeStr + 'Z'
      timestamp = new Date(isoString)
    } else {
      timestamp = new Date()
    }
    
    // If this is our own message (server echo), update the existing message UI
    if (isMine) {
      const contentHash = `${envelope.Ciphertext}-${envelope.SenderId}`.substring(0, 50)
      const timestampSeconds = Math.floor(timestamp.getTime() / 1000)
      const messageKey = `${envelope.RoomId}-${contentHash}-${timestampSeconds}`
      
      // Find and update the existing message element to remove sending indicator
      const existingMsg = document.querySelector(`[data-message-key="${messageKey}"]`)
      if (existingMsg) {
        const timeEl = existingMsg.querySelector('.time')
        if (timeEl) {
          const time = timestamp.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          })
          timeEl.innerHTML = time // Remove sending indicator
        }
        console.log('[CHAT] Updated sent message confirmation')
      } else {
        // Message not found in UI, decrypt and display
        const decrypted = await decryptMessage(
          envelope.Ciphertext,
          envelope.Nonce,
          roomKey
        )
        
        displayMessage({
          messageId: envelope.Id || envelope.MessageId,
          roomId: envelope.RoomId,
          senderId: envelope.SenderId,
          content: decrypted,
          ciphertext: envelope.Ciphertext, // Required for messageKey matching
          timestamp: timestamp,
          isMine,
          senderName
        })
      }
    } else {
      // Not our message, decrypt and display normally
      const decrypted = await decryptMessage(
        envelope.Ciphertext,
        envelope.Nonce,
        roomKey
      )
      
      displayMessage({
        messageId: envelope.Id || envelope.MessageId,
        roomId: envelope.RoomId,
        senderId: envelope.SenderId,
        content: decrypted,
        ciphertext: envelope.Ciphertext, // Required for messageKey matching
        timestamp: timestamp,
        isMine,
        senderName
      })
    }
    
    // Update room preview for current room too
    const preview = decrypted.length > 50 ? decrypted.substring(0, 50) + '...' : decrypted
    updateRoomPreview(envelope.RoomId, preview, 0)
    
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

    // Create timestamp for both optimistic UI and server
    const timestamp = new Date()
    const timestampISO = timestamp.toISOString()
    
    // Generate temporary message ID
    const tempMessageId = `temp-${Date.now()}-${Math.random()}`
    
    // Store to local database immediately (prevents showing as unread after logout/login)
    await api.storeMessage({
      messageId: tempMessageId,
      roomId: state.currentRoom,
      senderId: state.currentUser.userId,
      ciphertext: ciphertext,
      nonce: nonce,
      timestamp: timestampISO
    })
    
    // Display message immediately (optimistic UI)
    displayMessage({
      messageId: tempMessageId,
      roomId: state.currentRoom,
      senderId: state.currentUser.userId,
      content: content,
      ciphertext: ciphertext, // Required for messageKey matching
      timestamp: timestamp,
      isMine: true,
      senderName: state.currentUser.username,
      isSending: true
    })
    
    // Update room preview
    const preview = content.length > 50 ? content.substring(0, 50) + '...' : content
    updateRoomPreview(state.currentRoom, preview, 0)

    // Clear input immediately
    input.value = ''

    // Send via WebSocket with timestamp
    const sent = await api.ws.sendMessage(
      state.currentRoom,
      ciphertext,
      nonce,
      state.currentUser.userId,
      1, // keyVersion
      timestampISO
    )

    if (!sent.success) {
      alert('Failed to send message. Message queued for retry.')
    }
  } catch (error) {
    console.error('[CHAT] Error sending message:', error)
    alert('Error sending message: ' + error.message)
  }
}

/**
 * Display stored encrypted message (decrypt first)
 * @param {boolean} prepend - If true, add to top instead of bottom
 */
async function displayStoredMessage(storedMsg, prepend = false) {
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
    
    // Parse timestamp - ensure UTC if no Z suffix
    const timeStr = storedMsg.created_at
    const isoString = timeStr.endsWith('Z') ? timeStr : timeStr + 'Z'
    const timestamp = new Date(isoString)
    
    // Display
    displayMessage({
      messageId: storedMsg.message_id,
      roomId: storedMsg.room_id,
      senderId: storedMsg.sender_uuid,
      content: decrypted,
      ciphertext: storedMsg.content, // Required for messageKey matching
      timestamp: timestamp,
      isMine: isMine,
      senderName: senderName
    }, prepend)
  } catch (error) {
    console.error('[CHAT] Error displaying stored message:', error)
  }
}

/**
 * Display message in UI
 * @param {boolean} prepend - If true, add to top instead of bottom
 */
function displayMessage(message, prepend = false) {
  const messagesDiv = document.getElementById('messages')
  
  // Create a unique key based on ciphertext and sender for better deduplication
  // MUST use ciphertext (not plaintext) to match server echo in handleNewMessage()
  const contentHash = `${message.ciphertext}-${message.senderId}`.substring(0, 50)
  const timestampSeconds = Math.floor(message.timestamp.getTime() / 1000)
  
  // Use content-based key for deduplication (handles both temp and real IDs)
  const messageKey = `${message.roomId}-${contentHash}-${timestampSeconds}`
  
  // Check for duplicate
  if (state.displayedMessages.has(messageKey)) {
    console.log('[DISPLAY] Skipping duplicate message:', messageKey)
    return
  }
  state.displayedMessages.add(messageKey)
  
  const welcomeMsg = messagesDiv.querySelector('.welcome-message')
  if (welcomeMsg) {
    welcomeMsg.remove()
  }
  
  const messageEl = document.createElement('div')
  messageEl.className = 'message' + (message.isMine ? ' mine' : '')
  messageEl.dataset.messageKey = messageKey
  
  const time = message.timestamp.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })
  
  const senderName = message.isMine ? 'You' : (message.senderName || 'User')
  const sendingIndicator = message.isSending ? ' <span style="opacity: 0.5; font-size: 0.8em">⏳</span>' : ''
  
  messageEl.innerHTML = `
    <div class="message-header">
      <span class="sender">${senderName}</span>
      <span class="time">${time}${sendingIndicator}</span>
    </div>
    <div class="message-content">${escapeHtml(message.content)}</div>
  `
  
  if (prepend) {
    // Insert after load-more button if it exists
    const loadMoreBtn = messagesDiv.querySelector('.load-more-btn')
    if (loadMoreBtn) {
      messagesDiv.insertBefore(messageEl, loadMoreBtn.nextSibling)
    } else {
      messagesDiv.insertBefore(messageEl, messagesDiv.firstChild)
    }
  } else {
    messagesDiv.appendChild(messageEl)
    messagesDiv.scrollTop = messagesDiv.scrollHeight
  }
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

// Debounce timer for loadRooms
let loadRoomsTimeout = null

/**
 * Load rooms from database (debounced to prevent duplicates)
 */
async function loadRooms() {
  // Clear any pending loadRooms call
  if (loadRoomsTimeout) {
    console.log('[ROOM] Debouncing loadRooms call')
    clearTimeout(loadRoomsTimeout)
  }
  
  // Debounce to prevent duplicate calls within 300ms
  return new Promise((resolve) => {
    loadRoomsTimeout = setTimeout(async () => {
      try {
        const rooms = await api.listRooms()
        console.log('[ROOM] Loaded rooms:', rooms)
        const roomsList = document.getElementById('roomsList')
        const archivedRoomsList = document.getElementById('archivedRoomsList')
        roomsList.innerHTML = ''
        archivedRoomsList.innerHTML = ''
        
        // Separate active and archived rooms
        const activeRooms = []
        const archivedRooms = []
        
        for (const room of rooms) {
          if (room.archived || room.Archived) {
            archivedRooms.push(room)
          } else {
            activeRooms.push(room)
          }
        }
        
        if (activeRooms.length === 0) {
          roomsList.innerHTML = '<div class="no-rooms">No rooms yet. Create one!</div>'
        }
        
        if (archivedRooms.length === 0) {
          archivedRoomsList.innerHTML = '<div class="no-rooms">No archived rooms</div>'
        }
    
    // Render active rooms
    for (const room of activeRooms) {
      const roomEl = document.createElement('div')
      roomEl.className = 'room-item'
      
      // Use the mapped room properties (id, name, type)
      const roomId = room.id || room.room_id
      let roomName = room.name || `Room ${roomId.substring(0, 8)}`
      
      // Determine if it's a DM or group
      const isDM = isDMRoom(room.name)
      const roomIcon = isDM ? '👤' : '👥'
      
      // For DM rooms, try to extract peer ID and fetch their username
      const peerId = extractPeerIdFromRoomName(room.name, state.currentUser?.userId)
      if (peerId) {
        try {
          const peerInfo = await api.getUserById(peerId)
          if (peerInfo.success && peerInfo.user) {
            roomName = `@${peerInfo.user.userName || peerInfo.user.username || peerId}`
          }
        } catch (error) {
          console.error('[ROOM] Failed to fetch peer info:', error)
          roomName = `DM-${peerId.substring(0, 8)}`
        }
      }
      
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
          <div class="room-name"><span class="room-icon">${roomIcon}</span> ${roomName}</div>
          ${unreadBadge}
        </div>
        <div class="room-last-message">${lastMessageText}</div>
      `
      roomEl.dataset.roomId = roomId
      roomEl.onclick = () => selectRoom(roomId)
      roomsList.appendChild(roomEl)
    }
    
    // Render archived rooms
    for (const room of archivedRooms) {
      const roomEl = document.createElement('div')
      roomEl.className = 'room-item archived'
      
      const roomId = room.id || room.room_id
      let roomName = room.name || `Room ${roomId.substring(0, 8)}`
      
      // Determine if it's a DM or group
      const isDM = isDMRoom(room.name)
      const roomIcon = isDM ? '👤' : '👥'
      
      // For DM rooms, extract peer username
      const peerId = extractPeerIdFromRoomName(room.name, state.currentUser?.userId)
      if (peerId) {
        try {
          const peerInfo = await api.getUserById(peerId)
          if (peerInfo.success && peerInfo.user) {
            roomName = `@${peerInfo.user.userName || peerInfo.user.username || peerId}`
          }
        } catch (error) {
          roomName = `DM-${peerId.substring(0, 8)}`
        }
      }
      
      roomEl.innerHTML = `
        <div class="room-header-row">
          <div class="room-name"><span class="room-icon">${roomIcon}</span> ${roomName} <span class="archived-badge">📦</span></div>
        </div>
        <div class="room-last-message">Left group - Read only</div>
      `
      roomEl.dataset.roomId = roomId
      roomEl.onclick = () => selectRoom(roomId, true)
      archivedRoomsList.appendChild(roomEl)
    }
    
        resolve()
      } catch (error) {
        console.error('[ROOM] Error loading rooms:', error)
        resolve()
      }
    }, 300)
  })
}

/**
 * Select a room
 * @param {boolean} isArchived - Whether this is an archived (read-only) room
 */
async function selectRoom(roomId, isArchived = false) {
  try {
    // Don't reload if already in this room
    if (state.currentRoom === roomId) {
      console.log('[ROOM] Already in this room, ignoring click')
      return
    }
    
    console.log('[ROOM] Selecting room:', roomId, 'Archived:', isArchived)
    
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
    
    // Clear displayed messages set for fresh room view
    state.displayedMessages.clear()
    
    // Clear unread count for this room
    state.unreadCounts.set(roomId, 0)
    
    // Remove unread badge from UI
    const roomEl = document.querySelector(`.room-item[data-room-id="${roomId}"]`)
    if (roomEl) {
      const badge = roomEl.querySelector('.unread-badge')
      if (badge) {
        badge.remove()
      }
    }
    
    // Update UI - find the room to get its name
    const rooms = await api.listRooms()
    const room = rooms.find(r => (r.id || r.room_id) === roomId)
    let roomName = room ? (room.name || `Room ${roomId.substring(0, 8)}`) : `Room ${roomId.substring(0, 8)}`
    
    // For DM rooms, extract peer ID and fetch their username
    if (room && room.name) {
      const peerId = extractPeerIdFromRoomName(room.name, state.currentUser?.userId)
      if (peerId) {
        try {
          const peerInfo = await api.getUserById(peerId)
          if (peerInfo.success && peerInfo.user) {
            roomName = `@${peerInfo.user.userName || peerInfo.user.username || peerId}`
          }
        } catch (error) {
          console.error('[ROOM] Failed to fetch peer info for header:', error)
        }
      }
    }
    
    document.querySelectorAll('.room-item').forEach(el => {
      el.classList.remove('active')
      if (el.dataset.roomId === roomId) {
        el.classList.add('active')
      }
    })
    
    // Update chat header
    document.querySelector('.chat-header h4').textContent = `${roomName}${isArchived ? ' 📦' : ''}`
    
    // Show/hide leave button based on room type and archived status
    // Group chat = NOT a DM (name is not in {guid}-{guid} format)
    const leaveBtn = document.getElementById('leaveGroupBtn')
    const roomNameToCheck = room ? room.name : null
    const isGroupChat = roomNameToCheck && !isDMRoom(roomNameToCheck)
    if (leaveBtn) {
      leaveBtn.style.display = (isGroupChat && !isArchived) ? 'block' : 'none'
    }
    
    // Show/hide group info button (only for groups, not DMs)
    const groupInfoBtn = document.getElementById('groupInfoBtn')
    if (groupInfoBtn) {
      groupInfoBtn.style.display = (isGroupChat && !isArchived) ? 'block' : 'none'
    }
    
    // Update admin buttons (Add Members) based on creator status
    if (isGroupChat && !isArchived) {
      await updateAdminButtons(roomId)
    } else {
      const addMembersBtn = document.getElementById('addMembersBtn')
      if (addMembersBtn) {
        addMembersBtn.style.display = 'none'
      }
    }
    
    // Show/hide message input based on archived status
    const inputBar = document.querySelector('.input-bar')
    if (inputBar) {
      inputBar.style.display = isArchived ? 'none' : 'flex'
    }
    
    // Show archived notice if room is archived
    if (isArchived) {
      const messagesDiv = document.getElementById('messages')
      const notice = document.createElement('div')
      notice.className = 'archived-notice'
      notice.innerHTML = '📦 <strong>Archived Room</strong> - You left this group. Messages are read-only.'
      messagesDiv.appendChild(notice)
    }
    
    // Clear messages UI
    const messagesDiv = document.getElementById('messages')
    messagesDiv.innerHTML = ''
    
    // Load initial batch of messages (last 50)
    console.log('[ROOM] Loading initial messages...')
    const result = await api.getMessagesForRoomPaginated(roomId, state.pagination.pageSize, 0)
    
    state.pagination.hasMore.set(roomId, result.hasMore)
    
    if (result.messages && result.messages.length > 0) {
      console.log(`[ROOM] Loaded ${result.messages.length}/${result.total} messages`)
      
      // Show "Load more" button if there are older messages
      if (result.hasMore) {
        showLoadMoreButton()
      }
      
      // Display messages
      for (const msg of result.messages) {
        await displayStoredMessage(msg)
      }
    }
    
    // Setup scroll listener for loading more messages
    setupScrollListener()
    
    console.log('[ROOM] Selected room complete:', roomId)
  } catch (error) {
    console.error('[ROOM] Error selecting room:', error)
    alert('Failed to select room: ' + error)
  }
}

/**
 * Show \"Load more\" indicator at top of messages
 */
function showLoadMoreButton() {
  const messagesDiv = document.getElementById('messages')
  
  // Remove existing button if any
  const existing = messagesDiv.querySelector('.load-more-btn')
  if (existing) existing.remove()
  
  const loadMoreBtn = document.createElement('div')
  loadMoreBtn.className = 'load-more-btn'
  loadMoreBtn.innerHTML = '<button class="secondary" onclick="loadMoreMessages()">▲ Load older messages</button>'
  
  messagesDiv.insertBefore(loadMoreBtn, messagesDiv.firstChild)
}

/**
 * Load more messages (older history)
 */
async function loadMoreMessages() {
  if (!state.currentRoom || state.pagination.isLoading) {
    return
  }
  
  const hasMore = state.pagination.hasMore.get(state.currentRoom)
  if (!hasMore) {
    return
  }
  
  try {
    state.pagination.isLoading = true
    
    // Update button to show loading
    const btn = document.querySelector('.load-more-btn button')
    if (btn) {
      btn.disabled = true
      btn.textContent = '⏳ Loading...'
    }
    
    // Calculate offset (number of messages already loaded)
    const messagesDiv = document.getElementById('messages')
    const currentCount = messagesDiv.querySelectorAll('.message').length
    
    console.log('[PAGINATION] Loading more messages, current count:', currentCount)
    
    // Load next batch
    const result = await api.getMessagesForRoomPaginated(
      state.currentRoom,
      state.pagination.pageSize,
      currentCount
    )
    
    state.pagination.hasMore.set(state.currentRoom, result.hasMore)
    
    if (result.messages && result.messages.length > 0) {
      console.log(`[PAGINATION] Loaded ${result.messages.length} more messages`)
      
      // Save current scroll position
      const messagesDiv = document.getElementById('messages')
      const oldScrollHeight = messagesDiv.scrollHeight
      
      // Display new messages at the top (before existing ones)
      for (const msg of result.messages) {
        await displayStoredMessage(msg, true) // prepend mode
      }
      
      // Restore scroll position (compensate for new messages)
      const newScrollHeight = messagesDiv.scrollHeight
      messagesDiv.scrollTop = newScrollHeight - oldScrollHeight
      
      // Update or remove \"Load more\" button
      if (result.hasMore) {
        const btn = document.querySelector('.load-more-btn button')
        if (btn) {
          btn.disabled = false
          btn.textContent = '▲ Load older messages'
        }
      } else {
        const loadMoreBtn = document.querySelector('.load-more-btn')
        if (loadMoreBtn) loadMoreBtn.remove()
      }
    }
  } catch (error) {
    console.error('[PAGINATION] Error loading more messages:', error)
    alert('Failed to load more messages')
  } finally {
    state.pagination.isLoading = false
  }
}

/**
 * Setup scroll listener for auto-loading on scroll to top
 */
function setupScrollListener() {
  const messagesDiv = document.getElementById('messages')
  
  // Remove old listener if exists
  messagesDiv.onscroll = null
  
  messagesDiv.onscroll = () => {
    // If scrolled near the top (within 100px), load more
    if (messagesDiv.scrollTop < 100 && !state.pagination.isLoading) {
      const hasMore = state.pagination.hasMore.get(state.currentRoom)
      if (hasMore) {
        loadMoreMessages()
      }
    }
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
      // Don't call loadRooms here - WebSocket room_created notification will handle it
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
      // Don't call loadRooms here - WebSocket room_created notification will handle it
      // Just wait a moment for the notification then select the room
      setTimeout(() => selectRoom(result.roomId), 500)
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

/**
 * Leave current group
 */
async function leaveCurrentGroup() {
  if (!state.currentRoom) {
    return
  }

  try {
    // Get room info to check if user is creator
    const roomInfo = await api.getGroupInfo(state.currentRoom)
    
    if (!roomInfo.success) {
      // If unable to get room info, try to leave directly
      if (confirm('Are you sure you want to leave this group?')) {
        const result = await api.leaveGroup(state.currentRoom)
        if (result.success) {
          await handleSuccessfulLeave()
        } else {
          alert('Failed to leave group: ' + result.error)
        }
      }
      return
    }
    
    const isCreator = roomInfo.room.creator === state.currentUser?.userId
    
    if (isCreator && roomInfo.room.participants && roomInfo.room.participants.length > 1) {
      // Creator needs to transfer admin
      showTransferAdminDialog(roomInfo.room.participants)
    } else {
      // Not creator or only member, leave directly
      if (confirm('Are you sure you want to leave this group?')) {
        const result = await api.leaveGroup(state.currentRoom)
        if (result.success) {
          await handleSuccessfulLeave()
        } else {
          alert('Failed to leave group: ' + result.error)
        }
      }
    }
  } catch (error) {
    console.error('[ROOM] Error leaving group:', error)
    alert('Error leaving group: ' + error)
  }
}

async function handleSuccessfulLeave() {
  alert('You have left the group. It has been moved to archived.')
  
  const leftRoomId = state.currentRoom
  
  // Clear current room state
  state.currentRoom = null
  
  // Reload rooms list (room will now appear in archived)
  await loadRooms()
  
  // Show welcome message
  const messagesDiv = document.getElementById('messages')
  messagesDiv.innerHTML = `
    <div class="welcome-message">
      <p>🔒 End-to-end encrypted chat</p>
      <p>Select a room to start messaging</p>
    </div>
  `
  
  // Show input bar again (was hidden for archived view)
  const inputBar = document.querySelector('.input-bar')
  if (inputBar) {
    inputBar.style.display = 'flex'
  }
  
  // Hide leave and add members buttons
  const leaveBtn = document.getElementById('leaveGroupBtn')
  if (leaveBtn) {
    leaveBtn.style.display = 'none'
  }
  
  const addMembersBtn = document.getElementById('addMembersBtn')
  if (addMembersBtn) {
    addMembersBtn.style.display = 'none'
  }
  
  const groupInfoBtn = document.getElementById('groupInfoBtn')
  if (groupInfoBtn) {
    groupInfoBtn.style.display = 'none'
  }
  
  // Update header
  document.querySelector('.chat-header h4').textContent = '# general'
}

// ==================== ADD MEMBERS ====================

async function showAddMembersDialog() {
  const dialog = document.getElementById('addMembersDialog')
  const input = document.getElementById('addMembersInput')
  input.value = ''
  dialog.style.display = 'flex'
}

function closeAddMembersDialog() {
  const dialog = document.getElementById('addMembersDialog')
  dialog.style.display = 'none'
}

async function confirmAddMembers() {
  const input = document.getElementById('addMembersInput')
  const usernamesRaw = input.value.trim()
  
  if (!usernamesRaw) {
    alert('Please enter at least one username')
    return
  }
  
  const usernames = usernamesRaw.split(',').map(u => u.trim()).filter(u => u)
  
  if (usernames.length === 0) {
    alert('Please enter valid usernames')
    return
  }
  
  if (!state.currentRoom) {
    alert('No room selected')
    return
  }
  
  try {
    const result = await api.addMembersToGroup(state.currentRoom, usernames)
    
    if (result.success) {
      alert(`Successfully added ${usernames.length} member(s) to the group`)
      closeAddMembersDialog()
    } else {
      alert('Failed to add members: ' + result.error)
    }
  } catch (error) {
    console.error('[ROOM] Error adding members:', error)
    alert('Error adding members: ' + error)
  }
}

// ==================== TRANSFER ADMIN ====================

function showTransferAdminDialog(participants) {
  const dialog = document.getElementById('transferAdminDialog')
  const select = document.getElementById('newAdminSelect')
  
  // Clear existing options
  select.innerHTML = ''
  
  // Filter out current user and populate options
  const otherMembers = participants.filter(p => p.userId !== state.currentUser?.userId)
  
  if (otherMembers.length === 0) {
    alert('You are the only member. Cannot leave.')
    return
  }
  
  otherMembers.forEach(member => {
    const option = document.createElement('option')
    option.value = member.userId
    option.textContent = member.username || member.userId
    select.appendChild(option)
  })
  
  dialog.style.display = 'flex'
}

function closeTransferAdminDialog() {
  const dialog = document.getElementById('transferAdminDialog')
  dialog.style.display = 'none'
}

async function confirmTransferAndLeave() {
  const select = document.getElementById('newAdminSelect')
  const newAdminUserId = select.value
  
  if (!newAdminUserId) {
    alert('Please select a new admin')
    return
  }
  
  if (!state.currentRoom) {
    alert('No room selected')
    return
  }
  
  try {
    // Leave with admin transfer
    const result = await api.leaveGroup(state.currentRoom, newAdminUserId)
    
    if (result.success) {
      closeTransferAdminDialog()
      await handleSuccessfulLeave()
    } else {
      alert('Failed to transfer admin and leave: ' + result.error)
    }
  } catch (error) {
    console.error('[ROOM] Error transferring admin:', error)
    alert('Error transferring admin: ' + error)
  }
}

// ==================== GROUP INFO ====================

async function showGroupInfo() {
  if (!state.currentRoom) {
    alert('No room selected')
    return
  }
  
  try {
    const roomInfo = await api.getGroupInfo(state.currentRoom)
    
    if (!roomInfo.success) {
      alert('Failed to load group info: ' + roomInfo.error)
      return
    }
    
    const room = roomInfo.room
    
    // Populate dialog
    document.getElementById('groupInfoName').textContent = room.name || 'Group'
    document.getElementById('groupInfoId').textContent = room.id
    
    // Find creator username
    const creator = room.participants.find(p => p.userId === room.creator)
    document.getElementById('groupInfoCreator').textContent = 
      creator ? `${creator.username} (${room.creator})` : room.creator
    
    // Format created date
    const createdDate = new Date(roomInfo.room.createdAt || Date.now())
    document.getElementById('groupInfoCreatedAt').textContent = createdDate.toLocaleString()
    
    // Populate members list
    document.getElementById('groupInfoMemberCount').textContent = room.participants.length
    const membersList = document.getElementById('groupInfoMembers')
    membersList.innerHTML = ''
    
    room.participants.forEach(member => {
      const li = document.createElement('li')
      const isCreator = member.userId === room.creator
      const isYou = member.userId === state.currentUser?.userId
      
      let badges = ''
      if (isCreator) badges += '<span class="creator-badge">👑 Creator</span>'
      if (isYou) badges += '<span class="you-badge">You</span>'
      
      li.innerHTML = `
        <span class="member-name">${member.username}</span>
        ${badges}
        <span class="member-id">${member.userId}</span>
      `
      membersList.appendChild(li)
    })
    
    // Show dialog
    document.getElementById('groupInfoDialog').style.display = 'flex'
    
  } catch (error) {
    console.error('[ROOM] Error showing group info:', error)
    alert('Error loading group info: ' + error)
  }
}

function closeGroupInfo() {
  document.getElementById('groupInfoDialog').style.display = 'none'
}

// ==================== UPDATE ADMIN BUTTONS ====================

async function updateAdminButtons(roomId) {
  if (!roomId) return
  
  try {
    // Get room info
    const roomInfo = await api.getGroupInfo(roomId)
    
    if (!roomInfo.success) {
      return
    }
    
    const isCreator = roomInfo.room.creator === state.currentUser?.userId
    const isGroupChat = roomInfo.room.name && !isDMRoom(roomInfo.room.name)
    
    // Show Add Members button only for group creators
    const addMembersBtn = document.getElementById('addMembersBtn')
    if (addMembersBtn) {
      addMembersBtn.style.display = (isGroupChat && isCreator) ? 'block' : 'none'
    }
  } catch (error) {
    console.error('[ROOM] Error checking admin status:', error)
  }
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
window.loadMoreMessages = loadMoreMessages
window.leaveCurrentGroup = leaveCurrentGroup
window.showAddMembersDialog = showAddMembersDialog
window.closeAddMembersDialog = closeAddMembersDialog
window.confirmAddMembers = confirmAddMembers
window.showTransferAdminDialog = showTransferAdminDialog
window.closeTransferAdminDialog = closeTransferAdminDialog
window.confirmTransferAndLeave = confirmTransferAndLeave
window.showGroupInfo = showGroupInfo
window.closeGroupInfo = closeGroupInfo
  