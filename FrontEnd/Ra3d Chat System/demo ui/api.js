/**
 * API Service for handling all HTTP requests to the chat server
 * Based on the Swagger API specification
 */

class APIService {
  constructor() {
    // Configure base URL - update this to match your server
    this.baseURL = "http://localhost:5000"; // Change to your actual API URL
    this.authToken = null;
  }

  /**
   * Set authentication token
   */
  setAuthToken(token) {
    this.authToken = token;
  }

  /**
   * Clear authentication token
   */
  clearAuthToken() {
    this.authToken = null;
  }

  /**
   * Generic request handler
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;

    const token = localStorage.getItem("authToken"); // Retrieve token from localStorage
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
      ...(token && { Authorization: `Bearer ${token}` }), // Add token if available
    };

    const config = {
      ...options,
      headers,
    };

    try {
      const response = await fetch(url, config);

      // Handle different response types
      const contentType = response.headers.get("content-type");
      let data;

      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        throw {
          status: response.status,
          statusText: response.statusText,
          data: data,
        };
      }

      return data;
    } catch (error) {
      console.error("API Request Error:", error);
      console.error("Request URL:", url);
      console.error("Request Method:", options.method || "GET");
      // Ensure error has a message property for handleError
      if (!error.message && !error.status) {
        error.message = "Network error or server unreachable";
      }
      throw error;
    }
  }

  // ===== Authentication Endpoints =====

  /**
   * Register a new user
   * POST /api/Auth/register
   */
  async register(username, password, publicKey = null) {
    const data = {
      username,
      password,
      publicKey,
    };

    return this.request("/api/Auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Login user
   * POST /api/Auth/Login
   */
  async login(username, password) {
    const data = {
      username,
      password,
    };

    const response = await this.request("/api/Auth/Login", {
      method: "POST",
      body: JSON.stringify(data),
    });

    // Store token if returned
    if (response && response.jwt) {
      this.setAuthToken(response.jwt);
      await dbService.saveAuthToken(response.jwt);
      localStorage.setItem("authToken", response.jwt);
    }

    return response;
  }

  // ===== Key Management =====

  /**
   * Get encryption key for a room
   * POST /api/keys/get
   */
  async getKey(roomId, personalUid) {
    const data = {
      roomId,
      personalUid,
    };

    return this.request("/api/keys/get", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // ===== Message Endpoints =====

  /**
   * Get messages for a room
   * GET /api/messages/{room_id}?last_message_id={uuid}
   */
  async getMessages(roomId, lastMessageId = null) {
    let endpoint = `/api/messages/${roomId}`;

    if (lastMessageId) {
      endpoint += `?last_message_id=${lastMessageId}`;
    }

    return this.request(endpoint, {
      method: "GET",
    });
  }

  /**
   * Send a message (assuming WebSocket or separate endpoint)
   * This would typically be handled via WebSocket
   */
  async sendMessage(roomId, content, senderId) {
    // This is a placeholder - actual implementation depends on server
    // Messages might be sent via WebSocket instead
    const message = {
      roomId,
      content,
      senderId,
      timestamp: new Date().toISOString(),
    };

    // Save to local DB first
    await dbService.saveMessage({
      ...message,
      id: this.generateUUID(),
      synced: false,
    });

    return message;
  }

  // ===== Room Endpoints =====

  /**
   * Get room details by ID
   * GET /api/rooms/{roomId}
   */
  async getRoomById(roomId) {
    return this.request(`/api/rooms/${roomId}`, {
      method: "GET",
    });
  }

  /**
   * Create a new room
   * POST /api/rooms/room
   */
  async createRoom(name, creator, users = [], encryptionKeys = []) {
    const data = {
      name,
      creator,
      users,
      encryptionKeys: encryptionKeys.map((k) => ({
        userId: k.userId,
        key: k.encryptedKey,
      })),
    };

    return this.request("/api/rooms/room", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Create a direct message room
   * POST /api/rooms/directMessage
   */
  async createDirectMessage(secondUser, keys = []) {
    const data = {
      secondUser,
      keys: keys.map((k) => ({
        userId: k.userId,
        key: k.encryptedKey,
      })),
    };

    return this.request("/api/rooms/directMessage", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Get all rooms for the current user
   * GET /api/rooms
   */
  async getRooms() {
    return this.request("/api/rooms", {
      method: "GET",
    });
  }

  // ===== User Endpoints =====

  /**
   * Get user by username
   * POST /api/Users
   */
  async getUserByUsername(username) {
    const data = {
      username
    };
    
    return this.request("/api/Users", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Get user by ID
   * GET /api/Users/{id}
   */
  async getUser(userId) {
    return this.request(`/api/Users/${userId}`, {
      method: "GET",
    });
  }

  /**
   * Create new user
   * POST /api/Users
   */
  async createUser(userData) {
    return this.request("/api/Users", {
      method: "POST",
      body: JSON.stringify(userData),
    });
  }

  /**
   * Update user
   * PUT /api/Users/{id}
   */
  async updateUser(userId, userData) {
    return this.request(`/api/Users/${userId}`, {
      method: "PUT",
      body: JSON.stringify(userData),
    });
  }

  /**
   * Delete user
   * DELETE /api/Users/{id}
   */
  async deleteUser(userId) {
    return this.request(`/api/Users/${userId}`, {
      method: "DELETE",
    });
  }

  // ===== Sync Methods =====

  /**
   * Sync all rooms from server
   */
  async syncRooms() {
    try {
      const rooms = await this.getRooms();
      console.log("Raw rooms from server:", rooms);
      
      if (!rooms || !Array.isArray(rooms)) {
        return [];
      }

      // Server now returns full RoomModel objects
      const mappedRooms = rooms
        .map(room => {
          // Extract ID from possible fields
          const roomId = room.id || room.Id || room.roomId;
          
          if (!roomId) {
            console.warn("Room missing ID, skipping:", room);
            return null;
          }
          
          // Extract last message from Messages collection if available
          const lastMsg = room.messages && room.messages.length > 0 
            ? room.messages[room.messages.length - 1] 
            : (room.Messages && room.Messages.length > 0 
              ? room.Messages[room.Messages.length - 1] 
              : null);
          
          // Determine if it's a group chat (more than 2 users)
          const userCount = (room.users || room.Users || []).length;
          const isGroupChat = userCount > 2;
          
          return {
            id: roomId,
            name: room.name || room.Name || `Room ${roomId.toString().substring(0, 8)}`,
            type: isGroupChat ? "group" : "dm",
            creator: room.createdBy || room.CreatedBy,
            participants: (room.users || room.Users || []).map(u => u.userId || u.UserId || u.id || u.Id),
            lastMessage: lastMsg ? (lastMsg.content || lastMsg.Content || "") : "",
            lastMessageTime: lastMsg 
              ? (lastMsg.timestamp || lastMsg.Timestamp || lastMsg.createdAt || lastMsg.CreatedAt || new Date().toISOString())
              : (room.createdAt || room.CreatedAt || new Date().toISOString()),
            unreadCount: 0, // Calculate based on user's read status if available
            createdAt: room.createdAt || room.CreatedAt || new Date().toISOString(),
          };
        })
        .filter(room => room !== null);
      
      console.log("Mapped rooms:", mappedRooms);
      
      if (mappedRooms.length > 0) {
        await dbService.saveRooms(mappedRooms);
      }
      
      return mappedRooms;
    } catch (error) {
      console.error("Error syncing rooms:", error);
      // Return cached rooms if API failsy
      return await dbService.getAllRooms();
    }
  }

  /**
   * Sync messages for a specific room
   */
  async syncMessages(roomId, lastMessageId = null) {
    try {
      const messages = await this.getMessages(roomId, lastMessageId);
      if (messages && Array.isArray(messages)) {
        // Map server response to local message structure
        const mappedMessages = messages.map(msg => ({
          id: msg.id || msg.messageId,
          roomId,
          senderId: msg.senderId || msg.userId,
          senderName: msg.senderName || msg.username || "Unknown",
          content: msg.content,
          ciphertext: msg.encText || msg.ciphertext,
          nonce: msg.nonce,
          keyVersion: msg.keyVersion || 1,
          timestamp: msg.timestamp || msg.createdAt || new Date().toISOString(),
          synced: true,
        }));
        
        await dbService.saveMessages(mappedMessages);
        return mappedMessages;
      }
      return [];
    } catch (error) {
      console.error("Error syncing messages:", error);
      // Return cached messages if API fails
      return await dbService.getMessagesByRoom(roomId);
    }
  }

  // ===== Utility Methods =====

  /**
   * Generate UUID v4
   */
  generateUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return this.authToken !== null;
  }

  /**
   * Initialize API with stored token
   */
  async initialize() {
    const token = await dbService.getAuthToken();
    if (token) {
      this.setAuthToken(token);
      return true;
    }
    return false;
  }

  /**
   * Logout - clear tokens
   */
  async logout() {
    this.clearAuthToken();
    await dbService.clearAuthToken();
    await dbService.clearAuthData();
    await dbService.clearCurrentUser();
  }

  /**
   * Handle API errors
   */
  handleError(error) {
    if (error.status === 401) {
      // Unauthorized - clear auth and redirect to login
      this.logout();
      return "Session expired. Please login again.";
    } else if (error.status === 403) {
      return "Access denied.";
    } else if (error.status === 404) {
      return "Resource not found.";
    } else if (error.status === 500) {
      return "Server error. Please try again later.";
    } else if (error.message) {
      return error.message;
    } else if (typeof error === 'string') {
      return error;
    } else {
      console.error("Unhandled error object:", error);
      return "Connection error. Is the server running at " + this.baseURL + "?";
    }
  }

  /**
   * Configure base URL
   */
  setBaseURL(url) {
    this.baseURL = url;
  }

  /**
   * Get current base URL
   */
  getBaseURL() {
    return this.baseURL;
  }
}

// Create a singleton instance
const apiService = new APIService();
