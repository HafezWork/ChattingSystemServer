const { app, BrowserWindow, ipcMain, dialog } = require("electron")
const path = require("path")
const crypto = require("crypto")
const db = require("./db")
const generateRoomKey = require("./crypto/roomKey")
const encryptRoomKey = require("./crypto/encryptForUser")
const { setupWebSocketIPC } = require("./websocket")

const fetch = (...args) =>
  import("node-fetch").then(m => m.default(...args))

// Configuration
const BACKEND_URL = "http://localhost:5000/api"

// In-memory storage for current user's keypair (never persisted to disk)
let currentUserKeyPair = null
let currentUserUid = null
let currentJWT = null

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#0b0f14",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true
    }
  })

  win.loadFile("index.html")
}

/* ================= WINDOW CONTROLS ================= */

ipcMain.on("win:min", e =>
  BrowserWindow.fromWebContents(e.sender).minimize()
)

ipcMain.on("win:max", e => {
  const w = BrowserWindow.fromWebContents(e.sender)
  w.isMaximized() ? w.unmaximize() : w.maximize()
})

ipcMain.on("win:close", e =>
  BrowserWindow.fromWebContents(e.sender).close()
)

/* ================= FILE DIALOGS ================= */

// Save private key file after registration
ipcMain.handle("file:savePrivateKey", async (_, privateKeyPEM, username) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: "Save Private Key",
    defaultPath: `${username}_private_key.pem`,
    filters: [
      { name: "PEM Files", extensions: ["pem"] },
      { name: "All Files", extensions: ["*"] }
    ]
  })

  if (canceled || !filePath) {
    return { success: false, canceled: true }
  }

  const fs = require("fs").promises
  try {
    await fs.writeFile(filePath, privateKeyPEM, "utf8")
    return { success: true, filePath }
  } catch (error) {
    console.error("[FILE] Error saving private key:", error)
    return { success: false, error: error.message }
  }
})

// Open private key file for login
ipcMain.handle("file:openPrivateKey", async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    title: "Select Private Key File",
    filters: [
      { name: "PEM Files", extensions: ["pem"] },
      { name: "All Files", extensions: ["*"] }
    ],
    properties: ["openFile"]
  })

  if (canceled || filePaths.length === 0) {
    return { success: false, canceled: true }
  }

  const fs = require("fs").promises
  try {
    const privateKeyPEM = await fs.readFile(filePaths[0], "utf8")
    return { success: true, privateKeyPEM }
  } catch (error) {
    console.error("[FILE] Error reading private key:", error)
    return { success: false, error: error.message }
  }
})

/* ================= REGISTER ================= */

ipcMain.handle("user:register", async (_, username, password) => {
  try {
    // Generate RSA-2048 keypair (matching demo UI Web Crypto)
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: "spki",
        format: "pem"
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem"
      }
    })

    // Base64 encode public key for backend
    const publicKeyBase64 = Buffer.from(publicKey).toString("base64")

    // Register with backend
    const res = await fetch(
      `${BACKEND_URL}/Auth/register`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          publicKey: publicKeyBase64
        })
      }
    )

    if (!res.ok) {
      const t = await res.text()
      throw new Error(t)
    }

    const data = await res.json()

    // Store userUid in auth table (JWT is null on register)
    if (data.userUid) {
      await new Promise((resolve, reject) => {
        db.run("DELETE FROM auth", err => {
          if (err) return reject(err)
          db.run(
            "INSERT INTO auth (user_uid, jwt) VALUES (?, ?)",
            [data.userUid, ""],
            err => (err ? reject(err) : resolve())
          )
        })
      })

      // Store keypair in memory (will be exported to file by renderer)
      currentUserKeyPair = { publicKey, privateKey }
      currentUserUid = data.userUid
    }

    return {
      success: true,
      userUid: data.userUid,
      privateKey: privateKey, // Send to renderer for download
      username: username
    }

  } catch (e) {
    console.error("REGISTRATION ERROR:", e)
    throw e.message || "Registration failed"
  }
})



/*------------------Login--------------------*/

ipcMain.handle("user:login", async (_, username, password, privateKeyPEM) => {
  try {
    // Import private key from PEM (uploaded by user)
    if (!privateKeyPEM) {
      throw new Error("Private key is required")
    }

    // Validate and import private key
    try {
      const privateKeyObject = crypto.createPrivateKey(privateKeyPEM)
      // Derive public key from private key
      const publicKeyObject = crypto.createPublicKey(privateKeyObject)
      // Export public key to PEM format (SPKI)
      const publicKeyPEM = publicKeyObject.export({
        type: "spki",
        format: "pem"
      })
      
      currentUserKeyPair = {
        privateKey: privateKeyPEM,
        publicKey: publicKeyPEM
      }
    } catch (keyError) {
      throw new Error("Invalid private key format: " + keyError.message)
    }

    // Authenticate with backend
    const res = await fetch(
      `${BACKEND_URL}/Auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      }
    )

    if (!res.ok) {
      const t = await res.text()
      throw new Error(t)
    }

    const data = await res.json()

    if (!data.jwt || !data.userUid) {
      throw new Error("Invalid login response")
    }

    // Store JWT and userUid in database
    await new Promise((resolve, reject) => {
      db.run("DELETE FROM auth", err => {
        if (err) return reject(err)

        db.run(
          "INSERT INTO auth (user_uid, jwt) VALUES (?, ?)",
          [data.userUid, data.jwt],
          err => (err ? reject(err) : resolve())
        )
      })
    })

    // Store in memory
    currentUserUid = data.userUid
    currentJWT = data.jwt

    console.log("[AUTH] Login successful, keypair imported to memory")

    return { success: true, userUid: data.userUid, jwt: data.jwt }

  } catch (e) {
    console.error("LOGIN ERROR:", e)
    // Clear keypair on failed login
    currentUserKeyPair = null
    currentUserUid = null
    currentJWT = null
    throw e.message
  }
})

/* ================= GET USER BY ID ================= */

ipcMain.handle("user:getById", async (_, userId) => {
  try {
    if (!currentJWT) {
      throw new Error("Not authenticated")
    }

    console.log("[USER] Fetching user by ID:", userId)

    const res = await fetch(`${BACKEND_URL}/Users/GetUserById`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + currentJWT
      },
      body: JSON.stringify({ userId: userId })
    })

    console.log("[USER] Response status:", res.status, res.statusText)

    if (!res.ok) {
      const errorText = await res.text()
      console.error("[USER] Backend error:", errorText)
      throw new Error(`Failed to fetch user info (${res.status}): ${errorText}`)
    }

    const userData = await res.json()
    console.log("[USER] User data received:", userData)
    return { success: true, user: userData }

  } catch (error) {
    console.error("[USER] Error getting user by ID:", error)
    return { success: false, error: error.message }
  }
})

/* ================= CREATE DM ================= */

ipcMain.handle("dm:create", async (_, peerUsername) => {
  try {
    if (!currentJWT || !currentUserUid || !currentUserKeyPair) {
      throw new Error("Not authenticated or keypair not loaded")
    }

    // 1. Get peer info
    const peerRes = await fetch(`${BACKEND_URL}/Users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + currentJWT
      },
      body: JSON.stringify({ username: peerUsername })
    })

    if (!peerRes.ok) {
      const errorText = await peerRes.text()
      throw new Error(`Failed to fetch peer info: ${errorText}`)
    }

    const peer = await peerRes.json()

    // 2. Get my public key (from memory)
    const myPublicKey = currentUserKeyPair.publicKey

    // 3. Generate room key
    const roomKey = generateRoomKey()

    // 4. Encrypt room key for both users (using RSA-OAEP)
    const encryptedForMe = encryptRoomKey(
      roomKey,
      Buffer.from(myPublicKey).toString("base64")
    )

    const encryptedForPeer = encryptRoomKey(
      roomKey,
      peer.publicKey
    )

    // 5. Send to backend
    const res = await fetch(`${BACKEND_URL}/rooms/directMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + currentJWT
      },
      body: JSON.stringify({
        secondUser: peer.userName,
        keys: [
          {
            userId: currentUserUid,
            key: encryptedForMe.toString("base64")
          },
          {
            userId: peer.userId,
            key: encryptedForPeer.toString("base64")
          }
        ]
      })
    })
    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`Backend error: ${errorText}`)
    }

    const result = await res.json()

    // Extract room ID - handle different response formats
    const roomId = result.dmId || result.roomId || result.id
    
    if (!roomId) {
      throw new Error("No room ID returned from server")
    }

    // Store room locally
    await new Promise((resolve, reject) => {
      db.run(
        "INSERT OR REPLACE INTO rooms (room_id, peer_uuid) VALUES (?, ?)",
        [roomId, peer.userId],
        err => (err ? reject(err) : resolve())
      )
    })

    // Store encrypted room key
    await new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO room_keys (key_id, room_id, encrypted_key) VALUES (?, ?, ?)",
        [roomId + "_key", roomId, encryptedForMe],
        err => (err ? reject(err) : resolve())
      )
    })

    return { ...result, roomId }

  } catch (error) {
    console.error("[DM] Error creating DM:", error)
    throw error.message || "Failed to create direct message"
  }
})

/* ================= GROUP ROOM ================= */

ipcMain.handle("room:createGroup", async (_, roomName, peerUsernames) => {
  try {
    console.log("[ROOM] Creating group:", roomName, "with users:", peerUsernames)
    
    if (!currentJWT || !currentUserUid || !currentUserKeyPair) {
      throw new Error("Not authenticated or keypair not loaded")
    }

    if (!Array.isArray(peerUsernames) || peerUsernames.length === 0) {
      throw new Error("At least one peer username is required")
    }

    // 1. Get all peer info
    const peers = []
    for (const username of peerUsernames) {
      console.log("[ROOM] Fetching user:", username)
      
      const peerRes = await fetch(`${BACKEND_URL}/Users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + currentJWT
        },
        body: JSON.stringify({ username })
      })
      
      if (!peerRes.ok) {
        console.error("[ROOM] Failed to fetch user", username, ":", peerRes.status)
        continue
      }
      
      const peer = await peerRes.json()
      
      if (peer && peer.userId) {
        console.log("[ROOM] Found user:", peer.userName || peer.UserName, peer.userId)
        peers.push(peer)
      } else {
        console.warn("[ROOM] User not found:", username)
      }
    }

    if (peers.length === 0) {
      throw new Error("No valid users found")
    }

    console.log("[ROOM] Total peers found:", peers.length)

    // 2. Get my public key
    const myPublicKey = currentUserKeyPair.publicKey

    // 3. Generate room key
    const roomKey = generateRoomKey()

    // 4. Encrypt room key for all participants (including me)
    const encryptedKeys = []
    
    // Encrypt for me
    const encryptedForMe = encryptRoomKey(
      roomKey,
      Buffer.from(myPublicKey).toString("base64")
    )
    encryptedKeys.push({
      userId: currentUserUid,
      key: encryptedForMe.toString("base64")
    })

    // Encrypt for each peer
    for (const peer of peers) {
      const encryptedForPeer = encryptRoomKey(roomKey, peer.publicKey)
      encryptedKeys.push({
        userId: peer.userId,
        key: encryptedForPeer.toString("base64")
      })
    }

    // 5. Send to backend
    console.log("[ROOM] Sending group creation request to backend...")
    
    const payload = {
      Name: roomName,
      Users: peers.map(p => p.userId),
      EncryptionKeys: encryptedKeys
    }
    
    console.log("[ROOM] Payload:", JSON.stringify({
      ...payload,
      EncryptionKeys: encryptedKeys.map(k => ({ userId: k.userId, keyLength: k.key.length }))
    }, null, 2))
    
    const res = await fetch(`${BACKEND_URL}/rooms/room`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + currentJWT
      },
      body: JSON.stringify(payload)
    })

    console.log("[ROOM] Response status:", res.status, res.statusText)

    if (!res.ok) {
      const error = await res.text()
      console.error("[ROOM] Backend error:", error)
      throw new Error(error)
    }

    const result = await res.json()
    console.log("[ROOM] Backend response:", result)

    // Extract room ID - handle different response formats
    const roomId = result.roomID || result.roomId || result.id
    
    if (!roomId) {
      throw new Error("No room ID returned from server")
    }

    console.log("[ROOM] Extracted roomId:", roomId)

    // Store room locally
    await new Promise((resolve, reject) => {
      db.run(
        "INSERT OR REPLACE INTO rooms (room_id, peer_uuid) VALUES (?, ?)",
        [roomId, peers.map(p => p.userId).join(",")],
        err => (err ? reject(err) : resolve())
      )
    })

    // Store encrypted room key
    await new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO room_keys (key_id, room_id, encrypted_key) VALUES (?, ?, ?)",
        [roomId + "_key", roomId, encryptedForMe],
        err => (err ? reject(err) : resolve())
      )
    })

    return { ...result, roomId }

  } catch (error) {
    console.error("[ROOM] Error creating group:", error)
    throw error.message || "Failed to create group room"
  }
})

/* ================= ADD MEMBERS TO GROUP ================= */

ipcMain.handle("room:addMembers", async (_, roomId, usernames) => {
  try {
    console.log("[ROOM] Adding members to group:", roomId, "users:", usernames)
    
    if (!currentJWT || !currentUserUid || !currentUserKeyPair) {
      throw new Error("Not authenticated or keypair not loaded")
    }

    if (!Array.isArray(usernames) || usernames.length === 0) {
      throw new Error("At least one username is required")
    }

    // 1. Get current room key
    const roomKeyResult = await new Promise((resolve, reject) => {
      db.get(
        "SELECT encrypted_key FROM room_keys WHERE room_id = ? AND active = 1",
        [roomId],
        (err, row) => {
          if (err) return reject(err)
          if (!row) return reject(new Error("Room key not found"))
          resolve(row.encrypted_key)
        }
      )
    })

    // 2. Decrypt room key
    const decryptRoomKey = require("./crypto/decryptRoomKey")
    const roomKey = decryptRoomKey(
      roomKeyResult.toString("base64"),
      currentUserKeyPair.privateKey
    )

    // 3. Get new members' public keys
    const newMembers = []
    for (const username of usernames) {
      const peerRes = await fetch(`${BACKEND_URL}/Users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + currentJWT
        },
        body: JSON.stringify({ username })
      })
      
      if (!peerRes.ok) {
        console.error("[ROOM] Failed to fetch user", username)
        continue
      }
      
      const peer = await peerRes.json()
      if (peer && peer.userId) {
        newMembers.push(peer)
      }
    }

    if (newMembers.length === 0) {
      throw new Error("No valid users found")
    }

    // 4. Encrypt room key for each new member
    const encryptedKeys = newMembers.map(member => ({
      userId: member.userId,
      key: encryptRoomKey(roomKey, member.publicKey).toString("base64")
    }))

    // 5. Send to backend
    const res = await fetch(`${BACKEND_URL}/rooms/${roomId}/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + currentJWT
      },
      body: JSON.stringify({
        Users: newMembers.map(m => m.userId),
        EncryptionKeys: encryptedKeys
      })
    })

    if (!res.ok) {
      const error = await res.text()
      throw new Error(error)
    }

    const result = await res.json()
    console.log("[ROOM] Members added successfully")
    return { success: true, ...result }

  } catch (error) {
    console.error("[ROOM] Error adding members:", error)
    return { success: false, error: error.message }
  }
})

/* ================= TRANSFER ADMIN ================= */

ipcMain.handle("room:transferAdmin", async (_, roomId, newAdminUserId) => {
  try {
    if (!currentJWT) {
      throw new Error("Not authenticated")
    }

    const res = await fetch(`${BACKEND_URL}/rooms/${roomId}/transfer-admin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + currentJWT
      },
      body: JSON.stringify({ newAdminUserId })
    })

    if (!res.ok) {
      const error = await res.text()
      throw new Error(error)
    }

    console.log("[ROOM] Admin transferred to:", newAdminUserId)
    return { success: true }

  } catch (error) {
    console.error("[ROOM] Error transferring admin:", error)
    return { success: false, error: error.message }
  }
})

/* ================= GET GROUP INFO ================= */

ipcMain.handle("room:getInfo", async (_, roomId) => {
  try {
    if (!currentJWT) {
      throw new Error("Not authenticated")
    }

    const res = await fetch(`${BACKEND_URL}/rooms/${roomId}`, {
      method: "GET",
      headers: {
        "Authorization": "Bearer " + currentJWT
      }
    })

    if (!res.ok) {
      const error = await res.text()
      throw new Error(error)
    }

    const roomInfo = await res.json()
    console.log("[ROOM] Room info:", roomInfo)
    
    return {
      success: true,
      room: {
        id: roomInfo.id || roomInfo.Id,
        name: roomInfo.name || roomInfo.Name,
        creator: roomInfo.createdBy || roomInfo.CreatedBy,
        createdAt: roomInfo.createdAt || roomInfo.CreatedAt,
        participants: (roomInfo.users || roomInfo.Users || []).map(u => ({
          userId: u.userId || u.UserId || u.id || u.Id,
          username: u.username || u.Username || u.UserName || u.userName
        }))
      }
    }

  } catch (error) {
    console.error("[ROOM] Error getting room info:", error)
    return { success: false, error: error.message }
  }
})

/* ================= ROOM LISTING ================= */

ipcMain.handle("room:list", async () => {
  try {
    if (!currentJWT) {
      // If not authenticated, return local rooms only
      return new Promise((resolve, reject) => {
        db.all("SELECT room_id, peer_uuid FROM rooms", (err, rows) => {
          if (err) return reject(err)
          resolve(rows || [])
        })
      })
    }

    // Fetch rooms from backend
    const res = await fetch(`${BACKEND_URL}/rooms`, {
      method: "GET",
      headers: {
        "Authorization": "Bearer " + currentJWT
      }
    })

    if (!res.ok) {
      console.log("[ROOM] Backend fetch failed, using local rooms")
      console.log(res)
      // Fallback to local database if backend fails
      return new Promise((resolve, reject) => {
        db.all("SELECT room_id, peer_uuid FROM rooms", (err, rows) => {
          if (err) return reject(err)
          resolve(rows || [])
        })
      })
    }

    const rooms = await res.json()
    console.log("[ROOM] Raw rooms from server:", JSON.stringify(rooms, null, 2))

    if (!rooms || !Array.isArray(rooms)) {
      console.log("[ROOM] Invalid rooms response, using local rooms")
      return []
    }

    // Map rooms to consistent format (matching demo UI pattern)
    const mappedRooms = rooms
      .map(room => {
        // Extract ID from possible fields
        const roomId = room.id || room.Id || room.roomId
        
        if (!roomId) {
          console.warn("[ROOM] Room missing ID, skipping:", room)
          return null
        }
        
        // Extract last message from Messages collection if available
        const lastMsg = room.messages && room.messages.length > 0 
          ? room.messages[room.messages.length - 1] 
          : (room.Messages && room.Messages.length > 0 
            ? room.Messages[room.Messages.length - 1] 
            : null)
        
        // Determine if it's a group chat (more than 2 users)
        const userCount = (room.users || room.Users || []).length
        const isGroupChat = !(room.name === 73)
        
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
          unreadCount: 0,
          createdAt: room.createdAt || room.CreatedAt || new Date().toISOString(),
        }
      })
      .filter(room => room !== null)
    
    console.log("[ROOM] Mapped rooms:", mappedRooms.length, "rooms")

    // Sync with local database
    for (const room of mappedRooms) {
      await new Promise((resolve, reject) => {
        db.run(
          "INSERT OR IGNORE INTO rooms (room_id, peer_uuid) VALUES (?, ?)",
          [room.id, room.participants.join(",") || ""],
          err => (err ? reject(err) : resolve())
        )
      })
    }

    return mappedRooms

  } catch (error) {
    console.error("[ROOM] Error listing rooms:", error)
    // Return local rooms as fallback
    return new Promise((resolve, reject) => {
      db.all("SELECT room_id, peer_uuid FROM rooms", (err, rows) => {
        if (err) return reject(err)
        resolve(rows || [])
      })
    })
  }
})

/* ================= GET ROOM KEY ================= */

ipcMain.handle("room:getKey", async (_, roomId) => {
  try {
    if (!currentUserKeyPair || !currentUserKeyPair.privateKey) {
      throw new Error("Private key not loaded")
    }

    if (!currentUserUid || !currentJWT) {
      throw new Error("Not authenticated")
    }

    // First, try to get encrypted room key from local database
    let encryptedKey = await new Promise((resolve, reject) => {
      db.get(
        "SELECT encrypted_key FROM room_keys WHERE room_id = ? AND active = 1",
        [roomId],
        (err, row) => {
          if (err) return reject(err)
          resolve(row?.encrypted_key)
        }
      )
    })

    // If not found locally, fetch from backend
    if (!encryptedKey) {
      console.log("[ROOM] Key not found locally, fetching from backend...")
      
      const res = await fetch(`${BACKEND_URL}/keys/get`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + currentJWT
        },
        body: JSON.stringify({
          roomId: roomId,
          personalUid: currentUserUid
        })
      })

      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`Failed to fetch key from backend: ${errorText}`)
      }

      const keyData = await res.json()
      console.log("[ROOM] Key fetched from backend:", keyData)
      
      // Extract encrypted key from response (could be personalShared, key, or encryptedKey)
      const encryptedKeyBase64 = keyData.personalShared || keyData.key || keyData.encryptedKey || keyData.Key || keyData.EncryptedKey
      
      if (!encryptedKeyBase64) {
        throw new Error("No encrypted key in backend response")
      }

      // Store in local database for future use
      encryptedKey = Buffer.from(encryptedKeyBase64, "base64")
      await new Promise((resolve, reject) => {
        db.run(
          "INSERT OR REPLACE INTO room_keys (key_id, room_id, encrypted_key, active) VALUES (?, ?, ?, 1)",
          [roomId + "_key", roomId, encryptedKey],
          err => (err ? reject(err) : resolve())
        )
      })
    }

    // Decrypt room key with private key
    const decryptRoomKey = require("./crypto/decryptRoomKey")
    const roomKeyBuffer = decryptRoomKey(
      encryptedKey.toString("base64"),
      currentUserKeyPair.privateKey
    )

    // Return as base64 for renderer
    return {
      success: true,
      roomKey: roomKeyBuffer.toString("base64")
    }

  } catch (error) {
    console.error("[ROOM] Error getting room key:", error)
    return {
      success: false,
      error: error.message
    }
  }
})

// Leave a group
ipcMain.handle("room:leave", async (_, roomId, newAdminUserId) => {
  try {
    if (!currentJWT || !currentUserUid) {
      throw new Error("Not authenticated")
    }

    // If newAdminUserId is provided, transfer admin first
    if (newAdminUserId) {
      const transferRes = await fetch(`${BACKEND_URL}/rooms/${roomId}/transfer-admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + currentJWT
        },
        body: JSON.stringify({ newAdminUserId })
      })

      if (!transferRes.ok) {
        const error = await transferRes.text()
        throw new Error(`Failed to transfer admin: ${error}`)
      }
      console.log("[ROOM] Admin transferred before leaving")
    }

    // Now leave the group
    const response = await fetch(`${BACKEND_URL}/rooms/${roomId}/leave`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${currentJWT}`,
        "Content-Type": "application/json"
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }

    // Mark room as archived in local database
    await new Promise((resolve, reject) => {
      db.run(
        "UPDATE rooms SET archived = 1 WHERE room_id = ?",
        [roomId],
        err => (err ? reject(err) : resolve())
      )
    })

    console.log("[ROOM] Left and archived group:", roomId)
    return { success: true }
  } catch (error) {
    console.error("[ROOM] Error leaving group:", error)
    return { success: false, error: error.message }
  }
})

// Archive/unarchive a room
ipcMain.handle("room:setArchived", async (_, roomId, archived) => {
  try {
    await new Promise((resolve, reject) => {
      db.run(
        "UPDATE rooms SET archived = ? WHERE room_id = ?",
        [archived ? 1 : 0, roomId],
        err => (err ? reject(err) : resolve())
      )
    })
    console.log(`[ROOM] ${archived ? 'Archived' : 'Unarchived'} room:`, roomId)
    return { success: true }
  } catch (error) {
    console.error("[ROOM] Error updating archived status:", error)
    return { success: false, error: error.message }
  }
})

/* ================= MESSAGE STORAGE ================= */

// Store encrypted message to local DB
ipcMain.handle("message:store", async (event, { messageId, roomId, senderId, ciphertext, nonce, timestamp }) => {
  try {
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT OR REPLACE INTO messages 
         (message_id, room_id, sender_uuid, status, type, content, iv, tag, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [messageId, roomId, senderId, 'received', 'text', ciphertext, nonce, '', timestamp || new Date().toISOString()],
        err => err ? reject(err) : resolve()
      )
    })
    console.log("[MESSAGE] Stored message:", messageId)
    return { success: true }
  } catch (error) {
    console.error("[MESSAGE] Error storing:", error)
    return { success: false, error: error.message }
  }
})

// Update message ID (replace temp ID with server ID)
ipcMain.handle("message:updateId", async (event, { roomId, ciphertext, newMessageId }) => {
  try {
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE messages 
         SET message_id = ? 
         WHERE room_id = ? AND content = ? AND message_id LIKE 'temp-%'`,
        [newMessageId, roomId, ciphertext],
        err => err ? reject(err) : resolve()
      )
    })
    console.log("[MESSAGE] Updated temp ID to:", newMessageId)
    return { success: true }
  } catch (error) {
    console.error("[MESSAGE] Error updating ID:", error)
    return { success: false, error: error.message }
  }
})

// Get all encrypted messages for a room
ipcMain.handle("message:getForRoom", async (event, roomId) => {
  try {
    const messages = await new Promise((resolve, reject) => {
      db.all(
        `SELECT message_id, room_id, sender_uuid, content, iv, created_at 
         FROM messages 
         WHERE room_id = ? 
         ORDER BY created_at ASC`,
        [roomId],
        (err, rows) => err ? reject(err) : resolve(rows || [])
      )
    })
    console.log("[MESSAGE] Loaded", messages.length, "messages for room", roomId)
    return messages
  } catch (error) {
    console.error("[MESSAGE] Error loading:", error)
    return []
  }
})

// Get paginated messages for a room (latest first)
ipcMain.handle("message:getForRoomPaginated", async (event, { roomId, limit, offset }) => {
  try {
    // Get total count first
    const count = await new Promise((resolve, reject) => {
      db.get(
        `SELECT COUNT(*) as total FROM messages WHERE room_id = ?`,
        [roomId],
        (err, row) => err ? reject(err) : resolve(row?.total || 0)
      )
    })

    // Get messages in reverse order (newest first) with limit/offset
    const messages = await new Promise((resolve, reject) => {
      db.all(
        `SELECT message_id, room_id, sender_uuid, content, iv, created_at 
         FROM messages 
         WHERE room_id = ? 
         ORDER BY created_at DESC 
         LIMIT ? OFFSET ?`,
        [roomId, limit, offset],
        (err, rows) => err ? reject(err) : resolve(rows || [])
      )
    })

    // Reverse to get chronological order (oldest to newest)
    messages.reverse()

    console.log(`[MESSAGE] Loaded ${messages.length}/${count} messages (offset: ${offset})` )
    return {
      messages,
      total: count,
      hasMore: offset + messages.length < count
    }
  } catch (error) {
    console.error("[MESSAGE] Error loading paginated:", error)
    return { messages: [], total: 0, hasMore: false }
  }
})

// Get last message ID for incremental fetching
ipcMain.handle("message:getLastId", async (event, roomId) => {
  try {
    const result = await new Promise((resolve, reject) => {
      db.get(
        `SELECT message_id FROM messages WHERE room_id = ? ORDER BY created_at DESC LIMIT 1`,
        [roomId],
        (err, row) => err ? reject(err) : resolve(row)
      )
    })
    return result?.message_id || null
  } catch (error) {
    console.error("[MESSAGE] Error getting last message ID:", error)
    return null
  }
})

  
/* ================= APP INIT ================= */
app.whenReady().then(async () => {
  console.log("[APP] starting")
  console.log("[APP] Database ready")
  
  // Setup WebSocket IPC handlers
  setupWebSocketIPC()
  console.log("[APP] WebSocket IPC ready")
  
  createWindow()
})

app.on("before-quit", () => {
  // Clear sensitive data from memory
  currentUserKeyPair = null
  currentUserUid = null
  currentJWT = null
  console.log("[APP] Cleared keypair from memory")
})