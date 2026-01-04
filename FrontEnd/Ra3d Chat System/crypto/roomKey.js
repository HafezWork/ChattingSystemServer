// crypto/roomKey.js
const crypto = require("crypto")

function generateRoomKey() {
  return crypto.randomBytes(32) // 256-bit
}

module.exports = generateRoomKey
