/**
 * TradeZone Chat Widget
 * Embeddable chat widget for any website
 *
 * Usage:
 * <script src="https://your-domain.com/widget/chat-widget.js"></script>
 * <script>
 *   TradeZoneChat.init({
 *     apiUrl: 'https://your-dashboard.com',
 *     position: 'bottom-right', // or 'bottom-left'
 *     primaryColor: '#2563eb',
 *     greeting: 'Hi! How can I help you today?'
 *   });
 * </script>
 */

(function () {
  "use strict";

  const TradeZoneChat = {
    config: {
      apiUrl: "",
      position: "bottom-right",
      primaryColor: "#2563eb",
      greeting: "Hi! How can I help you today?",
      botName: "Izacc",
      placeholder: "Type your message...",
    },

    sessionId: null,
    isOpen: false,
    messages: [],

    init: function (options) {
      // Merge config
      this.config = { ...this.config, ...options };

      // Generate session ID
      this.sessionId = this.generateSessionId();

      // Inject styles
      this.injectStyles();

      // Create widget HTML
      this.createWidget();

      // Attach event listeners
      this.attachEventListeners();

      console.log("[TradeZone Chat] Widget initialized", this.sessionId);
    },

    generateSessionId: function () {
      return "Guest-" + Math.floor(1000 + Math.random() * 9000);
    },

    injectStyles: function () {
      const styles = `
        #tradezone-chat-widget {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          position: fixed;
          ${this.config.position === "bottom-right" ? "right: 20px;" : "left: 20px;"}
          bottom: 20px;
          z-index: 999999;
        }

        #tradezone-chat-button {
          width: 60px;
          height: 60px;
          border-radius: 30px;
          background: ${this.config.primaryColor};
          border: none;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
        }

        #tradezone-chat-button:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 16px rgba(0,0,0,0.2);
        }

        #tradezone-chat-button svg {
          width: 28px;
          height: 28px;
          fill: white;
        }

        #tradezone-chat-window {
          display: none;
          position: fixed;
          ${this.config.position === "bottom-right" ? "right: 20px;" : "left: 20px;"}
          bottom: 90px;
          width: 380px;
          height: 600px;
          max-height: calc(100vh - 120px);
          background: white;
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.12);
          flex-direction: column;
          overflow: hidden;
        }

        #tradezone-chat-window.open {
          display: flex;
        }

        .tradezone-chat-header {
          background: ${this.config.primaryColor};
          color: white;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .tradezone-chat-header-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .tradezone-chat-avatar {
          width: 40px;
          height: 40px;
          border-radius: 20px;
          background: rgba(255,255,255,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 18px;
        }

        .tradezone-chat-header-text h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }

        .tradezone-chat-header-text p {
          margin: 2px 0 0 0;
          font-size: 12px;
          opacity: 0.9;
        }

        .tradezone-chat-close {
          background: none;
          border: none;
          color: white;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.8;
          transition: opacity 0.2s;
        }

        .tradezone-chat-close:hover {
          opacity: 1;
        }

        .tradezone-chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          background: #f9fafb;
        }

        .tradezone-chat-message {
          margin-bottom: 16px;
          display: flex;
          gap: 8px;
        }

        .tradezone-chat-message.user {
          flex-direction: row-reverse;
        }

        .tradezone-chat-message-avatar {
          width: 32px;
          height: 32px;
          border-radius: 16px;
          background: ${this.config.primaryColor};
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 600;
          flex-shrink: 0;
        }

        .tradezone-chat-message.user .tradezone-chat-message-avatar {
          background: #6b7280;
        }

        .tradezone-chat-message-bubble {
          max-width: 70%;
          padding: 10px 14px;
          border-radius: 12px;
          background: white;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
          font-size: 14px;
          line-height: 1.5;
        }

        .tradezone-chat-message.user .tradezone-chat-message-bubble {
          background: ${this.config.primaryColor};
          color: white;
        }

        .tradezone-chat-typing {
          display: none;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: white;
          border-radius: 12px;
          width: fit-content;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }

        .tradezone-chat-typing.active {
          display: flex;
        }

        .tradezone-chat-typing-dot {
          width: 8px;
          height: 8px;
          border-radius: 4px;
          background: #9ca3af;
          animation: typing 1.4s infinite;
        }

        .tradezone-chat-typing-dot:nth-child(2) {
          animation-delay: 0.2s;
        }

        .tradezone-chat-typing-dot:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes typing {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-10px); }
        }

        .tradezone-chat-input-container {
          padding: 16px;
          background: white;
          border-top: 1px solid #e5e7eb;
        }

        .tradezone-chat-input-wrapper {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .tradezone-chat-input {
          flex: 1;
          padding: 10px 14px;
          border: 1px solid #e5e7eb;
          border-radius: 20px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
        }

        .tradezone-chat-input:focus {
          border-color: ${this.config.primaryColor};
        }

        .tradezone-chat-send {
          width: 40px;
          height: 40px;
          border-radius: 20px;
          background: ${this.config.primaryColor};
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity 0.2s;
        }

        .tradezone-chat-send:hover {
          opacity: 0.9;
        }

        .tradezone-chat-send:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .tradezone-chat-send svg {
          width: 20px;
          height: 20px;
          fill: white;
        }

        .tradezone-chat-powered {
          text-align: center;
          padding: 8px;
          font-size: 11px;
          color: #9ca3af;
        }

        .tradezone-chat-powered a {
          color: ${this.config.primaryColor};
          text-decoration: none;
        }

        /* Mobile responsive */
        @media (max-width: 480px) {
          #tradezone-chat-window {
            width: calc(100vw - 40px);
            height: calc(100vh - 120px);
            right: 20px;
            left: 20px;
          }
        }
      `;

      const styleSheet = document.createElement("style");
      styleSheet.textContent = styles;
      document.head.appendChild(styleSheet);
    },

    createWidget: function () {
      const widget = document.createElement("div");
      widget.id = "tradezone-chat-widget";
      widget.innerHTML = `
        <button id="tradezone-chat-button" aria-label="Open chat">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
          </svg>
        </button>

        <div id="tradezone-chat-window">
          <div class="tradezone-chat-header">
            <div class="tradezone-chat-header-info">
              <div class="tradezone-chat-avatar">${this.config.botName[0]}</div>
              <div class="tradezone-chat-header-text">
                <h3>${this.config.botName}</h3>
                <p>Online • Ready to help</p>
              </div>
            </div>
            <button class="tradezone-chat-close" aria-label="Close chat">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <div class="tradezone-chat-messages" id="tradezone-chat-messages">
            <div class="tradezone-chat-message">
              <div class="tradezone-chat-message-avatar">${this.config.botName[0]}</div>
              <div class="tradezone-chat-message-bubble">${this.config.greeting}</div>
            </div>
            <div class="tradezone-chat-typing" id="tradezone-chat-typing">
              <div class="tradezone-chat-typing-dot"></div>
              <div class="tradezone-chat-typing-dot"></div>
              <div class="tradezone-chat-typing-dot"></div>
            </div>
          </div>

          <div class="tradezone-chat-input-container">
            <div class="tradezone-chat-input-wrapper">
              <input
                type="text"
                class="tradezone-chat-input"
                id="tradezone-chat-input"
                placeholder="${this.config.placeholder}"
                autocomplete="off"
              />
              <button class="tradezone-chat-send" id="tradezone-chat-send" aria-label="Send message">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              </button>
            </div>
            <div class="tradezone-chat-powered">
              Powered by <a href="https://tradezone.sg" target="_blank">TradeZone.sg</a>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(widget);
    },

    attachEventListeners: function () {
      const button = document.getElementById("tradezone-chat-button");
      const closeBtn = document.querySelector(".tradezone-chat-close");
      const input = document.getElementById("tradezone-chat-input");
      const sendBtn = document.getElementById("tradezone-chat-send");

      button.addEventListener("click", () => this.toggleChat());
      closeBtn.addEventListener("click", () => this.toggleChat());

      input.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });

      sendBtn.addEventListener("click", () => this.sendMessage());
    },

    toggleChat: function () {
      const window = document.getElementById("tradezone-chat-window");
      const button = document.getElementById("tradezone-chat-button");

      this.isOpen = !this.isOpen;

      if (this.isOpen) {
        window.classList.add("open");
        button.style.display = "none";
        document.getElementById("tradezone-chat-input").focus();
      } else {
        window.classList.remove("open");
        button.style.display = "flex";
      }
    },

    sendMessage: async function () {
      const input = document.getElementById("tradezone-chat-input");
      const message = input.value.trim();

      if (!message) return;

      // Add user message to UI
      this.addMessage(message, "user");
      input.value = "";

      // Show typing indicator
      this.showTyping(true);

      try {
        // Send to API
        const response = await fetch(
          `${this.config.apiUrl}/api/chatkit/agent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": this.config.apiKey || "",
            },
            body: JSON.stringify({
              sessionId: this.sessionId,
              message: message,
            }),
          },
        );

        const data = await response.json();

        // Hide typing indicator
        this.showTyping(false);

        // Add bot response
        if (data.response) {
          this.addMessage(data.response, "assistant");
        } else {
          this.addMessage(
            "Sorry, I encountered an error. Please try again.",
            "assistant",
          );
        }
      } catch (error) {
        console.error("[TradeZone Chat] Error:", error);
        this.showTyping(false);
        this.addMessage(
          "Sorry, I'm having trouble connecting. Please try again later.",
          "assistant",
        );
      }
    },

    addMessage: function (text, role) {
      const messagesContainer = document.getElementById(
        "tradezone-chat-messages",
      );
      const messageDiv = document.createElement("div");
      messageDiv.className = `tradezone-chat-message ${role}`;

      const avatar = role === "user" ? "U" : this.config.botName[0];

      messageDiv.innerHTML = `
        <div class="tradezone-chat-message-avatar">${avatar}</div>
        <div class="tradezone-chat-message-bubble">${this.escapeHtml(text)}</div>
      `;

      // Insert before typing indicator
      const typingIndicator = document.getElementById("tradezone-chat-typing");
      messagesContainer.insertBefore(messageDiv, typingIndicator);

      // Scroll to bottom
      messagesContainer.scrollTop = messagesContainer.scrollHeight;

      // Store message
      this.messages.push({ role, text, timestamp: new Date() });
    },

    showTyping: function (show) {
      const typing = document.getElementById("tradezone-chat-typing");
      if (show) {
        typing.classList.add("active");
      } else {
        typing.classList.remove("active");
      }

      // Scroll to bottom
      const messagesContainer = document.getElementById(
        "tradezone-chat-messages",
      );
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    },

    escapeHtml: function (text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    },
  };

  // Expose to global scope
  window.TradeZoneChat = TradeZoneChat;

  // Auto-initialize if data attributes are present
  document.addEventListener("DOMContentLoaded", function () {
    const script = document.querySelector('script[src*="chat-widget.js"]');
    if (script) {
      const apiUrl = script.getAttribute("data-api-url");
      const position = script.getAttribute("data-position");
      const primaryColor = script.getAttribute("data-primary-color");

      if (apiUrl) {
        TradeZoneChat.init({
          apiUrl: apiUrl,
          position: position || "bottom-right",
          primaryColor: primaryColor || "#2563eb",
        });
      }
    }
  });
})();
