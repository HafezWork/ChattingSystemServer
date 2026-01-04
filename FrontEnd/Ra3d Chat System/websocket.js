const WebSocket = require("ws")
const { ipcMain } = require("electron")

/**
 * WebSocket Manager for Electron (ported from demo UI)
 * Handles real-time communication with the chat server
 */
class WebSocketManager {
  constructor() {
    this.ws = null
    this.wsURL = "ws://localhost:8181"
    this.connected = false
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectDelay = 3000
    this.messageHandlers = []
    this.pendingMessages = []
    this.sentMessageIds = new Set()
    this.currentJWT = null
  }

  /**
   * Connect to WebSocket server
   */
  async connect(jwt) {
    return new Promise((resolve, reject) => {
      try {
        if (!jwt) {
          reject("No authentication token available")
          return
        }

        this.currentJWT = jwt
        const wsUrl = `${this.wsURL}?access_token=${encodeURIComponent(jwt)}`
        
        this.ws = new WebSocket(wsUrl)

        this.ws.on("open", () => {
          console.log("[WS] Connected successfully to", this.wsURL)
          this.connected = true
          const wasReconnecting = this.reconnectAttempts > 0
          this.reconnectAttempts = 0

          // Send any pending messages
          this.flushPendingMessages()

          // Notify reconnect handlers
          if (wasReconnecting) {
            console.log("[WS] Reconnected - triggering sync handlers")
            this.emit("reconnected")
          }

          resolve()
        })

        this.ws.on("message", (data) => {
          console.log("[WS] Received message:", data.toString())
          this.handleMessage(data.toString())
        })

        this.ws.on("error", (error) => {
          console.error("[WS] Error:", error)
          this.connected = false
          reject(error)
        })

        this.ws.on("close", () => {
          console.log("[WS] Disconnected")
          this.connected = false
          this.attemptReconnect()
        })

        // Connection timeout
        setTimeout(() => {
          if (!this.connected) {
            reject("WebSocket connection timeout")
          }
        }, 5000)
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
      this.connected = false
      this.currentJWT = null
    }
  }

  /**
   * Attempt to reconnect
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[WS] Max reconnection attempts reached")
      return
    }

    if (!this.currentJWT) {
      console.log("[WS] No JWT available, skipping reconnect")
      return
    }

    this.reconnectAttempts++
    console.log(
      `[WS] Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
    )

    setTimeout(() => {
      this.connect(this.currentJWT).catch((error) => {
        console.error("[WS] Reconnection failed:", error)
      })
    }, this.reconnectDelay)
  }

  /**
   * Send a message through WebSocket
   */
  async sendMessage(roomId, ciphertext, nonce, senderId, keyVersion = 1) {
    // Create unique message ID based on content hash
    const messageId = `${roomId}-${ciphertext.substring(0, 20)}-${nonce.substring(0, 20)}`

    // Prevent duplicate sends
    if (this.sentMessageIds.has(messageId)) {
      console.log("[WS] Message already sent, skipping duplicate")
      return false
    }

    const envelope = {
      Type: "send",
      SenderId: senderId,
      RoomId: roomId,
      Ciphertext: ciphertext,
      Nonce: nonce,
      KeyVersion: keyVersion
    }

    if (!this.connected) {
      this.pendingMessages.push({ envelope, messageId })
      console.log("[WS] Not connected, message queued")
      return false
    }

    try {
      const payload = JSON.stringify(envelope)
      console.log("[WS] Sending message:", payload)
      this.ws.send(payload)
      this.sentMessageIds.add(messageId)

      // Clear sent message ID after 30 seconds
      setTimeout(() => this.sentMessageIds.delete(messageId), 30000)

      return true
    } catch (error) {
      console.error("[WS] Error sending message:", error)
      this.pendingMessages.push({ envelope, messageId })
      return false
    }
  }

  /**
   * Fetch messages from a room
   */
  async fetchMessages(roomId, afterMessageId = null) {
    const envelope = {
      Type: "fetch",
      RoomId: roomId,
      AfterMessageId: afterMessageId
    }

    if (!this.connected) {
      console.error("[WS] Not connected, cannot fetch messages")
      return false
    }

    try {
      const payload = JSON.stringify(envelope)
      console.log("[WS] Fetching messages:", payload)
      this.ws.send(payload)
      return true
    } catch (error) {
      console.error("[WS] Error fetching messages:", error)
      return false
    }
  }

  /**
   * Handle incoming messages from server
   */
  handleMessage(data) {
    try {
      const envelope = JSON.parse(data)

      // Emit to all registered handlers
      this.emit("message", envelope)
    } catch (error) {
      console.error("[WS] Error parsing message:", error)
    }
  }

  /**
   * Flush pending messages when reconnected
   */
  flushPendingMessages() {
    if (this.pendingMessages.length === 0) return

    console.log(`[WS] Sending ${this.pendingMessages.length} pending messages`)

    const messages = [...this.pendingMessages]
    this.pendingMessages = []

    messages.forEach(({ envelope, messageId }) => {
      if (!this.sentMessageIds.has(messageId)) {
        try {
          this.ws.send(JSON.stringify(envelope))
          this.sentMessageIds.add(messageId)
          setTimeout(() => this.sentMessageIds.delete(messageId), 30000)
        } catch (error) {
          console.error("[WS] Error sending pending message:", error)
          this.pendingMessages.push({ envelope, messageId })
        }
      }
    })
  }

  /**
   * Register a message handler
   */
  on(event, handler) {
    if (!this.messageHandlers[event]) {
      this.messageHandlers[event] = []
    }
    this.messageHandlers[event].push(handler)
  }

  /**
   * Emit event to registered handlers
   */
  emit(event, data) {
    if (this.messageHandlers[event]) {
      this.messageHandlers[event].forEach(handler => {
        try {
          handler(data)
        } catch (error) {
          console.error(`[WS] Error in ${event} handler:`, error)
        }
      })
    }
  }
}

// Create singleton instance
const wsManager = new WebSocketManager()

// Setup IPC handlers for renderer process
function setupWebSocketIPC() {
  ipcMain.handle("ws:connect", async (_, jwt) => {
    try {
      await wsManager.connect(jwt)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("ws:disconnect", async () => {
    wsManager.disconnect()
    return { success: true }
  })

  ipcMain.handle("ws:sendMessage", async (_, roomId, ciphertext, nonce, senderId, keyVersion) => {
    const success = await wsManager.sendMessage(roomId, ciphertext, nonce, senderId, keyVersion)
    return { success }
  })

  ipcMain.handle("ws:fetchMessages", async (_, roomId, afterMessageId) => {
    const success = await wsManager.fetchMessages(roomId, afterMessageId)
    return { success }
  })

  // Forward WebSocket messages to renderer
  wsManager.on("message", (envelope) => {
    const windows = require("electron").BrowserWindow.getAllWindows()
    windows.forEach(win => {
      win.webContents.send("ws:message", envelope)
    })
  })

  wsManager.on("reconnected", () => {
    const windows = require("electron").BrowserWindow.getAllWindows()
    windows.forEach(win => {
      win.webContents.send("ws:reconnected")
    })
  })
}

module.exports = { wsManager, setupWebSocketIPC }
