const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("win", {
  min: () => ipcRenderer.send("win:min"),
  max: () => ipcRenderer.send("win:max"),
  close: () => ipcRenderer.send("win:close")
})

contextBridge.exposeInMainWorld("api", {
  // Authentication (updated to match demo UI pattern)
  register: (u, p) => ipcRenderer.invoke("user:register", u, p),
  login: (u, p, privateKeyPEM) => ipcRenderer.invoke("user:login", u, p, privateKeyPEM),
  getUserById: (userId) => ipcRenderer.invoke("user:getById", userId),
  
  // File operations for private key management
  savePrivateKey: (privateKeyPEM, username) => 
    ipcRenderer.invoke("file:savePrivateKey", privateKeyPEM, username),
  openPrivateKey: () => ipcRenderer.invoke("file:openPrivateKey"),
  
  // Room operations
  createDM: (peerUsername) => ipcRenderer.invoke("dm:create", peerUsername),
  createGroup: (roomName, peerUsernames) => ipcRenderer.invoke("room:createGroup", roomName, peerUsernames),
  listRooms: () => ipcRenderer.invoke("room:list"),
  getRoomKey: (roomId) => ipcRenderer.invoke("room:getKey", roomId),
  
  // Message storage APIs
  storeMessage: (data) => ipcRenderer.invoke("message:store", data),
  getMessagesForRoom: (roomId) => ipcRenderer.invoke("message:getForRoom", roomId),
  getLastMessageId: (roomId) => ipcRenderer.invoke("message:getLastId", roomId),
  
  // WebSocket operations
  ws: {
    connect: (jwt) => ipcRenderer.invoke("ws:connect", jwt),
    disconnect: () => ipcRenderer.invoke("ws:disconnect"),
    sendMessage: (roomId, ciphertext, nonce, senderId, keyVersion) => 
      ipcRenderer.invoke("ws:sendMessage", roomId, ciphertext, nonce, senderId, keyVersion),
    fetchMessages: (roomId, afterMessageId) => 
      ipcRenderer.invoke("ws:fetchMessages", roomId, afterMessageId),
    onMessage: (callback) => 
      ipcRenderer.on("ws:message", (_, envelope) => callback(envelope)),
    onReconnected: (callback) => 
      ipcRenderer.on("ws:reconnected", () => callback())
  }
})
