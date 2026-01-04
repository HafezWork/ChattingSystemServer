/**
 * Chat Manager
 * Handles chat functionality, messages, rooms, and real-time updates
 */

class ChatManager {
  constructor() {
    this.currentRoomId = null;
    this.rooms = [];
    this.messages = {};
    this.pollingInterval = null;
    this.pollingDelay = 5000;
    this.messageListeners = [];
    this.processedMessageIds = new Set(); // Track processed messages
  }

  /**
   * Initialize chat manager
   */
  async init() {
    try {
      console.log("Chat manager init: Loading rooms from DB...");
      this.rooms = await dbService.getAllRooms();
      console.log("Loaded rooms from DB:", this.rooms.length);
      
      console.log("Chat manager init: Initializing API service...");
      await apiService.initialize();
      
      console.log("Chat manager init: Loading encryption keys...");
      await cryptoService.loadKeysFromStorage();

      // Load room keys from storage
      console.log("Chat manager init: Loading room keys...");
      for (const room of this.rooms) {
        await cryptoService.loadRoomKeyFromStorage(room.id);
      }

      // Connect to WebSocket
      console.log("Chat manager init: Connecting to WebSocket...");
      try {
        await wsManager.connect();
        wsManager.addMessageHandler((envelope) =>
          this.handleWebSocketMessage(envelope)
        );
        
        // Add reconnect handler to sync offline messages
        wsManager.addReconnectHandler(() => {
          console.log("Reconnected - syncing offline messages");
          this.syncOfflineMessages();
        });
        
        console.log("WebSocket connected successfully");
      } catch (error) {
        console.warn("WebSocket connection failed, using polling fallback:", error);
      }

      console.log("Chat manager init: Syncing rooms from server...");
      await this.syncRooms();
      
      // Sync any messages that were sent while offline
      console.log("Chat manager init: Syncing offline messages...");
      await this.syncOfflineMessages();
      
      console.log("Chat manager initialized successfully");
    } catch (error) {
      console.error("Error in chat manager init:", error);
      throw error;
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleWebSocketMessage(envelope) {
    console.log("handleWebSocketMessage received envelope:", envelope);
    
    if (envelope.Type === "send_message" || envelope.Type === "send") {
      // Create unique message identifier using ciphertext hash
      const messageHash = `${envelope.RoomId}-${envelope.Ciphertext.substring(0, 30)}-${envelope.Nonce.substring(0, 30)}`;
      
      // Prevent duplicate processing
      if (this.processedMessageIds.has(messageHash)) {
        console.log("Message already processed, skipping duplicate");
        return;
      }
      
      this.processedMessageIds.add(messageHash);
      
      // Clean up old message hashes after 5 minutes
      setTimeout(() => this.processedMessageIds.delete(messageHash), 300000);

      const message = {
        roomId: envelope.RoomId,
        ciphertext: envelope.Ciphertext,
        nonce: envelope.Nonce,
        keyVersion: envelope.KeyVersion || 1,
        senderId: envelope.SenderId || envelope.UserId || null,
        senderName: envelope.SenderName || envelope.Username || "Unknown",
        timestamp: envelope.Timestamp || new Date().toISOString(),
        synced: true,
      };
      
      console.log("Created message object with senderId:", message.senderId);

      this.processIncomingMessage(message);
    }
  }

  /**
   * Process incoming encrypted message
   */
  async processIncomingMessage(message) {
    try {
      let roomKey = cryptoService.getRoomKey(message.roomId);
      
      if (!roomKey) {
        // Try to load from storage
        roomKey = await cryptoService.loadRoomKeyFromStorage(message.roomId);
      }
      
      if (!roomKey) {
        // Try to fetch from server
        console.log("Fetching room key from server for room:", message.roomId);
        const keyData = await apiService.getKey(
          message.roomId,
          authHandler.getUserId()
        );
        
        if (keyData && keyData.personalShared) {
          // Decrypt the room key with private key
          const encryptedKeyBytes = cryptoService.base64ToArrayBuffer(
            keyData.personalShared
          );
          const decryptedKeyBytes = await cryptoService.decryptWithPrivateKey(encryptedKeyBytes);
          roomKey = await cryptoService.importSymmetricKey(decryptedKeyBytes);
          cryptoService.setRoomKey(message.roomId, roomKey);
          await cryptoService.saveRoomKeyToStorage(message.roomId, roomKey);
        } else {
          throw new Error("No encryption key available");
        }
      }
      
      const ciphertextBytes = cryptoService.base64ToArrayBuffer(message.ciphertext);
      const nonceBytes = cryptoService.base64ToArrayBuffer(message.nonce);

      const decryptedContent = await cryptoService.decryptMessage(
        ciphertextBytes,
        nonceBytes,
        roomKey
      );

      message.content = decryptedContent;
      message.decrypted = true;
    } catch (error) {
      console.error("Error decrypting message:", error);
      message.content = "[Unable to decrypt]";
      message.decrypted = false;
    }

    // Save message to DB
    const savedMessage = await dbService.saveMessage(message);

    // Update local messages
    if (!this.messages[message.roomId]) {
      this.messages[message.roomId] = [];
    }
    
    // Check if message already exists (by ciphertext + nonce)
    const exists = this.messages[message.roomId].some(
      m => m.ciphertext === message.ciphertext && m.nonce === message.nonce
    );
    
    if (!exists) {
      this.messages[message.roomId].push(savedMessage || message);
    }

    // Update room last message
    await dbService.updateRoomLastMessage(
      message.roomId,
      message.content || "[Encrypted]",
      message.timestamp
    );

    // Notify listeners
    this.notifyMessageListeners(savedMessage || message);
  }

  /**
   * Sync rooms from server
   */
  async syncRooms() {
    try {
      const serverRooms = await apiService.syncRooms();
      this.rooms = serverRooms;
      return serverRooms;
    } catch (error) {
      console.error("Error syncing rooms:", error);
      this.rooms = await dbService.getAllRooms();
      return this.rooms;
    }
  }

  /**
   * Sync offline messages (called when reconnected)
   */
  async syncOfflineMessages() {
    console.log("Syncing offline messages for all rooms...");
    
    for (const room of this.rooms) {
      try {
        // Get the last message for this room from DB
        const messages = await dbService.getMessagesByRoom(room.id);
        const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
        
        // Validate UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
        const isValidUUID = lastMessage?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lastMessage.id);
        const lastMessageId = isValidUUID ? lastMessage.id : null;
        
        // Use syncMessages which fetches, maps, and saves to DB automatically
        const newMessages = await apiService.syncMessages(room.id, lastMessageId);
        
        if (newMessages && newMessages.length > 0) {
          console.log(`Synced ${newMessages.length} offline messages for room ${room.id}`);
          
          // Decrypt each message and notify listeners
          for (const msg of newMessages) {
            // Message is already saved to DB by syncMessages, just decrypt and notify
            const roomKey = await cryptoService.getRoomKey(room.id);
            
            if (roomKey && msg.ciphertext && msg.nonce) {
              try {
                const decryptedContent = await cryptoService.decryptMessage(
                  msg.ciphertext,
                  msg.nonce,
                  roomKey
                );
                
                // Update the message in DB with decrypted content
                await dbService.updateMessage(msg.id || msg.roomId + msg.timestamp, {
                  ...msg,
                  content: decryptedContent,
                });
                
                // Notify listeners
                this.notifyMessageListeners({
                  ...msg,
                  content: decryptedContent,
                });
              } catch (decryptError) {
                console.error("Error decrypting offline message:", decryptError);
              }
            }
          }
        } else {
          console.log(`No offline messages for room ${room.id}`);
        }
      } catch (error) {
        console.error(`Error syncing offline messages for room ${room.id}:`, error);
      }
    }
  }

  /**
   * Get all rooms
   */
  getRooms() {
    return this.rooms;
  }

  /**
   * Get room by ID
   */
  async getRoom(roomId) {
    let room = this.rooms.find((r) => r.id === roomId);
    if (!room) {
      room = await dbService.getRoom(roomId);
    }
    return room;
  }

  /**
   * Create a new direct message room
   */
  async createDirectMessage(secondUsername) {
    try {
      // Look up user by username
      const recipientUser = await apiService.getUserByUsername(secondUsername);
      if (!recipientUser || !recipientUser.userId) {
        throw new Error("User not found");
      }

      if (!recipientUser.publicKey) {
        throw new Error("Recipient has no public key");
      }

      // Generate symmetric key for this room
      const roomKey = await cryptoService.generateRoomKey();
      const roomKeyBytes = await cryptoService.exportSymmetricKey(roomKey);

      // Import recipient's public key
      const recipientPublicKey = await cryptoService.importPublicKey(
        recipientUser.publicKey
      );

      // Encrypt room key for current user
      const encryptedKeyForSelf = await cryptoService.encryptWithPublicKey(
        roomKeyBytes,
        cryptoService.keyPair.publicKey
      );

      // Encrypt room key for recipient
      const encryptedKeyForRecipient = await cryptoService.encryptWithPublicKey(
        roomKeyBytes,
        recipientPublicKey
      );

      // Prepare keys array for server
      const Keys = [
        {
          userId: authHandler.getUserId(),
          encryptedKey: cryptoService.arrayBufferToBase64(encryptedKeyForSelf),
        },
        {
          userId: recipientUser.userId,
          encryptedKey: cryptoService.arrayBufferToBase64(
            encryptedKeyForRecipient
          ),
        },
      ];

      const response = await apiService.createDirectMessage(secondUsername, Keys);

      // Extract room ID - handle different response formats
      const roomId = response.dmId || response.roomId || response.id;
      
      if (!roomId) {
        throw new Error("No room ID returned from server");
      }

      // Store room key
      cryptoService.setRoomKey(roomId, roomKey);
      await cryptoService.saveRoomKeyToStorage(roomId, roomKey);

      const room = {
        id: roomId,
        name: response.name || `DM with ${recipientUser.userName || secondUsername}`,
        type: "dm",
        participants: response.participants || [authHandler.getUserId(), recipientUser.userId],
        lastMessageTime: new Date().toISOString(),
        unreadCount: 0,
      };

      await dbService.saveRoom(room);
      this.rooms.unshift(room);

      return { success: true, room };
    } catch (error) {
      console.error("Error creating DM:", error);
      return {
        success: false,
        error: error.message || apiService.handleError(error),
      };
    }
  }

  /**
   * Create a new group room
   */
  async createGroupRoom(name, usernames = []) {
    try {
      const creatorId = authHandler.getUserId();

      // Resolve all usernames to user objects
      const users = [];
      for (const username of usernames) {
        try {
          const user = await apiService.getUserByUsername(username);
          if (user && user.userId) {
            users.push(user);
          } else {
            console.warn(`User ${username} not found, skipping`);
          }
        } catch (error) {
          console.warn(`Error looking up user ${username}:`, error);
        }
      }

      if (users.length === 0) {
        throw new Error("No valid users found");
      }

      // Generate symmetric key for this room
      const roomKey = await cryptoService.generateRoomKey();
      const roomKeyBytes = await cryptoService.exportSymmetricKey(roomKey);

      // Encrypt room key for all participants
      const keys = [];

      // Encrypt for creator
      const encryptedKeyForSelf = await cryptoService.encryptWithPublicKey(
        roomKeyBytes,
        cryptoService.keyPair.publicKey
      );
      keys.push({
        userId: creatorId,
        encryptedKey: cryptoService.arrayBufferToBase64(encryptedKeyForSelf),
      });

      // Encrypt for each participant
      for (const user of users) {
        try {
          if (!user.publicKey) {
            console.warn(`User ${user.userName} has no public key, skipping`);
            continue;
          }

          const participantPublicKey = await cryptoService.importPublicKey(
            user.publicKey
          );
          const encryptedKeyForParticipant =
            await cryptoService.encryptWithPublicKey(
              roomKeyBytes,
              participantPublicKey
            );

          keys.push({
            userId: user.userId,
            encryptedKey: cryptoService.arrayBufferToBase64(
              encryptedKeyForParticipant
            ),
          });
        } catch (error) {
          console.error(`Error encrypting key for user ${user.userName}:`, error);
        }
      }

      const userIds = users.map(u => u.userId);
      const response = await apiService.createRoom(name, creatorId, userIds, keys);

      const roomId = response.roomId || response.id;

      // Store room key
      cryptoService.setRoomKey(roomId, roomKey);
      await cryptoService.saveRoomKeyToStorage(roomId, roomKey);

      const room = {
        id: roomId,
        name: response.name || name,
        type: "group",
        creator: creatorId,
        participants: response.participants || [creatorId, ...userIds],
        lastMessageTime: new Date().toISOString(),
        unreadCount: 0,
      };
      console.log("aaaaaaa", room)
      await dbService.saveRoom(room);
      this.rooms.unshift(room);

      return { success: true, room };
    } catch (error) {
      console.error("Error creating group:", error);
      return {
        success: false,
        error: error.message || apiService.handleError(error),
      };
    }
  }

  /**
   * Select a room and load messages
   */
  async selectRoom(roomId) {
    this.currentRoomId = roomId;
    await dbService.clearUnreadCount(roomId);

    // Fetch messages from server via WebSocket
    const messages = await this.loadMessages(roomId);

    // Start polling for room updates
    this.startPolling();

    return messages;
  }

  /**
   * Load messages for a room
   */
  async loadMessages(roomId) {
    try {
      let messages = await dbService.getMessagesByRoom(roomId);
      console.log(messages)
      // Request messages from server via WebSocket
      if (wsManager.isConnected()) {
        const lastMessage =
          messages.length > 0 ? messages[messages.length - 1] : null;
        // Don't use local ID - server will send all messages
        wsManager.fetchMessages(roomId, null);
      }

      this.messages[roomId] = messages;
      return messages;
    } catch (error) {
      console.error("Error loading messages:", error);
      const cachedMessages = await dbService.getMessagesByRoom(roomId);
      this.messages[roomId] = cachedMessages;
      return cachedMessages;
    }
  }

  /**
   * Send a message with encryption
   */
  async sendMessage(content) {
    if (!this.currentRoomId) {
      return { success: false, error: "No room selected" };
    }

    try {
      let roomKey = cryptoService.getRoomKey(this.currentRoomId);
      
      if (!roomKey) {
        roomKey = await cryptoService.loadRoomKeyFromStorage(this.currentRoomId);
      }
      
      if (!roomKey) {
        const keyData = await apiService.getKey(
          this.currentRoomId,
          authHandler.getUserId()
        );
        
        if (keyData && keyData.personalShared) {
          const encryptedKeyBytes = cryptoService.base64ToArrayBuffer(
            keyData.personalShared
          );
          const decryptedKeyBytes = await cryptoService.decryptWithPrivateKey(encryptedKeyBytes);
          roomKey = await cryptoService.importSymmetricKey(decryptedKeyBytes);
          cryptoService.setRoomKey(this.currentRoomId, roomKey);
          await cryptoService.saveRoomKeyToStorage(this.currentRoomId, roomKey);
        } else {
          throw new Error("No encryption key available for this room");
        }
      }

      // Encrypt message
      const { ciphertext, nonce } = await cryptoService.encryptMessage(
        content,
        roomKey
      );

      const ciphertextBase64 = cryptoService.arrayBufferToBase64(ciphertext);
      const nonceBase64 = cryptoService.arrayBufferToBase64(nonce);

      // Send via WebSocket
      const sent = await wsManager.sendMessage(
        this.currentRoomId,
        ciphertextBase64,
        nonceBase64,
        1
      );

      if (!sent) {
        return {
          success: false,
          error: "Failed to send message via WebSocket",
        };
      }

      return { success: true };
    } catch (error) {
      console.error("Error sending message:", error);
      return {
        success: false,
        error: "Failed to send message: " + error.message,
      };
    }
  }

  /**
   * Get messages for current room
   */
  getCurrentMessages() {
    if (!this.currentRoomId) return [];
    return this.messages[this.currentRoomId] || [];
  }

  /**
   * Start polling for room updates
   */
  startPolling() {
    this.stopPolling();
    this.pollingInterval = setInterval(async () => {
      if (this.currentRoomId) {
        await this.pollRoomUpdates();
      }
    }, this.pollingDelay);
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Poll for room updates (new rooms, unread counts)
   */
  async pollRoomUpdates() {
    try {
      await this.syncRooms();
    } catch (error) {
      console.error("Error polling room updates:", error);
    }
  }

  /**
   * Search rooms
   */
  searchRooms(query) {
    if (!query) return this.rooms;
    const lowerQuery = query.toLowerCase();
    return this.rooms.filter(
      (room) =>
        room.name?.toLowerCase().includes(lowerQuery) ||
        room.lastMessage?.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Add message listener
   */
  addMessageListener(callback) {
    this.messageListeners.push(callback);
  }

  /**
   * Remove message listener
   */
  removeMessageListener(callback) {
    this.messageListeners = this.messageListeners.filter(
      (listener) => listener !== callback
    );
  }

  /**
   * Notify message listeners
   */
  notifyMessageListeners(message) {
    this.messageListeners.forEach((listener) => {
      try {
        listener(message);
      } catch (error) {
        console.error("Error in message listener:", error);
      }
    });
  }

  /**
   * Clear current room
   */
  clearCurrentRoom() {
    this.currentRoomId = null;
    this.stopPolling();
  }

  /**
   * Get current room ID
   */
  getCurrentRoomId() {
    return this.currentRoomId;
  }

  /**
   * Cleanup
   */
  cleanup() {
    this.stopPolling();
    this.messageListeners = [];
    wsManager.disconnect();
  }
}

// Create singleton instance
const chatManager = new ChatManager();
