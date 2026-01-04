const crypto = require("crypto")
const db = require("./db")

function initDevice(userUuid) {
  const deviceId = crypto.randomUUID()
  const dh = crypto.generateKeyPairSync("x25519")

  db.run(
    `INSERT INTO devices
     (device_id, user_uuid, device_pub_key)
     VALUES (?, ?, ?)`,
    [
      deviceId,
      userUuid,
      dh.publicKey.export({ type: "spki", format: "pem" })
    ]
  )

  return {
    deviceId,
    devicePrivateKey: dh.privateKey.export({ type: "pkcs8", format: "pem" })
  }
}

module.exports = initDevice
