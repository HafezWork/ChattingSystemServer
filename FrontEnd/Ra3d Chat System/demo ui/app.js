/**
 * Main Application Controller
 * Handles UI interactions, theme management, and application state
 */

class App {
  constructor() {
    this.currentScreen = "auth";
    this.theme = "light";
    this.initialized = false;
  }

  /**
   * Initialize the application
   */
  async init() {
    if (this.initialized) return;

    try {
      console.log("Initializing application...");

      // Initialize database
      await dbService.init();
      console.log("Database initialized");

      // Load theme
      await this.loadTheme();
      console.log("Theme loaded");

      // Initialize API
      await apiService.initialize();
      console.log("API initialized");

      // Check if user is logged in (but don't auto-login without key file)
      const userData = await dbService.getCurrentUser();
      const authData = await dbService.getAuthData();

      if (userData && authData) {
        console.log("User data found, showing login screen");
        this.showScreen("auth");
      } else {
        console.log("No user data, showing auth screen");
        this.showScreen("auth");
      }

      // Setup event listeners
      this.setupEventListeners();
      console.log("Event listeners set up");

      this.initialized = true;
      console.log("Application initialized successfully");
    } catch (error) {
      console.error("Error initializing app:", error);
      this.showError("Failed to initialize application: " + error.message);
    }
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Theme toggle buttons
    const themeToggle = document.getElementById("themeToggle");
    const themeToggleChat = document.getElementById("themeToggleChat");

    if (themeToggle) {
      themeToggle.addEventListener("click", () => this.toggleTheme());
    }
    if (themeToggleChat) {
      themeToggleChat.addEventListener("click", () => this.toggleTheme());
    }

    // Auth tabs
    const authTabs = document.querySelectorAll(".auth-tabs .tab-btn");
    authTabs.forEach((tab) => {
      tab.addEventListener("click", (e) =>
        this.switchAuthTab(e.target.dataset.tab)
      );
    });

    // Login form
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
      loginForm.addEventListener("submit", (e) => this.handleLogin(e));
    }

    // Register form
    const registerForm = document.getElementById("registerForm");
    if (registerForm) {
      registerForm.addEventListener("submit", (e) => this.handleRegister(e));
    }

    // Logout button
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => this.handleLogout());
    }

    // New chat button
    const newChatBtn = document.getElementById("newChatBtn");
    if (newChatBtn) {
      newChatBtn.addEventListener("click", () => this.showNewChatModal());
    }

    // Modal tabs
    const modalTabs = document.querySelectorAll(".modal-tabs .tab-btn");
    modalTabs.forEach((tab) => {
      tab.addEventListener("click", (e) =>
        this.switchModalTab(e.target.dataset.tab)
      );
    });

    // Close modal
    const closeModalBtn = document.getElementById("closeModalBtn");
    if (closeModalBtn) {
      closeModalBtn.addEventListener("click", () => this.closeModal());
    }

    // DM form
    const dmForm = document.getElementById("dmForm");
    if (dmForm) {
      dmForm.addEventListener("submit", (e) => this.handleDMCreate(e));
    }

    // Group form
    const groupForm = document.getElementById("groupForm");
    if (groupForm) {
      groupForm.addEventListener("submit", (e) => this.handleGroupCreate(e));
    }

    // Message form
    const messageForm = document.getElementById("messageForm");
    if (messageForm) {
      messageForm.addEventListener("submit", (e) => this.handleSendMessage(e));
    }

    // Room search
    const roomSearchInput = document.getElementById("roomSearchInput");
    if (roomSearchInput) {
      roomSearchInput.addEventListener("input", (e) => this.filterRooms(e.target.value));
    }

    // Refresh messages
    const refreshMessages = document.getElementById("refreshMessages");
    if (refreshMessages) {
      refreshMessages.addEventListener("click", () => this.refreshMessages());
    }
  }

  /**
   * Show screen
   */
  showScreen(screenName) {
    // Hide all screens
    const screens = document.querySelectorAll(".screen");
    screens.forEach(screen => screen.classList.remove("active"));

    // Show target screen
    const targetScreen = document.getElementById(screenName + "Screen");
    console.log("Showing screen:", screenName + "Screen", targetScreen);
    if (targetScreen) {
      targetScreen.classList.add("active");
      this.currentScreen = screenName;
      console.log("Screen shown, currentScreen:", this.currentScreen);
    } else {
      console.error("Screen not found:", screenName + "Screen");
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    console.error(message);
    // You can implement a toast notification or alert here
    alert("Error: " + message);
  }

  /**
   * Toggle theme
   */
  toggleTheme() {
    this.theme = this.theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", this.theme);
    localStorage.setItem("theme", this.theme);

    // Update theme toggle icons
    const icons = document.querySelectorAll("#themeToggle .icon, #themeToggleChat .icon");
    icons.forEach(icon => {
      icon.textContent = this.theme === "light" ? "🌙" : "☀️";
    });
  }

  /**
   * Load theme from storage
   */
  async loadTheme() {
    const savedTheme = localStorage.getItem("theme") || "light";
    this.theme = savedTheme;
    document.documentElement.setAttribute("data-theme", savedTheme);

    // Update theme toggle icons
    const icons = document.querySelectorAll("#themeToggle .icon, #themeToggleChat .icon");
    icons.forEach(icon => {
      icon.textContent = savedTheme === "light" ? "🌙" : "☀️";
    });
  }

  /**
   * Switch auth tab
   */
  switchAuthTab(tab) {
    const authTabs = document.querySelectorAll(".auth-tabs .tab-btn");
    const authForms = document.querySelectorAll(".auth-form");

    authTabs.forEach(btn => btn.classList.remove("active"));
    authForms.forEach(form => form.classList.remove("active"));

    const activeTab = document.querySelector(`.auth-tabs .tab-btn[data-tab="${tab}"]`);
    const activeForm = document.getElementById(tab + "Form");

    if (activeTab) activeTab.classList.add("active");
    if (activeForm) activeForm.classList.add("active");
  }

  /**
   * Handle login
   */
  async handleLogin(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const username = formData.get("loginUsername");
    const password = formData.get("loginPassword");
    const keyFile = document.getElementById("loginKeyFile").files[0];

    try {
      const result = await authHandler.login(username, password, keyFile);

      if (result.success) {
        console.log("Login successful, result:", result);
        
        // Update current username in sidebar
        const currentUsernameEl = document.getElementById("currentUsername");
        if (currentUsernameEl) {
          currentUsernameEl.textContent = username;
        }
        
        // Initialize chat manager
        try {
          console.log("Initializing chat manager...");
          await chatManager.init();
          console.log("Chat manager initialized");
          
          // Add message listener to auto-refresh UI when new messages arrive
          chatManager.addMessageListener((message) => {
            console.log("New message received:", message);
            // Only refresh if it's for the currently open room
            if (message.roomId === chatManager.currentRoomId) {
              this.loadRoomMessages(message.roomId);
            }
          });
        } catch (error) {
          console.error("Chat manager init error:", error);
          throw error;
        }

        // Show chat screen
        console.log("Showing chat screen...");
        this.showScreen("chat");

        // Load and display rooms
        try {
          console.log("Loading rooms...");
          await this.loadRooms();
          console.log("Rooms loaded");
        } catch (error) {
          console.error("Load rooms error:", error);
        }
      } else {
        this.showError(result.error);
      }
    } catch (error) {
      this.showError("Login failed: " + error.message);
    }
  }

  /**
   * Handle register
   */
  async handleRegister(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const username = formData.get("registerUsername");
    const password = formData.get("registerPassword");
    const confirmPassword = formData.get("confirmPassword");

    if (password !== confirmPassword) {
      this.showError("Passwords do not match");
      return;
    }

    try {
      const result = await authHandler.register(username, password);

      if (result.success) {
        // Switch to login tab
        this.switchAuthTab("login");
        this.showError("Registration successful! Please login with your downloaded key file.");
      } else {
        this.showError(result.error);
      }
    } catch (error) {
      this.showError("Registration failed: " + error.message);
    }
  }

  /**
   * Handle logout
   */
  async handleLogout() {
    try {
      await authHandler.logout();
      this.showScreen("auth");
    } catch (error) {
      this.showError("Logout failed: " + error.message);
    }
  }

  /**
   * Show new chat modal
   */
  showNewChatModal() {
    console.log("showNewChatModal called");
    const modal = document.getElementById("newChatModal");
    console.log("Modal element:", modal);
    if (modal) {
      modal.classList.add("active");
      console.log("Added 'active' class to modal");
    } else {
      console.error("Modal element not found!");
    }
  }

  /**
   * Close modal
   */
  closeModal() {
    const modal = document.getElementById("newChatModal");
    if (modal) {
      modal.classList.remove("active");
    }
  }

  /**
   * Switch modal tab
   */
  switchModalTab(tab) {
    const modalTabs = document.querySelectorAll(".modal-tabs .tab-btn");
    const modalForms = document.querySelectorAll(".modal-form");

    modalTabs.forEach(btn => btn.classList.remove("active"));
    modalForms.forEach(form => form.classList.remove("active"));

    const activeTab = document.querySelector(`.modal-tabs .tab-btn[data-tab="${tab}"]`);
    const activeForm = document.getElementById(tab + "Form");

    if (activeTab) activeTab.classList.add("active");
    if (activeForm) activeForm.classList.add("active");
  }

  /**
   * Handle DM creation
   */
  async handleDMCreate(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const username = formData.get("dmUserId");

    try {
      const result = await chatManager.createDirectMessage(username);

      if (result.success) {
        this.closeModal();
        await this.loadRooms();
        // Select the new room
        this.selectRoom(result.room.id);
      } else {
        this.showError(result.error);
      }
    } catch (error) {
      this.showError("Failed to create DM: " + error.message);
    }
  }

  /**
   * Handle group creation
   */
  async handleGroupCreate(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const name = formData.get("groupName");
    const users = formData.get("groupUsers").split(",").map(u => u.trim()).filter(u => u);

    try {
      const result = await chatManager.createGroupRoom(name, users);

      if (result.success) {
        this.closeModal();
        await this.loadRooms();
        // Select the new room
        this.selectRoom(result.room.id);
      } else {
        this.showError(result.error);
      }
    } catch (error) {
      this.showError("Failed to create group: " + error.message);
    }
  }

  /**
   * Handle send message
   */
  async handleSendMessage(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const content = formData.get("messageInput").trim();

    if (!content) return;

    try {
      const result = await chatManager.sendMessage(content);

      if (result.success) {
        // Clear input
        e.target.reset();
        
        // Refresh messages immediately to show the sent message
        setTimeout(() => {
          this.loadRoomMessages(chatManager.currentRoomId);
        }, 500);
      } else {
        this.showError(result.error);
      }
    } catch (error) {
      this.showError("Failed to send message: " + error.message);
    }
  }

  /**
   * Load rooms
   */
  async loadRooms() {
    try {
      const rooms = chatManager.getRooms();
      this.renderRooms(rooms);
    } catch (error) {
      console.error("Failed to load rooms:", error);
    }
  }

  /**
   * Render rooms list
   */
  renderRooms(rooms) {
    const roomsList = document.getElementById("roomsList");
    if (!roomsList) return;

    roomsList.innerHTML = "";

    if (!rooms || rooms.length === 0) {
      roomsList.innerHTML = `
        <div style="padding: 2rem; text-align: center; color: var(--text-secondary);">
          <p>No chats yet</p>
          <p style="font-size: 0.875rem; margin-top: 0.5rem;">Click the ➕ button to start a new chat</p>
        </div>
      `;
      return;
    }

    rooms.forEach(room => {
      const roomElement = document.createElement("div");
      roomElement.className = "room-item";
      roomElement.dataset.roomId = room.id;
      roomElement.onclick = () => this.selectRoom(room.id);

      roomElement.innerHTML = `
        <div class="room-avatar"></div>
        <div class="room-info">
          <div class="room-name">${room.name || "Unnamed Room"}</div>
          <div class="room-last-message">${room.lastMessage || ""}</div>
        </div>
        ${room.unreadCount > 0 ? `<div class="unread-badge">${room.unreadCount}</div>` : ""}
      `;

      roomsList.appendChild(roomElement);
    });
  }

  /**
   * Select room
   */
  selectRoom(roomId) {
    // Update UI
    const roomItems = document.querySelectorAll(".room-item");
    roomItems.forEach(item => item.classList.remove("active"));

    const activeItem = document.querySelector(`.room-item[data-room-id="${roomId}"]`);
    if (activeItem) {
      activeItem.classList.add("active");
    }

    // Load room messages
    chatManager.currentRoomId = roomId;
    this.loadRoomMessages(roomId);
  }

  /**
   * Load room messages
   */
  async loadRoomMessages(roomId) {
    try {
      const messages = await dbService.getMessagesByRoom(roomId);
      this.renderMessages(messages);

      // Update chat header
      const room = await chatManager.getRoom(roomId);
      const chatTitle = document.getElementById("chatTitle");
      const chatSubtitle = document.getElementById("chatSubtitle");

      if (chatTitle) chatTitle.textContent = room.name || "Unnamed Room";
      if (chatSubtitle) chatSubtitle.textContent = `${room.participants?.length || 0} members`;

      // Show chat content
      const chatPlaceholder = document.getElementById("chatPlaceholder");
      const chatContent = document.getElementById("chatContent");

      if (chatPlaceholder) chatPlaceholder.style.display = "none";
      if (chatContent) chatContent.style.display = "flex";
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
  }

  /**
   * Render messages
   */
  renderMessages(messages) {
    const messagesList = document.getElementById("messagesList");
    if (!messagesList) return;

    messagesList.innerHTML = "";
    
    console.log("Rendering messages, current user ID:", authHandler.currentUser?.userId);

    messages.forEach(message => {
      console.log("Message senderId:", message.senderId, "Current userId:", authHandler.currentUser?.userId);
      
      const messageElement = document.createElement("div");
      const isSent = message.senderId === authHandler.currentUser?.userId;
      messageElement.className = `message ${isSent ? "sent" : "received"}`;
      
      console.log("Message class:", messageElement.className);

      const timestamp = new Date(message.timestamp).toLocaleTimeString();

      messageElement.innerHTML = `
        <div class="message-content">
          <div class="message-text">${message.content || "[Unable to decrypt]"}</div>
          <div class="message-time">${timestamp}</div>
        </div>
      `;

      messagesList.appendChild(messageElement);
    });

    // Scroll to bottom
    const messagesContainer = document.getElementById("messagesContainer");
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  /**
   * Filter rooms
   */
  filterRooms(query) {
    const roomItems = document.querySelectorAll(".room-item");

    roomItems.forEach(item => {
      const roomName = item.querySelector(".room-name").textContent.toLowerCase();
      const shouldShow = roomName.includes(query.toLowerCase());
      item.style.display = shouldShow ? "flex" : "none";
    });
  }

  /**
   * Refresh messages
   */
  async refreshMessages() {
    if (chatManager.currentRoomId) {
      await this.loadRoomMessages(chatManager.currentRoomId);
    }
  }
}

// Create singleton instance
const app = new App();
