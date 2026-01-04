const crypto = require("crypto")
const db = require("./db")

function initIdentity() {
  console.log("[IDENTITY] initIdentity() called")

  return new Promise((resolve, reject) => {
    db.get("SELECT id FROM identity LIMIT 1", (err, row) => {
      if (err) return reject(err)
      if (row) return resolve()

      // 🔑 Identity signing key (Ed25519)
      const sign = crypto.generateKeyPairSync("ed25519")

      // 🔑 Diffie-Hellman key (X25519)
      const dh = crypto.generateKeyPairSync("x25519")

      db.run(
        `INSERT INTO identity (
          sign_public_key,
          sign_private_key,
          dh_public_key,
          dh_private_key
        ) VALUES (?, ?, ?, ?)`,
        [
          sign.publicKey.export({ type: "spki", format: "pem" }),
          sign.privateKey.export({ type: "pkcs8", format: "pem" }),
          dh.publicKey.export({ type: "spki", format: "pem" }),
          dh.privateKey.export({ type: "pkcs8", format: "pem" })
        ],
        err => {
          if (err) return reject(err)
          console.log("[IDENTITY] identity created")
          resolve()
        }
      )
    })
  })
}

module.exports = initIdentity
