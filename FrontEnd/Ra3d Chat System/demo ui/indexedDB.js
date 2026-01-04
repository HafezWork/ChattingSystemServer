/**
 * IndexedDB Service for local storage management
 * Stores user data, messages, rooms, and app settings
 */

class IndexedDBService {
  constructor() {
    this.dbName = "ChatAppDB";
    this.dbVersion = 1;
    this.db = null;
    this.initPromise = null; // Prevent multiple init calls
  }

  /**
   * Initialize the database
   */
  async init() {
    // Return existing promise if already initializing
    if (this.initPromise) {
      console.log("DB init: Already initializing, waiting...");
      return this.initPromise;
    }

    // Return immediately if already initialized
    if (this.db) {
      console.log("DB init: Already initialized");
      return Promise.resolve(this.db);
    }

    console.log("DB init: Starting initialization...");
    
    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error("Failed to open database:", request.error);
        this.initPromise = null;
        reject("Failed to open database");
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log("IndexedDB initialized successfully");
        
        // Handle database close/error events
        this.db.onclose = () => {
          console.warn("Database connection closed");
          this.db = null;
          this.initPromise = null;
        };
        
        this.db.onerror = (event) => {
          console.error("Database error:", event.target.error);
        };
        
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        console.log("DB init: Upgrading database schema...");
        const db = event.target.result;

        // User store
        if (!db.objectStoreNames.contains("users")) {
          const userStore = db.createObjectStore("users", { keyPath: "id" });
          userStore.createIndex("username", "username", { unique: false });
          console.log("Created users store");
        }

        // Messages store
        if (!db.objectStoreNames.contains("messages")) {
          const messageStore = db.createObjectStore("messages", {
            keyPath: "id",
            autoIncrement: true,
          });
          messageStore.createIndex("roomId", "roomId", { unique: false });
          messageStore.createIndex("timestamp", "timestamp", { unique: false });
          console.log("Created messages store");
        }

        // Rooms store
        if (!db.objectStoreNames.contains("rooms")) {
          const roomStore = db.createObjectStore("rooms", { keyPath: "id" });
          roomStore.createIndex("lastMessageTime", "lastMessageTime", {
            unique: false,
          });
          console.log("Created rooms store");
        }

        // Settings store
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
          console.log("Created settings store");
        }

        // Auth tokens store
        if (!db.objectStoreNames.contains("auth")) {
          db.createObjectStore("auth", { keyPath: "key" });
          console.log("Created auth store");
        }

        console.log("Database schema created/updated");
      };
    });

    return this.initPromise;
  }

  /**
   * Generic method to add/update data
   */
  async put(storeName, data) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generic method to get data by key
   */
  async get(storeName, key) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generic method to get all data from a store
   */
  async getAll(storeName) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generic method to delete data
   */
  async delete(storeName, key) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all data from a store
   */
  async clear(storeName) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get data by index
   */
  async getByIndex(storeName, indexName, value) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], "readonly");
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ===== User Management =====

  async saveCurrentUser(userData) {
    try {
      return await this.put("users", {
        id: "currentUser",
        ...userData,
        lastLogin: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error saving current user:", error);
      throw error;
    }
  }

  async getCurrentUser() {
    try {
      return await this.get("users", "currentUser");
    } catch (error) {
      console.error("Error getting current user:", error);
      return null;
    }
  }

  async clearCurrentUser() {
    return this.delete("users", "currentUser");
  }

  // ===== Message Management =====

  async saveMessage(message) {
    const messageData = {
      ...message,
      timestamp: message.timestamp || new Date().toISOString(),
      synced: message.synced || false,
    };
    
    // Remove id if it doesn't exist to let autoIncrement work
    if (!messageData.id) {
      delete messageData.id;
    }
    
    const id = await this.put("messages", messageData);
    return { ...messageData, id };
  }

  async saveMessages(messages) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["messages"], "readwrite");
      const store = transaction.objectStore("messages");
      const savedMessages = [];

      messages.forEach((message) => {
        const messageData = {
          ...message,
          timestamp: message.timestamp || new Date().toISOString(),
          synced: true,
        };
        
        // Remove id if it doesn't exist
        if (!messageData.id) {
          delete messageData.id;
        }
        
        const request = store.put(messageData);
        request.onsuccess = () => {
          savedMessages.push({ ...messageData, id: request.result });
        };
      });

      transaction.oncomplete = () => resolve(savedMessages);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getMessagesByRoom(roomId) {
    const messages = await this.getByIndex("messages", "roomId", roomId);
    return messages.sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );
  }

  async clearMessagesByRoom(roomId) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["messages"], "readwrite");
      const store = transaction.objectStore("messages");
      const index = store.index("roomId");
      const request = index.openCursor(IDBKeyRange.only(roomId));

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  // ===== Room Management =====

  async saveRoom(room) {
    const roomData = {
      ...room,
      lastMessageTime: room.lastMessageTime || new Date().toISOString(),
      unreadCount: room.unreadCount || 0,
    };
    return this.put("rooms", roomData);
  }

  async saveRooms(rooms) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["rooms"], "readwrite");
      const store = transaction.objectStore("rooms");

      rooms.forEach((room) => {
        store.put({
          ...room,
          lastMessageTime: room.lastMessageTime || new Date().toISOString(),
          unreadCount: room.unreadCount || 0,
        });
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getRoom(roomId) {
    return this.get("rooms", roomId);
  }

  async getAllRooms() {
    const rooms = await this.getAll("rooms");
    return rooms.sort(
      (a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime)
    );
  }

  async updateRoomLastMessage(roomId, messageText, timestamp) {
    const room = await this.getRoom(roomId);
    if (room) {
      room.lastMessage = messageText;
      room.lastMessageTime = timestamp || new Date().toISOString();
      await this.saveRoom(room);
    }
  }

  async incrementUnreadCount(roomId) {
    const room = await this.getRoom(roomId);
    if (room) {
      room.unreadCount = (room.unreadCount || 0) + 1;
      await this.saveRoom(room);
    }
  }

  async clearUnreadCount(roomId) {
    const room = await this.getRoom(roomId);
    if (room) {
      room.unreadCount = 0;
      await this.saveRoom(room);
    }
  }

  // ===== Settings Management =====

  async saveSetting(key, value) {
    return this.put("settings", { key, value });
  }

  async getSetting(key, defaultValue = null) {
    const setting = await this.get("settings", key);
    return setting ? setting.value : defaultValue;
  }

  async getTheme() {
    return this.getSetting("theme", "light");
  }

  async saveTheme(theme) {
    return this.saveSetting("theme", theme);
  }

  // ===== Auth Management =====

  async saveAuthToken(token) {
    try {
      await this.put("auth", { key: "token", value: token, timestamp: Date.now() });
      return true;
    } catch (error) {
      console.error("Error saving auth token:", error);
      throw error;
    }
  }

  async getAuthToken() {
    try {
      const auth = await this.get("auth", "token");
      return auth ? auth.value : null;
    } catch (error) {
      console.error("Error getting auth token:", error);
      return null;
    }
  }

  async clearAuthToken() {
    return this.delete("auth", "token");
  }

  async saveAuthData(data) {
    return this.put("auth", { key: "authData", value: data });
  }

  async getAuthData() {
    const auth = await this.get("auth", "authData");
    return auth ? auth.value : null;
  }

  async clearAuthData() {
    return this.delete("auth", "authData");
  }

  // ===== Utility Methods =====

  async clearAllData() {
    await this.clear("messages");
    await this.clear("rooms");
    await this.clear("users");
    await this.clear("auth");
    console.log("All data cleared from IndexedDB");
  }

  async exportData() {
    const data = {
      messages: await this.getAll("messages"),
      rooms: await this.getAll("rooms"),
      users: await this.getAll("users"),
      settings: await this.getAll("settings"),
    };
    return data;
  }

  async importData(data) {
    if (data.messages) await this.saveMessages(data.messages);
    if (data.rooms) await this.saveRooms(data.rooms);
    if (data.users) {
      for (const user of data.users) {
        await this.put("users", user);
      }
    }
    if (data.settings) {
      for (const setting of data.settings) {
        await this.put("settings", setting);
      }
    }
    console.log("Data imported successfully");
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
      console.log("Database connection closed");
    }
  }

  /**
   * Reset database (useful for logout/cleanup)
   */
  async reset() {
    this.close();
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.dbName);
      
      request.onsuccess = () => {
        console.log("Database deleted successfully");
        resolve();
      };
      
      request.onerror = () => {
        console.error("Error deleting database:", request.error);
        reject(request.error);
      };
      
      request.onblocked = () => {
        console.warn("Database deletion blocked");
      };
    });
  }
}

// Create a singleton instance
const dbService = new IndexedDBService();

// Initialize on load
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    dbService.init().catch(error => {
      console.error("Failed to initialize database on load:", error);
    });
  });
}
