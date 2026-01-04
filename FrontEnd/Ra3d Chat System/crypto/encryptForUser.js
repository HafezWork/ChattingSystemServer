// crypto/encryptForUser.js
const crypto = require("crypto")

/**
 * Encrypt room key with user's RSA-OAEP public key (matching demo UI Web Crypto)
 * @param {Buffer} roomKey - 32-byte AES-256 key
 * @param {string} base64PublicKey - Base64-encoded public key from backend
 * @returns {Buffer} Encrypted room key
 */
function encryptRoomKey(roomKey, base64PublicKey) {
  const pem = Buffer.from(base64PublicKey, "base64").toString("utf8")

  return crypto.publicEncrypt(
    {
      key: pem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256' // Match Web Crypto RSA-OAEP with SHA-256
    },
    roomKey
  )
}

module.exports = encryptRoomKey
