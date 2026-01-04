const crypto = require("crypto")

/**
 * Decrypt room key with user's RSA-OAEP private key (matching demo UI Web Crypto)
 * @param {string} base64EncryptedKey - Base64-encoded encrypted room key
 * @param {string} privateKeyPem - PEM-encoded private key from user file
 * @returns {Buffer} Decrypted 32-byte AES-256 room key
 */
function decryptRoomKey(base64EncryptedKey, privateKeyPem) {
  const encrypted = Buffer.from(base64EncryptedKey, "base64")

  return crypto.privateDecrypt(
    {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256' // Match Web Crypto RSA-OAEP with SHA-256
    },
    encrypted
  ) // returns Buffer (32 bytes)
}

module.exports = decryptRoomKey
