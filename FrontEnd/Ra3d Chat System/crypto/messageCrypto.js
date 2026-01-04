const crypto = require("crypto")

function encryptMessage(roomKey, plaintext, aad = "") {
  const iv = crypto.randomBytes(12) // GCM standard
  const cipher = crypto.createCipheriv("aes-256-gcm", roomKey, iv)

  if (aad) cipher.setAAD(Buffer.from(aad))

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ])

  const tag = cipher.getAuthTag()

  return {
    content: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64")
  }
}

function decryptMessage(roomKey, payload, aad = "") {
  const iv = Buffer.from(payload.iv, "base64")
  const tag = Buffer.from(payload.tag, "base64")
  const encrypted = Buffer.from(payload.content, "base64")

  const decipher = crypto.createDecipheriv("aes-256-gcm", roomKey, iv)

  if (aad) decipher.setAAD(Buffer.from(aad))
  decipher.setAuthTag(tag)

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ])

  return decrypted.toString("utf8")
}

module.exports = {
  encryptMessage,
  decryptMessage
}
