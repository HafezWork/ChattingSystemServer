/**
 * Cryptography Service
 * Handles all encryption/decryption operations using Web Crypto API
 */

class CryptoService {
  constructor() {
    this.keyPair = null;
    this.roomKeys = new Map(); // Map of roomId -> symmetric key
  }

  /**
   * Generate RSA key pair for user
   */
  async generateKeyPair() {
    try {
      const keyPair = await window.crypto.subtle.generateKey(
        {
          name: "RSA-OAEP",
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: "SHA-256",
        },
        true,
        ["encrypt", "decrypt"]
      );

      this.keyPair = keyPair;
      return keyPair;
    } catch (error) {
      console.error("Error generating key pair:", error);
      throw error;
    }
  }

  /**
   * Export public key to base64 string
   */
  async exportPublicKey(publicKey = null) {
    const keyToExport = publicKey || this.keyPair?.publicKey;
    if (!keyToExport) throw new Error("No public key available");

    const exported = await window.crypto.subtle.exportKey("spki", keyToExport);
    const exportedAsString = String.fromCharCode.apply(
      null,
      new Uint8Array(exported)
    );
    return btoa(exportedAsString);
  }

  /**
   * Export private key for storage
   */
  async exportPrivateKey() {
    if (!this.keyPair?.privateKey) throw new Error("No private key available");

    const exported = await window.crypto.subtle.exportKey(
      "pkcs8",
      this.keyPair.privateKey
    );
    const exportedAsString = String.fromCharCode.apply(
      null,
      new Uint8Array(exported)
    );
    return btoa(exportedAsString);
  }

  /**
   * Import public key from base64 string
   */
  async importPublicKey(base64Key) {
    const binaryString = atob(base64Key);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return await window.crypto.subtle.importKey(
      "spki",
      bytes,
      {
        name: "RSA-OAEP",
        hash: "SHA-256",
      },
      true,
      ["encrypt"]
    );
  }

  /**
   * Import private key from base64 string
   */
  async importPrivateKey(base64Key) {
    const binaryString = atob(base64Key);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const privateKey = await window.crypto.subtle.importKey(
      "pkcs8",
      bytes,
      {
        name: "RSA-OAEP",
        hash: "SHA-256",
      },
      true,
      ["decrypt"]
    );

    if (!this.keyPair) {
      this.keyPair = { privateKey };
    } else {
      this.keyPair.privateKey = privateKey;
    }

    return privateKey;
  }

  /**
   * Generate symmetric key for room encryption
   */
  async generateRoomKey() {
    return await window.crypto.subtle.generateKey(
      {
        name: "AES-GCM",
        length: 256,
      },
      true,
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Export symmetric key as raw bytes
   */
  async exportSymmetricKey(key) {
    const exported = await window.crypto.subtle.exportKey("raw", key);
    return new Uint8Array(exported);
  }

  /**
   * Import symmetric key from raw bytes
   */
  async importSymmetricKey(keyBytes) {
    return await window.crypto.subtle.importKey(
      "raw",
      keyBytes,
      {
        name: "AES-GCM",
        length: 256,
      },
      true,
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Encrypt data with RSA public key
   */
  async encryptWithPublicKey(data, publicKey) {
    const encoder = new TextEncoder();
    const encodedData = typeof data === "string" ? encoder.encode(data) : data;

    const encrypted = await window.crypto.subtle.encrypt(
      {
        name: "RSA-OAEP",
      },
      publicKey,
      encodedData
    );

    return new Uint8Array(encrypted);
  }

  /**
   * Decrypt data with RSA private key
   */
  async decryptWithPrivateKey(encryptedData) {
    if (!this.keyPair?.privateKey)
      throw new Error("No private key available");

    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: "RSA-OAEP",
      },
      this.keyPair.privateKey,
      encryptedData
    );

    return new Uint8Array(decrypted);
  }

  /**
   * Encrypt message with symmetric key (AES-GCM)
   */
  async encryptMessage(message, roomKey) {
    const encoder = new TextEncoder();
    const encodedMessage = encoder.encode(message);

    // Generate random IV (nonce)
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      roomKey,
      encodedMessage
    );

    return {
      ciphertext: new Uint8Array(encrypted),
      nonce: iv,
    };
  }

  /**
   * Decrypt message with symmetric key (AES-GCM)
   */
  async decryptMessage(ciphertext, nonce, roomKey) {
    try {
      const decrypted = await window.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: nonce,
        },
        roomKey,
        ciphertext
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error("Decryption failed:", error);
      throw new Error("Failed to decrypt message");
    }
  }

  /**
   * Store room key
   */
  setRoomKey(roomId, key) {
    this.roomKeys.set(roomId, key);
  }

  /**
   * Get room key
   */
  getRoomKey(roomId) {
    return this.roomKeys.get(roomId);
  }

  /**
   * Save keys to IndexedDB - REMOVED for security
   * Keys should only be in key files
   */
  async saveKeysToStorage() {
    // No longer save keys to IndexedDB
    console.warn('Keys are not saved to browser storage for security');
  }

  /**
   * Load keys from IndexedDB - REMOVED
   * Keys must be loaded from file
   */
  async loadKeysFromStorage() {
    // Keys are no longer stored in browser
    console.warn('Keys must be loaded from key file');
    return false;
  }

  /**
   * Save room key to storage
   */
  async saveRoomKeyToStorage(roomId, key) {
    const keyBytes = await this.exportSymmetricKey(key);
    const keyBase64 = btoa(String.fromCharCode.apply(null, keyBytes));
    await dbService.saveSetting(`roomKey_${roomId}`, keyBase64);
  }

  /**
   * Load room key from storage
   */
  async loadRoomKeyFromStorage(roomId) {
    const keyBase64 = await dbService.getSetting(`roomKey_${roomId}`);
    if (!keyBase64) return null;

    const binaryString = atob(keyBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const key = await this.importSymmetricKey(bytes);
    this.setRoomKey(roomId, key);
    return key;
  }

  /**
   * Convert Uint8Array to Base64
   */
  arrayBufferToBase64(buffer) {
    return btoa(String.fromCharCode.apply(null, buffer));
  }

  /**
   * Convert Base64 to Uint8Array
   */
  base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
}

// Create singleton instance
const cryptoService = new CryptoService();
