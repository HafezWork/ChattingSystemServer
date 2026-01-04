/**
 * WebSocket Manager
 * Handles real-time communication with the chat server
 */

class WebSocketManager {
  constructor() {
    this.ws = null;
    this.wsURL = "ws://localhost:8181";
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000;
    this.messageHandlers = [];
    this.reconnectHandlers = []; // Handlers called when reconnected
    this.pendingMessages = [];
    this.sentMessageIds = new Set(); // Track sent messages to prevent duplicates
  }

  /**
   * Connect to WebSocket server
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        const token = localStorage.getItem("authToken");
        if (!token) {
          reject("No authentication token available");
          return;
        }

        const wsUrl = `${this.wsURL}?access_token=${encodeURIComponent(
          token
        )}`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log("WebSocket connected successfully to", this.wsURL);
          this.connected = true;
          const wasReconnecting = this.reconnectAttempts > 0;
          this.reconnectAttempts = 0;

          // Send any pending messages
          this.flushPendingMessages();

          // Notify reconnect handlers (for syncing offline messages)
          if (wasReconnecting) {
            console.log("Reconnected - triggering sync handlers");
            this.reconnectHandlers.forEach(handler => {
              try {
                handler();
              } catch (error) {
                console.error("Error in reconnect handler:", error);
              }
            });
          }

          resolve();
        };

        this.ws.onmessage = (event) => {
          console.log("WebSocket received message:", event.data);
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          this.connected = false;
          reject(error);
        };

        this.ws.onclose = () => {
          console.log("WebSocket disconnected");
          this.connected = false;
          this.attemptReconnect();
        };

        // Set a timeout for connection
        setTimeout(() => {
          if (!this.connected) {
            reject("WebSocket connection timeout");
          }
        }, 5000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }

  /**
   * Attempt to reconnect
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    console.log(
      `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
    );

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error("Reconnection failed:", error);
      });
    }, this.reconnectDelay);
  }

  /**
   * Send a message through WebSocket
   */
  async sendMessage(roomId, ciphertext, nonce, keyVersion = 1) {
    // Create unique message ID based on content hash instead of timestamp
    const messageId = `${roomId}-${ciphertext.substring(0, 20)}-${nonce.substring(0, 20)}`;
    
    // Prevent duplicate sends
    if (this.sentMessageIds.has(messageId)) {
      console.log("Message already sent, skipping duplicate");
      return false;
    }

    const envelope = {
      Type: "send",
      SenderId: authHandler.currentUser?.userId || "00000000-0000-0000-0000-000000000000",
      RoomId: roomId,
      Ciphertext: ciphertext, // Already Base64 encoded
      Nonce: nonce, // Already Base64 encoded
      KeyVersion: keyVersion,
    };

    if (!this.connected) {
      this.pendingMessages.push({ envelope, messageId });
      console.log("WebSocket not connected, message queued");
      return false;
    }

    try {
      const payload = JSON.stringify(envelope);
      console.log("Sending WebSocket message:", payload);
      this.ws.send(payload);
      this.sentMessageIds.add(messageId);
      
      // Clear sent message ID after 30 seconds instead of 5
      setTimeout(() => this.sentMessageIds.delete(messageId), 30000);
      
      return true;
    } catch (error) {
      console.error("Error sending message:", error);
      this.pendingMessages.push({ envelope, messageId });
      return false;
    }
  }

  /**
   * Fetch messages from a room
   */
  async fetchMessages(roomId, afterMessageId = null) {
    const envelope = {
      Type: "fetch",
      RoomId: roomId,
      AfterMessageId: afterMessageId,
    };

    if (!this.connected) {
      console.error("WebSocket not connected, cannot fetch messages");
      return false;
    }

    try {
      const payload = JSON.stringify(envelope);
      console.log("Fetching messages from WebSocket:", payload);
      this.ws.send(payload);
      return true;
    } catch (error) {
      console.error("Error fetching messages:", error);
      return false;
    }
  }

  /**
   * Handle incoming messages from server
   */
  handleMessage(data) {
    try {
      const envelope = JSON.parse(data);

      // Notify all handlers
      this.messageHandlers.forEach((handler) => {
        try {
          handler(envelope);
        } catch (error) {
          console.error("Error in message handler:", error);
        }
      });
    } catch (error) {
      console.error("Error parsing WebSocket message:", error);
    }
  }

  /**
   * Add a message handler
   */
  addMessageHandler(callback) {
    this.messageHandlers.push(callback);
  }

  /**
   * Add a reconnect handler (called when reconnected after disconnect)
   */
  addReconnectHandler(callback) {
    this.reconnectHandlers.push(callback);
  }

  /**
   * Remove a message handler
   */
  removeMessageHandler(callback) {
    this.messageHandlers = this.messageHandlers.filter(
      (handler) => handler !== callback
    );
  }

  /**
   * Flush pending messages
   */
  flushPendingMessages() {
    while (this.pendingMessages.length > 0 && this.connected) {
      const { envelope, messageId } = this.pendingMessages.shift();
      
      if (this.sentMessageIds.has(messageId)) {
        continue; // Skip if already sent
      }
      
      try {
        this.ws.send(JSON.stringify(envelope));
        this.sentMessageIds.add(messageId);
        setTimeout(() => this.sentMessageIds.delete(messageId), 5000);
      } catch (error) {
        console.error("Error sending pending message:", error);
        this.pendingMessages.unshift({ envelope, messageId });
        break;
      }
    }
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connected && this.ws !== null;
  }

  /**
   * Set WebSocket server URL
   */
  setURL(url) {
    this.wsURL = url;
  }
}

// Create singleton instance
const wsManager = new WebSocketManager();
