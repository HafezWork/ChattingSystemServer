/**
 * Authentication Handler
 * Manages user authentication, registration, and session
 */

class AuthHandler {
  constructor() {
    this.currentUser = null;
    this.isLoggedIn = false;
  }

  /**
   * Initialize auth handler (modified to not auto-load keys)
   */
  async init() {
    // Load stored user data
    const userData = await dbService.getCurrentUser();
    const authData = await dbService.getAuthData();

    if (userData && authData) {
      this.currentUser = userData;
      this.isLoggedIn = false; // Set to false until key file is provided

      return false; // Return false to require login with key file
    }

    return false;
  }

  /**
   * Handle user login (now requires key file)
   */
  async login(username, password, keyFile) {
    if (!keyFile) {
      return {
        success: false,
        error: "Please select your private key file"
      };
    }
    
    return await this.loginWithKeyFile(username, password, keyFile);
  }

  /**
   * Handle user login with key file
   */
  async loginWithKeyFile(username, password, keyFile) {
    try {
      // Load private key from file
      const keyData = await this.loadPrivateKeyFromFile(keyFile);
      console.log("Login keyData:", keyData);
      console.log("keyData.username:", keyData.username);
      console.log("Login username:", username);
      
      // Check if key file has username
      if (!keyData || !keyData.username) {
        return {
          success: false,
          error: "Key file is missing username information. Please use a valid key file."
        };
      }
      
      // Compare usernames (case-insensitive and trimmed)
      if (keyData.username.toLowerCase().trim() !== username.toLowerCase().trim()) {
        return {
          success: false,
          error: `Key file username (${keyData.username}) does not match login username (${username})`
        };
      }
      
      // Call API login
      const response = await apiService.login(username, password);

      const userData = {
        userId: response.userUid,
        username: username,
        token: response.jwt,
      };

      // Store user data but NOT the keys (they're loaded from file each time)
      await dbService.saveCurrentUser(userData);
      await dbService.saveAuthData({
        userId: userData.userId,
        username: username,
        loginTime: new Date().toISOString(),
      });

      localStorage.setItem("authToken", userData.token);

      this.currentUser = userData;
      this.isLoggedIn = true;

      return { success: true, data: userData };
    } catch (error) {
      console.error("Login error:", error);
      return {
        success: false,
        error: error.message || apiService.handleError(error),
      };
    }
  }

  /**
   * Handle user registration
   */
  async register(username, password) {
    try {
      // Generate RSA key pair for encryption
      await cryptoService.generateKeyPair();

      // Export public key to send to server
      const publicKeyBase64 = await cryptoService.exportPublicKey();

      // Call API register
      const response = await apiService.register(
        username,
        password,
        publicKeyBase64
      );

      // Download private key file
      await this.downloadPrivateKey(username);
      
      // Show alert to user
      alert('IMPORTANT: Your private key has been downloaded. Please keep this file safe! You will need it to login.');

      // Clear the keys from memory (don't save to IndexedDB)
      cryptoService.keyPair = null;

      return { 
        success: true, 
        message: 'Registration successful. Please login with your key file.',
        requiresKeyFile: true 
      };
    } catch (error) {
      console.error("Registration error:", error);
      return {
        success: false,
        error: apiService.handleError(error),
      };
    }
  }

  /**
   * Handle user logout
   */
  async logout() {
    try {
      // Clear API token
      await apiService.logout();

      // Clear local data
      await dbService.clearAuthToken();
      await dbService.clearAuthData();
      await dbService.clearCurrentUser();
      
      // Clear keys from memory
      cryptoService.keyPair = null;
      cryptoService.roomKeys.clear();

      this.currentUser = null;
      this.isLoggedIn = false;

      return { success: true };
    } catch (error) {
      console.error("Logout error:", error);
      return {
        success: false,
        error: "Error during logout",
      };
    }
  }

  /**
   * Download private key as a file
   */
  async downloadPrivateKey(username) {
    const privateKeyBase64 = await cryptoService.exportPrivateKey();
    const publicKeyBase64 = await cryptoService.exportPublicKey();
    
    const keyData = {
      username: username,
      privateKey: privateKeyBase64,
      publicKey: publicKeyBase64,
      createdAt: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(keyData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${username}_private_key.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Load private key from file
   */
  async loadPrivateKeyFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const keyData = JSON.parse(e.target.result);
          console.log("Loaded key data:", keyData);
          
          if (!keyData.privateKey || !keyData.publicKey) {
            reject(new Error('Invalid key file format'));
            return;
          }
          
          // Import the keys
          await cryptoService.importPrivateKey(keyData.privateKey);
          const publicKey = await cryptoService.importPublicKey(keyData.publicKey);
          
          if (!cryptoService.keyPair) {
            cryptoService.keyPair = {};
          }
          cryptoService.keyPair.publicKey = publicKey;
          
          resolve(keyData);
        } catch (error) {
          reject(new Error('Failed to load key file: ' + error.message));
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read key file'));
      reader.readAsText(file);
    });
  }

  /**
   * Get current user
   */
  getCurrentUser() {
    return this.currentUser;
  }

  /**
   * Check if user is logged in
   */
  checkIsLoggedIn() {
    return this.isLoggedIn;
  }

  /**
   * Get user ID
   */
  getUserId() {
    return this.currentUser ? this.currentUser.userId : null;
  }

  /**
   * Get username
   */
  getUsername() {
    return this.currentUser ? this.currentUser.username : null;
  }

  /**
   * Validate session
   */
  async validateSession() {
    const authData = await dbService.getAuthData();
    const token = await dbService.getAuthToken();

    if (!authData || !token) {
      this.isLoggedIn = false;
      return false;
    }

    // Check if token is still valid (optional - depends on server implementation)
    // You might want to make a test API call here

    this.isLoggedIn = true;
    return true;
  }

  /**
   * Update user profile
   */
  async updateProfile(updates) {
    if (!this.currentUser) {
      return { success: false, error: "Not logged in" };
    }

    try {
      // Update on server
      await apiService.updateUser(this.currentUser.userId, updates);

      // Update local data
      this.currentUser = { ...this.currentUser, ...updates };
      await dbService.saveCurrentUser(this.currentUser);

      return { success: true, data: this.currentUser };
    } catch (error) {
      console.error("Profile update error:", error);
      return {
        success: false,
        error: apiService.handleError(error),
      };
    }
  }
}

// Create singleton instance
const authHandler = new AuthHandler();
