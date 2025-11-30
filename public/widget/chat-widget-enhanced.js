/**
 * TradeZone Enhanced Chat Widget
 * Version: 2.1.0 - Desktop Centered + Mobile Corner
 * Full-featured chat widget with text, voice, and video avatar
 *
 * Features:
 * - Text chat with typing indicators
 * - Voice chat (GPT Realtime)
 * - Video avatar/hero section
 * - Call button for voice mode
 * - Responsive design
 * - Desktop: Centered with backdrop overlay
 * - Mobile: Bottom-right corner (traditional chat widget)
 *
 * Usage:
 * <script src="https://your-domain.com/widget/chat-widget-enhanced.js?v=2.1"></script>
 * <script>
 *   TradeZoneChatEnhanced.init({
 *     apiUrl: 'https://your-dashboard.com',
 *     position: 'bottom-right',
 *     primaryColor: '#2563eb',
 *     videoUrl: 'https://your-domain.com/avatar-video.mp4'
 *   });
 * </script>
 */

(function () {
  "use strict";

  const TradeZoneChatEnhanced = {
    config: {
      apiUrl: "",
      position: "bottom-right",
      primaryColor: "#8b5cf6", // TradeZone purple
      secondaryColor: "#6d28d9",
      accentColor: "#a78bfa",
      darkBg: "#1a1a2e",
      greeting: "Hi! How can I help you today?",
      botName: "Amara",
      botSubtitle: "AI Assistant",
      placeholder: "Ask about products, prices, trade-ins...",
      videoUrl: "", // Optional hero video
      enableVoice: true,
      enableVideo: true,
      // Appwrite Storage Configuration
      appwrite: {
        endpoint: "https://studio.getrezult.com/v1",
        projectId: "68e9c230002bf8a2f26f",
        bucketId: "68e9c23f002de06d1e68",
      },
    },

    sessionId: null,
    clientId: null, // Persistent client identifier
    isOpen: false,
    messages: [],
    mode: "text", // 'text' or 'voice'
    currentTranscript: "",
    currentImage: null, // Store selected image as base64
    typingIndicatorEl: null,
    viewportHandler: null,
    voiceState: {
      sessionId: null,
      isRecording: false,
      ws: null,
      audioContext: null,
      mediaStream: null,
      processor: null,
      playbackContext: null,
      playbackNode: null,
      audioQueue: [],
      isResponding: false,
    },
    voicePendingUserTranscript: null,
    voicePendingAssistantTranscript: "",
    voicePendingLinksMarkdown: null,
    voiceTurnStartedAt: 0,
    tradeInKeywordPatterns: [
      /\btrade[- ]?in\b/i,
      /\bbuy[- ]?back\b/i,
      /\btrade[- ]?up\b/i,
      /\bupgrade\b/i,
      /\bquote\b/i,
      /\boffer\b/i,
      /\bvaluation\b/i,
      /\bpayout\b/i,
      /\bsell (my|the|this)\b/i,
      /\binstant cash\b/i,
    ],
    tradeInDeviceHints:
      /\b(ps ?5|ps ?4|playstation|xbox|switch|steam deck|rog ally|legion go|msi claw|meta quest|quest 3|iphone|ipad|samsung|mobile phone|console|handheld)\b/i,
    tradeInActionHints:
      /\b(trade|tra[iy]n|sell|worth|value|price|quote|offer|payout|buy[- ]?back)\b/i,
    tradeInNoMatchGuidance: [
      "TRADE_IN_NO_MATCH",
      "No trade-in pricing data found for this item in our catalog.",
      "Next steps:",
      "- Confirm the caller is in Singapore before continuing.",
      '- Let them know we need a manual review: "We don\'t have this device in our system yet. Want me to have TradeZone staff review it?"',
      "- Keep saving any trade-in details with tradein_update_lead.",
      '- If they confirm, collect name, phone, and email, then call sendemail with emailType:"contact" and include a note like "Manual trade-in review needed" plus the device details.',
      "- If they decline, explain we currently only accept the models listed on TradeZone.sg, and offer to check other items.",
    ].join("\n"),
    voiceStopWords: new Set([
      "a",
      "an",
      "the",
      "and",
      "or",
      "of",
      "any",
      "thanks",
      "thank",
      "you",
      "please",
      "need",
      "want",
      "got",
      "have",
      "for",
      "like",
      "just",
      "that",
      "this",
      "those",
      "these",
    ]),
    voicePlatformHints: [
      { regex: /\bps5\b|playstation 5/i, keyword: "PS5" },
      { regex: /\bps4\b|playstation 4/i, keyword: "PS4" },
      { regex: /xbox series x|\bseries x\b/i, keyword: "Xbox Series X" },
      { regex: /xbox series s|\bseries s\b/i, keyword: "Xbox Series S" },
      { regex: /nintendo switch|\bswitch\b/i, keyword: "Switch" },
      { regex: /steam deck/i, keyword: "Steam Deck" },
    ],
    voiceSportHints: [
      { regex: /basketball/i, tokens: ["nba", "nba 2k", "2k"] },
      {
        regex: /football|soccer|fifa|fc ?24|ea sports fc/i,
        tokens: ["fifa", "fc 24", "ea sports fc", "football"],
      },
      {
        regex: /wrestling|wwe|wwf| smackdown/i,
        tokens: ["wwe", "wrestling", "2k"],
      },
    ],

    init: function (options) {
      this.config = { ...this.config, ...options };
      this.clientId = this.getOrCreateClientId();
      this.sessionId = this.getOrCreateSessionId();

      // Ensure viewport meta tag for mobile
      this.ensureViewport();

      this.injectStyles();
      this.createWidget();
      this.attachEventListeners();
      this.registerViewportListeners();
      this.updateWidgetHeight(); // Set initial height

      console.log(
        "[TradeZone Chat Enhanced] Widget initialized",
        this.sessionId,
      );
    },

    detectTradeInIntent: function (query) {
      const normalized = (query || "").trim();
      if (!normalized) return false;

      if (
        this.tradeInKeywordPatterns.some((pattern) => pattern.test(normalized))
      ) {
        return true;
      }

      return (
        this.tradeInDeviceHints.test(normalized) &&
        this.tradeInActionHints.test(normalized)
      );
    },

    buildVoiceSearchContext: function (queryText) {
      const transcript = (this.voicePendingUserTranscript || "").toLowerCase();
      const normalizedQuery = (queryText || "").toLowerCase();
      let refinedQuery = queryText.trim();
      const platforms = [];
      const sportTokens = new Set();

      this.voicePlatformHints.forEach(({ regex, keyword }) => {
        if (regex.test(transcript) || regex.test(normalizedQuery)) {
          const keywordLower = keyword.toLowerCase();
          if (!normalizedQuery.includes(keywordLower)) {
            refinedQuery = `${refinedQuery} ${keyword}`.trim();
          }
          platforms.push(keywordLower);
        }
      });

      this.voiceSportHints.forEach(({ regex, tokens }) => {
        if (regex.test(transcript) || regex.test(normalizedQuery)) {
          tokens.forEach((t) => sportTokens.add(t.toLowerCase()));
        }
      });

      if (sportTokens.size) {
        refinedQuery = `${refinedQuery} ${Array.from(sportTokens).join(" ")}`.trim();
      }

      const extraKeywords = new Set();
      const combined = `${normalizedQuery} ${transcript}`.trim();
      combined
        .split(/[^a-z0-9+]+/i)
        .filter((token) => {
          if (!token) return false;
          const lower = token.toLowerCase();
          if (lower.length < 3) return false;
          if (this.voiceStopWords.has(lower)) return false;
          return true;
        })
        .slice(0, 6)
        .forEach((token) => {
          const lower = token.toLowerCase();
          if (!normalizedQuery.includes(lower)) {
            refinedQuery = `${refinedQuery} ${token}`.trim();
          }
          extraKeywords.add(lower);
        });

      platforms.forEach((platform) => extraKeywords.add(platform));
      sportTokens.forEach((token) => extraKeywords.add(token));

      return {
        refinedQuery: refinedQuery.trim(),
        keywords: Array.from(extraKeywords),
      };
    },

    waitForStableTranscript: async function (initialTranscript) {
      let last = initialTranscript || "";
      const deadline = Date.now() + 1200;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 200));
        const current = (this.voicePendingUserTranscript || "").trim();
        if (current && current !== last) {
          last = current;
          continue;
        }
        if (Date.now() - deadline < -600) {
          // allow a short extra wait for completion words
          continue;
        }
        break;
      }
      return last;
    },

    filterMatchesByVoiceContext: function (matches, context) {
      if (!Array.isArray(matches) || !matches.length) return [];
      if (!context || !context.keywords.length) return matches;
      return matches.filter((match) => {
        const text = this.normalizeMatchText(match);
        if (!text) return false;
        return context.keywords.every((keyword) => text.includes(keyword));
      });
    },

    normalizeMatchText: function (match) {
      const chunks = [];
      if (match?.name) chunks.push(match.name);
      if (match?.familyTitle) chunks.push(match.familyTitle);
      if (match?.price) chunks.push(String(match.price));
      if (match?.description) chunks.push(match.description);
      if (Array.isArray(match?.categories)) chunks.push(match.categories.join(" "));
      return chunks
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    },

    buildVoiceProductSummary: function (matches) {
      if (!Array.isArray(matches) || !matches.length) return "";
      const lines = matches.slice(0, 4).map((match, index) => {
        const priceLabel =
          match?.flagshipCondition?.basePrice !== undefined &&
          match?.flagshipCondition?.basePrice !== null
            ? `S$${Math.round(match.flagshipCondition.basePrice)}`
            : match?.price
              ? match.price.toString().replace(/^(s\$)?/i, "S$")
              : "Price on request";
        return `${index + 1}. ${match?.name || "Product"} — ${priceLabel}`;
      });
      return lines.join("\n\n");
    },

    clearAssistantAudio: function () {
      this.audioQueue = [];
      this.currentTranscript = "";
      this.voicePendingAssistantTranscript = "";
      this.voicePendingLinksMarkdown = null;
      if (this.playbackContext) {
        try {
          const ctx = this.playbackContext;
          if (this.playbackNode) {
            this.playbackNode.disconnect();
            ctx.resume().then(() => {
              // Reconnect node to keep future playback working
              try {
                this.playbackNode.connect(ctx.destination);
              } catch (err) {
                console.warn("[Voice] Failed to reconnect playback node", err);
              }
            });
          } else {
            ctx.suspend().then(() => ctx.resume());
          }
        } catch (err) {
          console.warn("[Voice] Failed to reset playback context", err);
        }
      }
    },

    updateWidgetHeight: function () {
      const viewport = window.visualViewport;
      const height = viewport ? viewport.height : window.innerHeight;
      if (!height) return;
      document.documentElement.style.setProperty(
        "--tz-widget-height",
        `${Math.round(height)}px`,
      );
    },

    ensureViewport: function () {
      // Check if viewport meta tag exists
      let viewport = document.querySelector('meta[name="viewport"]');
      if (!viewport) {
        viewport = document.createElement("meta");
        viewport.name = "viewport";
        viewport.content =
          "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
        document.head.appendChild(viewport);
        console.log("[TradeZone Chat] Added viewport meta tag for mobile");
      }
    },

    registerViewportListeners: function () {
      if (this.viewportHandler) return;
      const handler = () => this.updateWidgetHeight();
      this.viewportHandler = handler;
      window.addEventListener("resize", handler, { passive: true });
      window.addEventListener("orientationchange", handler);
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", handler);
        window.visualViewport.addEventListener("scroll", handler);
      }
    },

    // Get or create persistent client ID (survives page reloads)
    getOrCreateClientId: function () {
      const STORAGE_KEY = "tz_client_id";
      try {
        let clientId = localStorage.getItem(STORAGE_KEY);
        if (!clientId) {
          // Generate UUID-like ID
          clientId =
            "client_" +
            Date.now() +
            "_" +
            Math.random().toString(36).substr(2, 9);
          localStorage.setItem(STORAGE_KEY, clientId);
          console.log("[TradeZone] New client ID created:", clientId);
        }
        return clientId;
      } catch (e) {
        // Fallback if localStorage blocked (incognito/privacy mode)
        console.warn(
          "[TradeZone] localStorage unavailable, using session-only ID",
        );
        return "client_temp_" + Date.now();
      }
    },

    // Get or create session ID (tied to client ID)
    getOrCreateSessionId: function () {
      const STORAGE_KEY = "tz_session_id";
      const EXPIRY_KEY = "tz_session_expiry";
      const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

      try {
        let sessionId = localStorage.getItem(STORAGE_KEY);
        let expiry = localStorage.getItem(EXPIRY_KEY);

        // Check if session expired
        if (sessionId && expiry && Date.now() < parseInt(expiry)) {
          console.log("[TradeZone] Resuming session:", sessionId);
          this.loadHistoryFromStorage();
          return sessionId;
        }

        // Create new session
        sessionId = this.clientId + "_" + Date.now();
        localStorage.setItem(STORAGE_KEY, sessionId);
        localStorage.setItem(
          EXPIRY_KEY,
          (Date.now() + SESSION_DURATION).toString(),
        );
        console.log("[TradeZone] New session created:", sessionId);
        return sessionId;
      } catch (e) {
        console.warn(
          "[TradeZone] localStorage unavailable, using temp session",
        );
        return "session_temp_" + Date.now();
      }
    },

    // Load chat history from localStorage
    loadHistoryFromStorage: function () {
      const HISTORY_KEY = "tz_chat_history";
      try {
        const stored = localStorage.getItem(HISTORY_KEY);
        if (stored) {
          this.messages = JSON.parse(stored);
          console.log(
            "[TradeZone] Loaded",
            this.messages.length,
            "messages from storage",
          );
        }
      } catch (e) {
        console.warn("[TradeZone] Failed to load history:", e);
        this.messages = [];
      }
    },

    // Save chat history to localStorage
    saveHistoryToStorage: function () {
      const HISTORY_KEY = "tz_chat_history";
      const MAX_MESSAGES = 50; // Limit storage size
      try {
        // Keep only last N messages
        const toSave = this.messages.slice(-MAX_MESSAGES);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(toSave));
      } catch (e) {
        console.warn("[TradeZone] Failed to save history:", e);
      }
    },

    // Clear session and start fresh
    clearSession: function () {
      try {
        localStorage.removeItem("tz_session_id");
        localStorage.removeItem("tz_session_expiry");
        localStorage.removeItem("tz_chat_history");
        this.messages = [];
        this.sessionId = this.getOrCreateSessionId();
        console.log(
          "[TradeZone] Session cleared, new session:",
          this.sessionId,
        );
      } catch (e) {
        console.warn("[TradeZone] Failed to clear session:", e);
      }
    },

    injectStyles: function () {
      const styles = `
        /* Base Widget Styles */
        #tz-chat-widget {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          position: fixed;
          ${
            this.config.position === "bottom-right"
              ? "right: calc(env(safe-area-inset-right, 0px) + 20px);"
              : "left: calc(env(safe-area-inset-left, 0px) + 20px);"
          }
          bottom: calc(env(safe-area-inset-bottom, 0px) + 20px);
          z-index: 999999;
        }

        #tz-chat-button {
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

        #tz-chat-button:hover {
          transform: scale(1.1);
        }

        #tz-chat-button svg {
          width: 28px !important;
          height: 28px !important;
          fill: white !important;
          display: block !important;
          stroke: none !important;
        }

        /* Backdrop overlay */
        #tz-chat-backdrop {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(4px);
          z-index: 999997;
          animation: tzFadeIn 0.2s ease;
        }

        #tz-chat-backdrop.open {
          display: block;
        }

        @keyframes tzFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

                        #tz-chat-window {
                          display: none;
                          position: fixed;
                          right: 20px;
                          bottom: 100px; /* Position above the button */
                          width: 90vw;
                          max-width: 450px;
                          height: 85vh;
                          max-height: 700px;
                          background: transparent;
                          border-radius: 12px;
                          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                          flex-direction: column;
                          overflow: hidden;
                          border: 1px solid rgba(139, 92, 246, 0.3);
                          z-index: 999998;
                          margin: 0;
                          padding: 0;
                          animation: tzSlideInCorner 0.3s ease;
                          transform-origin: bottom right;
                        }

                        @keyframes tzSlideIn {
                          from {
                            opacity: 0;
                            transform: translate(-50%, -45%);
                          }
                          to {
                            opacity: 1;
                            transform: translate(-50%, -50%);
                          }
                        }

                        @keyframes tzSlideInCorner {
                          from {
                            opacity: 0;
                            transform: translateY(15px) scale(0.98);
                          }
                          to {
                            opacity: 1;
                            transform: translateY(0) scale(1);
                          }
                        }        /* Prevent body scroll when widget open */
        body.tz-widget-open {
          overflow: hidden !important;
          position: fixed !important;
          width: 100% !important;
          height: 100% !important;
        }

        #tz-chat-window.open {
          display: flex;
        }

        /* Hero/Video Section */
        .tz-chat-hero {
          position: relative;
          height: 175px;
          background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
          overflow: hidden;
          flex-shrink: 0;
        }

        /* Subtle particle effect */
        .tz-particles {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 1;
        }

        .tz-particle {
          position: absolute;
          width: 4px;
          height: 4px;
          background: rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          animation: float 8s infinite ease-in-out;
        }

        .tz-particle:nth-child(1) { left: 10%; animation-delay: 0s; animation-duration: 7s; }
        .tz-particle:nth-child(2) { left: 25%; animation-delay: 1s; animation-duration: 9s; }
        .tz-particle:nth-child(3) { left: 40%; animation-delay: 2s; animation-duration: 6s; }
        .tz-particle:nth-child(4) { left: 60%; animation-delay: 0.5s; animation-duration: 8s; }
        .tz-particle:nth-child(5) { left: 75%; animation-delay: 1.5s; animation-duration: 7.5s; }
        .tz-particle:nth-child(6) { left: 90%; animation-delay: 2.5s; animation-duration: 8.5s; }

        @keyframes float {
          0%, 100% {
            transform: translateY(100%) translateX(0) scale(1);
            opacity: 0;
          }
          10% {
            opacity: 0.3;
          }
          50% {
            transform: translateY(-50%) translateX(20px) scale(1.2);
            opacity: 0.5;
          }
          90% {
            opacity: 0.3;
          }
        }

        .tz-chat-hero video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .tz-chat-hero-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          padding: 16px 20px;
          color: white;
        }

        .tz-chat-hero-title {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          font-size: 24px !important;
          font-weight: 700 !important;
          margin: 0 0 4px 0 !important;
          text-shadow: 0 2px 8px rgba(0,0,0,0.8) !important;
          opacity: 0.9 !important;
        }

        .tz-chat-hero-subtitle {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          font-size: 14px !important;
          margin: 0 !important;
          opacity: 0.9 !important;
          text-shadow: 0 2px 8px rgba(0,0,0,0.8) !important;
        }

        .tz-chat-close {
          position: absolute;
          bottom: 20px;
          right: 20px;
          background: transparent;
          border: none;
          border-radius: 50%;
          width: 44px;
          height: 44px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          transition: background 0.2s;
          z-index: 10;
          pointer-events: auto !important;
        }

        .tz-chat-close svg {
          width: 20px !important;
          height: 20px !important;
          display: block !important;
          stroke: white !important;
          stroke-width: 2 !important;
          fill: none !important;
        }

        .tz-chat-close:hover {
          background: rgba(139, 92, 246, 0.3);
        }

        .tz-position-controls {
          position: absolute;
          top: 12px;
          left: 12px;
          display: flex;
          gap: 4px;
          z-index: 10;
        }

        .tz-position-btn {
          background: rgba(0,0,0,0.3);
          border: none;
          border-radius: 4px;
          width: 24px;
          height: 24px;
          cursor: pointer;
          color: white;
          font-size: 10px;
          transition: background 0.2s;
        }

        .tz-position-btn:hover {
          background: rgba(139, 92, 246, 0.5);
        }

        .tz-position-btn.active {
          background: rgba(139, 92, 246, 0.8);
        }

        /* Mode Toggle */
        .tz-chat-mode-toggle {
          display: flex;
          gap: 8px;
          padding: 12px 16px;
          background: #16162a;
          border-bottom: 1px solid rgba(139, 92, 246, 0.1);
        }

        .tz-mode-btn {
          flex: 1;
          padding: 8px 16px;
          border: 1px solid rgba(139, 92, 246, 0.2);
          background: rgba(139, 92, 246, 0.05);
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          color: #9ca3af;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }

        .tz-mode-btn:hover {
          border-color: ${this.config.primaryColor};
        }

        .tz-mode-btn.active {
          background: linear-gradient(135deg, ${this.config.primaryColor} 0%, ${this.config.secondaryColor} 100%);
          color: white;
          border-color: ${this.config.primaryColor};
        }

        .tz-mode-btn svg {
          width: 16px !important;
          height: 16px !important;
          display: inline-block !important;
          fill: currentColor !important;
        }

        /* Messages Area */
        .tz-chat-body {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
          background: #1a1a2e;
        }

        .tz-chat-content {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
          background: #1a1a2e;
        }

        .tz-chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          background: #1a1a2e;
          min-height: 150px;
        }

        .tz-chat-message {
          margin-bottom: 12px;
          display: flex;
          gap: 8px;
          animation: messageSlide 0.3s ease;
        }

        @keyframes messageSlide {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .tz-chat-message.user {
          flex-direction: row-reverse;
        }

        .tz-chat-message-avatar {
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

        .tz-chat-message.user .tz-chat-message-avatar {
          background: #6b7280;
        }

        .tz-chat-message-bubble {
          max-width: 70%;
          padding: 10px 14px;
          border-radius: 10px;
          background: rgba(139, 92, 246, 0.1);
          border: 1px solid rgba(139, 92, 246, 0.2);
          color: #e5e7eb;
          font-size: 14px;
          line-height: 1.6;
          word-wrap: break-word;
        }

        .tz-chat-message.typing .tz-chat-message-bubble {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #c7d2fe;
          font-size: 13px;
          font-weight: 500;
        }

        .tz-typing-indicator-content {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .tz-typing-indicator-content .tz-typing-label {
          letter-spacing: 0.01em;
        }

        .tz-typing-dots {
          display: inline-flex;
          gap: 4px;
        }

        .tz-typing-dots span {
          width: 6px;
          height: 6px;
          background: rgba(199, 210, 254, 0.85);
          border-radius: 50%;
          animation: tzTypingBounce 1.2s infinite ease-in-out;
        }

        .tz-typing-dots span:nth-child(2) {
          animation-delay: 0.15s;
        }

        .tz-typing-dots span:nth-child(3) {
          animation-delay: 0.3s;
        }

        @keyframes tzTypingBounce {
          0%, 80%, 100% {
            transform: scale(0.6);
            opacity: 0.6;
          }
          40% {
            transform: scale(1);
            opacity: 1;
          }
        }

        .tz-chat-message.user .tz-chat-message-bubble {
          background: linear-gradient(135deg, ${this.config.primaryColor} 0%, ${this.config.secondaryColor} 100%);
          border-color: ${this.config.primaryColor};
          color: white;
        }

        .tz-chat-message-bubble a {
          color: #a78bfa;
          text-decoration: underline;
          transition: color 0.2s;
          word-break: break-word;
          display: inline-block;
          margin: 4px 0;
        }

        .tz-chat-message-bubble a:hover {
          color: #c4b5fd;
        }

        .tz-chat-message-bubble p {
          margin: 8px 0;
          line-height: 1.6;
        }

        .tz-chat-message-bubble ul,
        .tz-chat-message-bubble ol {
          margin: 8px 0;
          padding-left: 20px;
        }

        .tz-chat-message-bubble li {
          margin: 4px 0;
        }

        .tz-chat-message-bubble img {
          max-width: 100%;
          border-radius: 8px;
          margin-top: 8px;
          display: block;
        }

        .tz-chat-message-bubble strong {
          font-weight: 600;
          color: #fff;
        }

        /* Voice Mode */
        .tz-voice-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 20px;
          gap: 16px;
          flex: 1;
          min-height: 0;
        }

                .tz-voice-container.hidden { display: none !important; }

        .tz-voice-footer {
          width: 100%;
          display: flex;
          justify-content: center;
        }

        .tz-voice-footer-inner {
          width: 100%;
          max-width: 360px;
          display: flex;
          gap: 8px;
          align-items: center;
          justify-content: center;
        }

        .tz-voice-attachment {
          margin-top: 12px;
          display: none;
          align-items: center;
          gap: 12px;
          background: rgba(12, 12, 24, 0.75);
          border: 1px solid rgba(167, 139, 250, 0.35);
          border-radius: 12px;
          padding: 10px 12px;
        }

        .tz-voice-attachment img {
          width: 56px;
          height: 56px;
          object-fit: cover;
          border-radius: 8px;
          border: 1px solid rgba(167, 139, 250, 0.35);
        }

        .tz-voice-attachment-meta {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .tz-voice-attachment-label {
          font-size: 12px;
          color: #e5e7eb;
        }

        .tz-voice-remove-image {
          background: transparent;
          border: none;
          color: #fca5a5;
          font-size: 12px;
          text-align: left;
          padding: 0;
          cursor: pointer;
        }

        .tz-voice-remove-image:hover {
          text-decoration: underline;
        }

         .tz-voice-actions {
          display: contents;
        }

        .tz-voice-actions .tz-chat-attach {
          width: 40px;
          height: 40px;
          flex: 0 0 auto;
        }

        .tz-voice-note {
          flex: 1 1 180px;
          min-width: 150px;
          max-width: 220px;
          border-radius: 9999px;
          border: 1px solid rgba(139, 92, 246, 0.25);
          background: rgba(12, 12, 24, 0.6);
          color: #fff;
          padding: 0 14px;
          height: 40px;
          font-size: 14px;
        }

        .tz-voice-note::placeholder {
          color: rgba(255, 255, 255, 0.6);
        }

        .tz-voice-note:focus {
          outline: none;
          border-color: ${this.config.primaryColor};
          box-shadow: 0 0 0 1px ${this.config.primaryColor}33;
        }

        .tz-voice-note-send {
          height: 40px;
          padding: 0 18px;
          border-radius: 9999px;
          border: none;
          background: ${this.config.primaryColor};
          color: #fff;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s, background 0.2s;
          flex: 0 0 auto;
        }

        .tz-voice-note-send:hover {
          transform: translateY(-1px);
          background: rgba(139, 92, 246, 0.9);
        }

        .tz-voice-button {
          width: 80px;
          height: 80px;
          aspect-ratio: 1 / 1;
          border-radius: 50%;
          background: linear-gradient(135deg, ${this.config.primaryColor} 0%, ${this.config.secondaryColor} 100%);
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s;
          box-shadow: 0 8px 24px rgba(139, 92, 246, 0.4);
          color: white;
        }

        .tz-voice-button:hover {
          transform: scale(1.05);
          box-shadow: 0 12px 32px rgba(139, 92, 246, 0.6);
        }

        .tz-voice-button:active {
          transform: scale(0.95);
        }

        .tz-voice-button.idle {
          animation: tzVoiceIdle 2s infinite;
        }

        .tz-voice-button.recording {
          animation: tzVoicePulse 1.5s infinite;
          background: #ef4444;
        }

        .tz-voice-button svg {
          width: 48px !important;
          height: 48px !important;
          display: block !important;
          fill: white !important;
        }

        @keyframes tzVoicePulse {
          0%, 100% { box-shadow: 0 8px 24px rgba(239, 68, 68, 0.4); }
          50% { box-shadow: 0 8px 32px rgba(239, 68, 68, 0.8); }
        }

        @keyframes tzVoiceIdle {
          0% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.35); transform: scale(1); }
          60% { box-shadow: 0 0 0 14px rgba(139, 92, 246, 0); transform: scale(1.02); }
          100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); transform: scale(1); }
        }

        .tz-voice-status {
          font-size: 16px;
          color: #9ca3af;
          text-align: center;
          font-weight: 500;
        }

        .tz-voice-transcript-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          color: #e5e7eb;
          font-size: 14px;
        }

        .tz-voice-transcript-toggle {
          background: rgba(139, 92, 246, 0.18);
          color: #c4b5fd;
          border: 1px solid rgba(139, 92, 246, 0.35);
          border-radius: 6px;
          padding: 6px 10px;
          font-size: 12px;
          cursor: pointer;
        }

        .tz-voice-transcript-toggle:hover {
          background: rgba(139, 92, 246, 0.28);
        }

        .tz-voice-transcript {
          flex-grow: 1;
          overflow-y: auto;
          width: 100%;
          padding: 12px;
          background: #16162a !important;
          border: 1px solid rgba(139, 92, 246, 0.2);
          border-radius: 8px;
          font-size: 14px;
          line-height: 1.6;
          color: #e5e7eb;
          max-height: 360px;
        }

        .tz-voice-transcript img {
          max-width: 150px;
          border-radius: 8px;
          margin: 8px 0;
          display: block;
          border: 1px solid rgba(139, 92, 246, 0.3);
        }

        .tz-voice-transcript a {
          color: #a78bfa;
          text-decoration: underline;
          word-break: break-word;
        }

        .tz-voice-transcript a:hover {
          color: #c4b5fd;
        }

        .tz-voice-transcript strong {
          color: #e5e7eb;
          font-weight: 600;
        }

        /* Input Area */
        .tz-chat-input-container {
          padding: 16px;
          background: #16162a;
          border-top: 1px solid rgba(139, 92, 246, 0.1);
        }

        .tz-chat-input-wrapper {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .tz-chat-attach {
          width: 40px;
          height: 40px;
          border-radius: 20px;
          background: rgba(139, 92, 246, 0.1);
          border: 1px solid rgba(139, 92, 246, 0.2);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          color: ${this.config.primaryColor};
        }

        .tz-chat-attach:hover {
          background: rgba(139, 92, 246, 0.2);
          border-color: ${this.config.primaryColor};
        }

        .tz-chat-attach svg {
          width: 20px !important;
          height: 20px !important;
          display: block !important;
        }

        .tz-chat-input {
          flex: 1;
          padding: 12px 16px;
          border: 1px solid rgba(139, 92, 246, 0.2);
          background: rgba(139, 92, 246, 0.05);
          border-radius: 20px;
          font-size: 15px;
          color: #e5e7eb;
          outline: none;
          transition: all 0.2s;
        }

        .tz-chat-input.is-disabled {
          opacity: 0.6;
          cursor: wait;
        }

        .tz-image-preview {
          margin-top: 8px;
          position: relative;
          display: inline-block;
        }

        .tz-image-preview img {
          max-width: 150px;
          max-height: 150px;
          border-radius: 8px;
          border: 1px solid rgba(139, 92, 246, 0.2);
        }

        .tz-remove-image {
          position: absolute;
          top: -8px;
          right: -8px;
          width: 24px;
          height: 24px;
          border-radius: 12px;
          background: #ef4444;
          border: none;
          color: white;
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .tz-remove-image:hover {
          background: #dc2626;
        }

        .tz-chat-input::placeholder {
          color: #6b7280;
        }

        .tz-chat-input:focus {
          border-color: ${this.config.primaryColor};
          background: rgba(139, 92, 246, 0.1);
        }

        .tz-chat-send {
          width: 40px;
          height: 40px;
          border-radius: 20px;
          background: linear-gradient(135deg, ${this.config.primaryColor} 0%, ${this.config.secondaryColor} 100%);
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
          transition: all 0.2s;
        }

        .tz-chat-send:hover {
          transform: scale(1.05);
          box-shadow: 0 6px 16px rgba(139, 92, 246, 0.5);
        }

        .tz-chat-send svg {
          width: 20px !important;
          height: 20px !important;
          fill: white !important;
          display: block !important;
        }

        .tz-chat-send:disabled {
          cursor: wait;
          opacity: 0.6;
          transform: none;
          box-shadow: none;
        }

        .tz-chat-send.is-sending svg {
          animation: tzRotate 1s linear infinite;
        }

        @keyframes tzRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Desktop (769px and up) - Centered */
        @media (min-width: 769px) {
          #tz-chat-window {
            left: 50%;
            top: 50%;
            right: auto;
            bottom: auto;
            transform: translate(-50%, -50%);
            animation-name: tzSlideIn;
            transform-origin: center center;
            width: 90vw;
            max-width: 450px;
            height: 85vh;
            max-height: 700px;
          }
        }

        /* Tablet portrait (601-768px) - Size adjustments */
        @media (max-width: 768px) and (min-width: 601px) {
          #tz-chat-window {
            width: 85vw;
            max-width: 500px;
            height: 80vh;
            max-height: 650px;
          }
        }

        /* Mobile (up to 600px) - Size adjustments */
        @media (max-width: 600px) {
          #tz-chat-window {
            width: 92vw;
            max-width: 420px;
            height: 75vh;
            max-height: none;
            border-radius: 16px;
          }

          #tz-chat-button {
            width: 56px;
            height: 56px;
          }

          .tz-chat-hero {
            flex-shrink: 0;
            height: min(200px, 28vh);
          }

          .tz-chat-hero-title {
            font-size: 20px;
          }

          .tz-chat-hero-subtitle {
            font-size: 13px;
          }

          .tz-chat-mode-toggle {
            padding: 10px 12px;
          }

          .tz-mode-btn {
            padding: 10px 12px;
            font-size: 13px;
          }

          .tz-mode-btn svg {
            width: 14px;
            height: 14px;
          }

          .tz-chat-messages {
            padding: 16px;
          }

          .tz-chat-message-bubble {
            max-width: 88%;
            font-size: 14px;
          }

        .tz-voice-container {
          padding: 16px 14px;
        }

        #tz-chat-window.tz-voice-compact .tz-voice-button {
          width: 56px;
          height: 56px;
          aspect-ratio: 1 / 1;
          position: absolute;
          top: 12px;
          right: 12px;
          box-shadow: 0 6px 16px rgba(0,0,0,0.35);
        }

          .tz-voice-button svg {
            width: 32px;
            height: 32px;
          }

          .tz-voice-status {
            font-size: 15px;
          }

          .tz-voice-container.hidden { display: none !important; }

        .tz-voice-transcript {
            font-size: 13px;
            max-height: 220px;
          }
        .tz-voice-transcript.expanded { max-height: 300px; }
        .tz-voice-transcript.collapsed { max-height: 60px; }

          .tz-chat-input-container {
            padding: 12px;
          }

          .tz-chat-input {
            font-size: 16px; /* Prevents zoom on iOS */
            padding: 12px 16px;
          }

          .tz-chat-send {
            width: 44px;
            height: 44px;
          }
        }

        /* Small mobile devices (up to 375px) */
        @media (max-width: 375px) {
          #tz-chat-window {
            width: 95vw;
            max-width: none;
            height: 88vh;
          }

          .tz-chat-hero {
            display: none;
          }

          .tz-voice-button {
            width: 58px;
            height: 58px;
            aspect-ratio: 1 / 1;
          }

          .tz-voice-button svg {
            width: 28px;
            height: 28px;
          }
        }

        /* Landscape mobile */
        @media (max-width: 768px) and (orientation: landscape) {
          .tz-chat-hero {
            height: 120px;
          }

          .tz-voice-container {
            padding: 20px 16px;
          }

          .tz-voice-container.hidden { display: none !important; }

        .tz-voice-transcript {
            max-height: 100px;
          }
        }

        /* Touch device optimizations */
        @media (hover: none) and (pointer: coarse) {
          .tz-mode-btn,
          .tz-chat-send,
          .tz-voice-button,
          .tz-chat-close {
            -webkit-tap-highlight-color: transparent;
            touch-action: manipulation;
          }

          .tz-mode-btn:active,
          .tz-chat-send:active,
          .tz-voice-button:active {
            transform: scale(0.95);
          }
        }
      `;

      const styleSheet = document.createElement("style");
      styleSheet.textContent = styles;
      document.head.appendChild(styleSheet);
    },

    createWidget: function () {
      const widget = document.createElement("div");
      widget.id = "tz-chat-widget";

      const videoHtml =
        this.config.enableVideo && this.config.videoUrl
          ? `
        <video autoplay loop muted playsinline style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0;">
          <source src="${this.config.videoUrl}" type="video/mp4">
        </video>
      `
          : "";

      if (this.config.enableVideo && this.config.videoUrl) {
        console.log("[Video] Enabled with URL:", this.config.videoUrl);
      } else {
        console.log("[Video] Disabled or no URL");
      }

      widget.innerHTML = `
        <button id="tz-chat-button" aria-label="Open chat">
          <svg viewBox="0 0 24 24">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
          </svg>
        </button>

        <div id="tz-chat-backdrop"></div>

        <div id="tz-chat-window">
          <div class="tz-chat-hero">
            ${videoHtml}
            <div class="tz-particles">
              <div class="tz-particle"></div>
              <div class="tz-particle"></div>
              <div class="tz-particle"></div>
              <div class="tz-particle"></div>
              <div class="tz-particle"></div>
              <div class="tz-particle"></div>
            </div>
            <div class="tz-chat-hero-overlay">
              <h3 class="tz-chat-hero-title">${this.config.botName}</h3>
              <p class="tz-chat-hero-subtitle">${this.config.botSubtitle}</p>
            </div>
            <button class="tz-chat-close" aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2"/>
              </svg>
            </button>
          </div>

          ${
            this.config.enableVoice
              ? `
          <div class="tz-chat-mode-toggle">
            <button class="tz-mode-btn active" data-mode="text">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
              </svg>
              Text
            </button>
            <button class="tz-mode-btn" data-mode="voice">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
              Voice
            </button>
          </div>
          `
              : ""
          }

          <div class="tz-chat-body" id="tz-chat-body">
            <div class="tz-chat-content" id="tz-chat-content">
              <div class="tz-chat-messages" id="tz-messages">
                <div class="tz-chat-message">
                  <div class="tz-chat-message-avatar">${this.config.botName[0]}</div>
                  <div class="tz-chat-message-bubble">${this.config.greeting}</div>
                </div>
              </div>
              <div class="tz-chat-input-container" id="tz-input-container">
                <div class="tz-chat-input-wrapper">
                  <button class="tz-chat-attach" id="tz-attach" title="Attach image">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                    </svg>
                  </button>
                  <input
                    type="file"
                    id="tz-file-input"
                    accept="image/*"
                    style="display: none;"
                  />
                  <input
                    type="text"
                    class="tz-chat-input"
                    id="tz-input"
                    placeholder="${this.config.placeholder}"
                  />
                  <button class="tz-chat-send" id="tz-send">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                    </svg>
                  </button>
                </div>
                <div id="tz-image-preview" class="tz-image-preview" style="display: none;">
                  <img id="tz-preview-img" src="" alt="Preview" />
                  <button class="tz-remove-image" id="tz-remove-image">×</button>
                </div>
              </div>
            </div>
            ${
              this.config.enableVoice
                ? `
            <div class="tz-voice-container hidden" id="tz-voice-container">
              <div class="tz-voice-status" id="tz-voice-status">Ready to start</div>
              <button class="tz-voice-button start" id="tz-voice-btn">
                <svg viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
              </button>
              <div class="tz-voice-transcript" id="tz-voice-transcript"></div>
              <div class="tz-voice-footer">
                <div class="tz-voice-footer-inner">
                  <button class="tz-chat-attach" id="tz-voice-attach" title="Attach image">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                    </svg>
                  </button>
                  <input
                    type="file"
                    id="tz-voice-file-input"
                    accept="image/*"
                    style="display: none;"
                  />
                  <input
                    type="text"
                    class="tz-voice-note"
                    id="tz-voice-note"
                    placeholder="Type a quick note (optional)"
                  />
                  <button class="tz-voice-note-send" id="tz-voice-note-send">Send note</button>
                </div>
                <div class="tz-voice-attachment" id="tz-voice-attachment">
                  <img id="tz-voice-preview-img" alt="Attachment preview" />
                  <div class="tz-voice-attachment-meta">
                    <span class="tz-voice-attachment-label" id="tz-voice-attachment-label">Photo ready to send</span>
                    <button class="tz-voice-remove-image" id="tz-voice-remove-image" type="button">Remove</button>
                  </div>
                </div>
              </div>
            </div>
            </div>
            `
                : ""
            }
          </div>
        </div>
      `;

      document.body.appendChild(widget);
    },

    // Render loaded history when widget opens
    renderLoadedHistory: function () {
      const container = document.getElementById("tz-messages");
      if (!container || this.messages.length === 0) return;

      // Clear existing messages (except greeting)
      container.innerHTML = `
        <div class="tz-chat-message">
          <div class="tz-chat-message-avatar">${this.config.botName[0]}</div>
          <div class="tz-chat-message-bubble">${this.config.greeting}</div>
        </div>
      `;

      // Render each message from history
      this.messages.forEach((msg) => {
        const div = document.createElement("div");
        div.className = `tz-chat-message ${msg.role}`;
        const formattedText =
          msg.role === "assistant"
            ? this.parseMarkdown(msg.content)
            : this.escapeHtml(msg.content);
        div.innerHTML = `
          <div class="tz-chat-message-avatar">${msg.role === "user" ? "U" : this.config.botName[0]}</div>
          <div class="tz-chat-message-bubble">${formattedText}</div>
        `;
        container.appendChild(div);
      });

      container.scrollTop = container.scrollHeight;
      console.log(
        "[TradeZone] Rendered",
        this.messages.length,
        "messages from history",
      );
    },

    attachEventListeners: function () {
      document
        .getElementById("tz-chat-button")
        .addEventListener("click", () => this.toggleChat());
      document
        .querySelector(".tz-chat-close")
        .addEventListener("click", () => this.toggleChat());
      document
        .querySelector(".tz-chat-close")
        .addEventListener("touchstart", () => this.toggleChat());
      document
        .getElementById("tz-chat-backdrop")
        .addEventListener("click", () => this.closeChat());
      window.addEventListener("popstate", () => this.closeChat());
      document.getElementById("tz-input").addEventListener("keypress", (e) => {
        if (e.key === "Enter") this.sendMessage();
      });
      document
        .getElementById("tz-send")
        .addEventListener("click", () => this.sendMessage());

      // File attachment
      document.getElementById("tz-attach").addEventListener("click", () => {
        document.getElementById("tz-file-input").click();
      });
      document
        .getElementById("tz-file-input")
        .addEventListener("change", (e) => this.handleFileSelect(e));
      document
        .getElementById("tz-remove-image")
        .addEventListener("click", () => this.removeImage());

      const voiceAttach = document.getElementById("tz-voice-attach");
      const voiceFileInput = document.getElementById("tz-voice-file-input");
      if (voiceAttach && voiceFileInput) {
        voiceAttach.addEventListener("click", () => voiceFileInput.click());
        voiceFileInput.addEventListener("change", (e) =>
          this.handleFileSelect(e),
        );
      }
      const voiceRemoveImage = document.getElementById("tz-voice-remove-image");
      if (voiceRemoveImage) {
        voiceRemoveImage.addEventListener("click", () => this.removeImage());
      }

      const voiceNoteSend = document.getElementById("tz-voice-note-send");
      const voiceNoteInput = document.getElementById("tz-voice-note");
      if (voiceNoteSend) {
        voiceNoteSend.addEventListener("click", () => this.sendVoiceNote());
      }
      if (voiceNoteInput) {
        voiceNoteInput.addEventListener("keypress", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            this.sendVoiceNote();
          }
        });
      }

      const transcriptToggle = document.getElementById(
        "tz-voice-transcript-toggle",
      );
      const transcriptBox = document.getElementById("tz-voice-transcript");
      if (transcriptToggle && transcriptBox) {
        transcriptToggle.addEventListener("click", () => {
          transcriptBox.classList.toggle("collapsed");
          transcriptBox.classList.toggle("expanded");
          transcriptToggle.textContent = transcriptBox.classList.contains(
            "collapsed",
          )
            ? "Show transcript"
            : "Hide transcript";
        });
      }

      if (this.config.enableVoice) {
        document.querySelectorAll(".tz-mode-btn").forEach((btn) => {
          btn.addEventListener("click", (e) =>
            this.switchMode(e.target.closest(".tz-mode-btn").dataset.mode),
          );
        });
        document
          .getElementById("tz-voice-btn")
          .addEventListener("click", () => this.toggleVoice());
      }
    },

    closeChat: function () {
      if (!this.isOpen) return;
      const window = document.getElementById("tz-chat-window");
      const button = document.getElementById("tz-chat-button");
      const backdrop = document.getElementById("tz-chat-backdrop");

      this.isOpen = false;
      window.classList.remove("open");
      backdrop.classList.remove("open");
      button.style.display = "flex";
      document.body.classList.remove("tz-widget-open"); // Unlock body scroll
      this.switchMode("text");
      this.hideTypingIndicator();
      if (this.isRecording) this.stopVoice();
    },

    toggleChat: function () {
      if (this.isOpen) {
        this.closeChat();
      } else {
        const window = document.getElementById("tz-chat-window");
        const button = document.getElementById("tz-chat-button");
        const backdrop = document.getElementById("tz-chat-backdrop");
        this.isOpen = true;
        window.classList.add("open");
        backdrop.classList.add("open");
        button.style.display = "none";
        document.body.classList.add("tz-widget-open"); // Lock body scroll on mobile
        if (window.innerWidth <= 768) {
          window.classList.add("tz-mobile-compact");
        }
        this.updateWidgetHeight();

        // Render loaded history on first open
        this.renderLoadedHistory();

        document.getElementById("tz-input").focus();
      }
    },

    switchMode: function (mode) {
      this.mode = mode;

      document.querySelectorAll(".tz-mode-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.mode === mode);
      });

      const chatContent = document.getElementById("tz-chat-content");
      const voiceContainer = document.getElementById("tz-voice-container");
      const chatWindow = document.getElementById("tz-chat-window");
      const chatHero = document.querySelector(".tz-chat-hero");
      const voiceBtn = document.getElementById("tz-voice-btn");
      const voiceStatus = document.getElementById("tz-voice-status");

      if (mode === "voice") {
        this.hideTypingIndicator();
        if (chatContent) chatContent.style.display = "none";
        if (voiceContainer) {
          voiceContainer.classList.remove("hidden");
          voiceContainer.classList.add("active");
        }
        if (chatWindow) chatWindow.classList.add("tz-voice-active", "tz-voice-compact");
        if (chatHero) chatHero.classList.add("hidden");
        if (voiceBtn) voiceBtn.classList.add("idle");
        if (voiceStatus) voiceStatus.textContent = "Tap the mic to start";
      } else {
        if (this.isRecording) this.stopVoice();
        if (chatContent) chatContent.style.display = "flex";
        if (voiceContainer) {
          voiceContainer.classList.add("hidden");
          voiceContainer.classList.remove("active");
        }
        if (chatWindow) chatWindow.classList.remove("tz-voice-active", "tz-voice-compact");
        if (chatHero && !chatWindow?.classList.contains("tz-mobile-compact")) {
          chatHero.classList.remove("hidden");
        }
        if (voiceBtn) voiceBtn.classList.remove("idle", "recording");
        if (voiceStatus) voiceStatus.textContent = "Ready to start";
      }
      this.updateWidgetHeight();
    },

    sendMessage: async function () {
      const input = document.getElementById("tz-input");
      const message = input.value.trim();
      const sendButton = document.getElementById("tz-send");

      if (!message && !this.currentImage) return;

      // Show user message with image if present
      this.addMessage(message || "(Image)", "user", this.currentImage);
      input.value = "";

      const imageToSend = this.currentImage;
      this.removeImage(); // Clear after sending

      try {
        this.showTypingIndicator(
          "Amara is searching TradeZone for the best answers…",
        );

        input.disabled = true;
        input.classList.add("is-disabled");
        if (!input.dataset.prevPlaceholder) {
          input.dataset.prevPlaceholder = input.placeholder;
        }
        input.placeholder = "Searching…";

        if (sendButton) {
          sendButton.disabled = true;
          sendButton.classList.add("is-sending");
        }

        // Build history from messages array
        const history = this.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

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
              message: message || "What is in this image?",
              image: imageToSend, // Send base64 image
              history: history,
            }),
          },
        );

        const data = await response.json();
        if (data.response) {
          this.addMessage(data.response, "assistant");
        } else {
          this.hideTypingIndicator();
        }
      } catch (error) {
        console.error("[Chat] Error:", error);
        this.hideTypingIndicator();
        this.addMessage(
          "Sorry, I encountered an error. Please try again.",
          "assistant",
        );
      } finally {
        // Ensure typing indicator is cleared if no assistant message was added
        this.hideTypingIndicator();
        input.disabled = false;
        input.classList.remove("is-disabled");
        if (input.dataset.prevPlaceholder) {
          input.placeholder = input.dataset.prevPlaceholder;
          delete input.dataset.prevPlaceholder;
        }
        if (sendButton) {
          sendButton.disabled = false;
          sendButton.classList.remove("is-sending");
        }
      }
    },

    sendVoiceNote: async function () {
      const noteInput = document.getElementById("tz-voice-note");
      if (!noteInput) return;
      const note = noteInput.value.trim();
      const textInput = document.getElementById("tz-input");
      if (!textInput) return;
      const hadImage = !!this.currentImage;

      if (!note && !this.currentImage) {
        this.updateVoiceStatus("Add a note or attach a photo first.");
        setTimeout(() => this.updateVoiceStatus("Ready to start"), 2000);
        return;
      }

      const previousValue = textInput.value;
      const defaultPlaceholder =
        noteInput.dataset.defaultPlaceholder || noteInput.placeholder;
      noteInput.dataset.defaultPlaceholder = defaultPlaceholder;
      textInput.value = note;

      try {
        await this.sendMessage();
        noteInput.value = "";

        // Clear the image after sending
        if (hadImage) {
          this.removeImage();
        }

        if (this.mode === "voice") {
          if (note) {
            this.addTranscript(`📝 Note sent: ${note}`, "system");
          } else {
            this.addTranscript("📝 Note sent.", "system");
          }
          if (hadImage) {
            this.addTranscript(
              "📷 Photo received. We'll review it soon.",
              "system",
            );
          }
          const statusMessage = hadImage
            ? note
              ? "Note + photo sent to Amara."
              : "Photo sent to Amara."
            : "Note sent to Amara.";
          this.updateVoiceStatus(statusMessage);
          noteInput.placeholder = hadImage ? "Photo sent!" : "Note sent!";
          setTimeout(() => {
            this.updateVoiceStatus("Ready to start");
            noteInput.placeholder = noteInput.dataset.defaultPlaceholder;
          }, 2200);
        }
      } finally {
        textInput.value = previousValue;
      }
    },

    addMessage: function (text, role, imageBase64 = null) {
      if (role === "assistant") {
        this.hideTypingIndicator();
      }
      // Store message in history
      this.messages.push({
        role: role,
        content: text,
      });

      // Save to localStorage for persistence
      this.saveHistoryToStorage();

      const container = document.getElementById("tz-messages");
      const div = document.createElement("div");
      div.className = `tz-chat-message ${role}`;

      // Use markdown for assistant messages, escape HTML for user messages
      const formattedText =
        role === "assistant" ? this.parseMarkdown(text) : this.escapeHtml(text);

      // Add image if present
      const imageHtml = imageBase64
        ? `<img src="${imageBase64}" style="max-width: 200px; border-radius: 8px; margin-top: 8px; display: block;" />`
        : "";

      div.innerHTML = `
        <div class="tz-chat-message-avatar">${role === "user" ? "U" : this.config.botName[0]}</div>
        <div class="tz-chat-message-bubble">${formattedText}${imageHtml}</div>
      `;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    },

    showTypingIndicator: function (label) {
      if (this.typingIndicatorEl) return;

      const container = document.getElementById("tz-messages");
      if (!container) return;

      const div = document.createElement("div");
      div.className = "tz-chat-message assistant typing";
      const statusLabel = label?.trim()
        ? this.escapeHtml(label.trim())
        : `${this.escapeHtml(this.config.botName)} is typing…`;
      div.innerHTML = `
        <div class="tz-chat-message-avatar">${this.config.botName[0]}</div>
        <div class="tz-chat-message-bubble">
          <span class="tz-typing-indicator-content">
            <span class="tz-typing-label">${statusLabel}</span>
            <span class="tz-typing-dots"><span></span><span></span><span></span></span>
          </span>
        </div>
      `;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
      this.typingIndicatorEl = div;
    },

    hideTypingIndicator: function () {
      if (!this.typingIndicatorEl) return;
      if (this.typingIndicatorEl.parentNode) {
        this.typingIndicatorEl.parentNode.removeChild(this.typingIndicatorEl);
      }
      this.typingIndicatorEl = null;
    },

    toggleVoice: async function () {
      if (!this.isRecording) {
        await this.startVoice();
      } else {
        this.stopVoice();
      }
    },

    startVoice: async function () {
      try {
        // Get realtime config
        const response = await fetch(
          `${this.config.apiUrl}/api/chatkit/realtime`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": this.config.apiKey || "",
            },
            body: JSON.stringify({ sessionId: this.sessionId }),
          },
        );

        const config = await response.json();

        // Connect to OpenAI Realtime (EXACT COPY FROM DASHBOARD)
        this.ws = new WebSocket(
          `${config.config.websocketUrl}?model=${config.config.model}`,
          [
            "realtime",
            `openai-insecure-api-key.${config.config.apiKey}`,
            "openai-beta.realtime-v1",
          ],
        );

        this.ws.onopen = async () => {
          console.log("[Voice] Connected");
          this.updateVoiceStatus("Connected");

          // Use full config from API (same as dashboard!)
          this.ws.send(
            JSON.stringify({
              type: "session.update",
              session: {
                ...config.config.sessionConfig,
                voice: config.config.voice || "alloy",
                output_audio_format: "pcm16",
              },
            }),
          );

          // Initialize audio
          await this.initAudio();
          this.isRecording = true;
          this.updateVoiceButton();
        };

        this.ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          console.log("[Voice] Received event:", data.type, data);
          this.handleVoiceEvent(data);
        };

        this.ws.onerror = (error) => {
          console.error("[Voice] WebSocket error:", error);
          this.updateVoiceStatus("Connection error");
        };

        this.ws.onclose = (event) => {
          console.log("[Voice] WebSocket closed:", event.code, event.reason);
          this.updateVoiceStatus("Disconnected");
        };
      } catch (error) {
        console.error("[Voice] Error:", error);
        console.error("[Voice] Error details:", error.message, error.stack);
        this.updateVoiceStatus(
          "Error: " + (error.message || "Failed to start"),
        );
        alert(
          "Voice error: " + error.message + "\n\nCheck console for details.",
        );
      }
    },

    stopVoice: function () {
      if (this.ws) this.ws.close();
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((track) => track.stop());
      }
      if (this.audioContext) this.audioContext.close();
      if (this.playbackContext) this.playbackContext.close();

      this.isRecording = false;
      this.updateVoiceButton();
      this.updateVoiceStatus("Stopped");
    },

    initAudio: async function () {
      // Initialize audio queue
      this.audioQueue = [];

      // Input (microphone)
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          // Avoid forcing a sample rate; let the browser choose to prevent mismatches (Firefox)
        },
      });

      // Pick stream sample rate if available; otherwise fall back to default
      const track = this.mediaStream.getAudioTracks()[0];
      const trackSettings = track?.getSettings ? track.getSettings() : {};
      let desiredSampleRate = trackSettings?.sampleRate || undefined;

      try {
        this.audioContext = desiredSampleRate
          ? new AudioContext({ sampleRate: desiredSampleRate })
          : new AudioContext();
      } catch (err) {
        console.warn(
          "[Voice] AudioContext init failed with desired sampleRate",
          desiredSampleRate,
          err,
        );
        this.audioContext = new AudioContext();
      }
      // Ensure we know the actual sample rate in use
      desiredSampleRate = this.audioContext.sampleRate || desiredSampleRate;

      const source = this.audioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      let audioChunkCount = 0;
      this.processor.onaudioprocess = (e) => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          console.warn(
            "[Voice] WebSocket not ready, state:",
            this.ws?.readyState,
          );
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        const base64 = btoa(
          String.fromCharCode.apply(
            null,
            Array.from(new Uint8Array(pcm16.buffer)),
          ),
        );
        this.ws.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: base64,
          }),
        );

        audioChunkCount++;
        if (audioChunkCount % 50 === 0) {
          console.log(
            "[Voice] Sent",
            audioChunkCount,
            "audio chunks to OpenAI",
          );
        }
      };

      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      // Output (playback)
      try {
        this.playbackContext = desiredSampleRate
          ? new AudioContext({ sampleRate: desiredSampleRate })
          : new AudioContext();
      } catch (err) {
        console.warn(
          "[Voice] Playback AudioContext init failed, falling back",
          err,
        );
        this.playbackContext = new AudioContext();
      }
      this.playbackNode = this.playbackContext.createScriptProcessor(
        2048,
        1,
        1,
      );

      this.playbackNode.onaudioprocess = (e) => {
        const out = e.outputBuffer.getChannelData(0);
        let offset = 0;

        while (offset < out.length) {
          if (this.audioQueue.length === 0) {
            for (; offset < out.length; offset++) out[offset] = 0;
            break;
          }

          const chunk = this.audioQueue[0];
          const copyCount = Math.min(chunk.length, out.length - offset);
          out.set(chunk.subarray(0, copyCount), offset);
          offset += copyCount;

          if (copyCount === chunk.length) {
            this.audioQueue.shift();
          } else {
            this.audioQueue[0] = chunk.subarray(copyCount);
          }
        }
      };

      this.playbackNode.connect(this.playbackContext.destination);

      // Resume AudioContext (required by browsers)
      console.log(
        "[Voice] AudioContext initial state:",
        this.playbackContext.state,
      );
      if (this.playbackContext.state === "suspended") {
        this.playbackContext.resume().then(() => {
          console.log("[Voice] AudioContext resumed successfully");
        });
      }
      console.log(
        "[Voice] Audio initialized, queue size:",
        this.audioQueue.length,
      );
    },

    handleVoiceEvent: function (event) {
      switch (event.type) {
        case "conversation.item.input_audio_transcription.completed":
          console.log("[Voice] User said:", event.transcript);
          this.voicePendingUserTranscript = event.transcript || "";
          this.voicePendingAssistantTranscript = "";
          this.voicePendingLinksMarkdown = null;
          this.voiceTurnStartedAt = Date.now();
          this.addTranscript(event.transcript, "user");
          break;

        case "response.audio_transcript.delta":
          // Accumulate transcript instead of adding each word
          if (!this.currentTranscript) {
            this.currentTranscript = "";
          }
          this.currentTranscript += event.delta;
          this.voicePendingAssistantTranscript += event.delta || "";
          break;

        case "response.created": {
          this.voiceState.isResponding = true;
          this.updateVoiceStatus("Thinking...");
          const btnStart = document.getElementById("tz-voice-btn");
          if (btnStart) btnStart.classList.remove("idle");
          break;
        }

        case "response.audio_transcript.done":
          // Add complete transcript when done
          if (this.currentTranscript) {
            this.addTranscript(this.currentTranscript, "assistant");
            this.voicePendingAssistantTranscript = this.currentTranscript;
            this.currentTranscript = "";
          }
          break;

        case "response.audio.delta":
          console.log(
            "[Voice] Received audio delta, length:",
            event.delta?.length || 0,
          );
          this.voiceState.isResponding = true;
          this.playAudio(event.delta);
          this.updateVoiceStatus("Speaking...");
          break;

        case "response.done": {
          console.log("[Voice] Response complete");
          this.voiceState.isResponding = false;
          this.updateVoiceStatus("Listening...");
          this.flushVoiceTurn("success");
          const btnStartDone = document.getElementById("tz-voice-btn");
          if (btnStartDone && !this.isRecording) {
            btnStartDone.classList.add("idle");
          }
          break;
        }

        case "response.function_call_arguments.done":
          // Tool execution (CRITICAL - was missing!)
          console.log(
            "[Voice] Tool called:",
            event.name,
            "with args:",
            event.arguments,
          );
          this.handleToolCall(event.call_id, event.name, event.arguments);
          this.updateVoiceStatus(`Using tool: ${event.name}...`);
          if (event.name === "searchProducts") {
            this.addTranscript("🔎 Checking pricing…", "system");
          } else if (event.name === "searchtool") {
            this.addTranscript("🔍 Looking that up…", "system");
          }
          break;

        case "input_audio_buffer.speech_started": {
          console.log("[Voice] User started speaking");
          if (this.voiceState.isResponding) {
            this.ws.send(JSON.stringify({ type: "response.cancel" }));
            this.audioQueue = [];
            this.voiceState.isResponding = false;
            this.updateVoiceStatus("Listening…");
            this.flushVoiceTurn("interrupted");
          }
          this.clearAssistantAudio();
          this.voicePendingLinksMarkdown = null;
          const btnStartSpeak = document.getElementById("tz-voice-btn");
          if (btnStartSpeak) btnStartSpeak.classList.remove("idle");
          break;
        }

        case "input_audio_buffer.speech_stopped":
          console.log("[Voice] User stopped speaking");
          break;

        case "error":
          console.error("[Voice] Error:", event.error);
          this.voiceState.isResponding = false;
          this.updateVoiceStatus(
            "Error: " + (event.error?.message || "Unknown error"),
          );
          this.flushVoiceTurn("error");
          break;
      }
    },

    handleToolCall: async function (callId, name, argsJson) {
      try {
        console.log("[Tool] Executing:", name, "with args:", argsJson);
        const parsedArgs = JSON.parse(argsJson);
        let result = "";
        let source = "unknown";

        if (name === "searchProducts") {
          let queryText =
            typeof parsedArgs.query === "string"
              ? parsedArgs.query.trim()
              : String(parsedArgs.query ?? "");

          // Wait briefly if the transcript may still be growing
          const stableTranscript = await this.waitForStableTranscript(
            this.voicePendingUserTranscript || queryText,
          );
          if (stableTranscript && stableTranscript.length > queryText.length) {
            queryText = stableTranscript;
          }

          if (!queryText) {
            result = "Need the exact device model to check pricing.";
            source = "validation";
            console.warn(
              "[Tool] searchProducts called without usable query",
              parsedArgs,
            );
          } else {
            const voiceContext = this.buildVoiceSearchContext(queryText);
            const resolvedQuery = voiceContext.refinedQuery || queryText;
            const isTradeInIntent = this.detectTradeInIntent(resolvedQuery);
            this.voicePendingLinksMarkdown = null;
            let vectorOk = false;

            try {
              const response = await fetch(
                `${this.config.apiUrl}/api/tools/vector`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "X-API-Key": this.config.apiKey || "",
                  },
                  body: JSON.stringify({
                    query: resolvedQuery,
                    context: isTradeInIntent
                      ? { intent: "trade_in", toolUsed: name }
                      : { toolUsed: name },
                  }),
                },
              );

              if (response.ok) {
                const data = await response.json();
                result = typeof data.result === "string" ? data.result : "";
                source =
                  typeof data.store === "string" ? data.store : "vector_store";

                if (Array.isArray(data.matches) && data.matches.length) {
                  const filteredMatches = this.filterMatchesByVoiceContext(
                    data.matches,
                    voiceContext,
                  );
                  if (filteredMatches.length) {
                    const summary = this.buildVoiceProductSummary(
                      filteredMatches,
                    );
                    if (summary) {
                      result = `${summary}\n\nNeed details on any of these?`;
                    }
                    const linksMarkdown =
                      this.formatMatchesMarkdown(filteredMatches);
                    if (linksMarkdown) {
                      this.voicePendingLinksMarkdown = linksMarkdown;
                    }
                    vectorOk = true;
                  } else {
                    result = `No results match those details right now.`;
                    if (voiceContext.keywords.length) {
                      vectorOk = true; // prevent fallback from spilling unrelated items
                    }
                  }
                }

                if (source === "catalog") {
                  const linksMarkdown = this.formatMatchesMarkdown(
                    data.matches,
                  );
                  if (linksMarkdown) {
                    this.voicePendingLinksMarkdown = linksMarkdown;
                    console.log("[Tool] Captured product links for transcript");
                  }
                }

                vectorOk = Boolean(result && result.trim().length > 0);
              } else {
                console.warn(
                  "[Tool] Vector search request failed:",
                  response.status,
                  response.statusText,
                );
              }
            } catch (error) {
              console.error("[Tool] Vector search error:", error);
            }

            const shouldFallback =
              !isTradeInIntent &&
              (!vectorOk || (result || "").trim().length < 40);

            if (shouldFallback) {
              try {
                const response = await fetch(
                  `${this.config.apiUrl}/api/tools/perplexity`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "X-API-Key": this.config.apiKey || "",
                    },
                    body: JSON.stringify({ query: queryText }),
                  },
                );
                if (response.ok) {
                  const data = await response.json();
                  if (data.result) {
                    result = data.result;
                    source = data.source || "perplexity";
                  }
                  if (Array.isArray(data.matches) && data.matches.length) {
                    const filteredMatches = this.filterMatchesByVoiceContext(
                      data.matches,
                      voiceContext,
                    );
                    if (filteredMatches.length) {
                      const summary = this.buildVoiceProductSummary(
                        filteredMatches,
                      );
                      if (summary) {
                        result = `${summary}\n\nNeed details on any of these?`;
                      }
                      const linksMarkdown =
                        this.formatMatchesMarkdown(filteredMatches);
                      if (linksMarkdown) {
                        this.voicePendingLinksMarkdown = linksMarkdown;
                      }
                    }
                  }
                } else {
                  console.warn(
                    "[Tool] Perplexity fallback failed:",
                    response.status,
                    response.statusText,
                  );
                }
              } catch (error) {
                console.error("[Tool] Perplexity fallback error:", error);
              }
            }

            if (!result || !result.trim()) {
              result = isTradeInIntent
                ? this.tradeInNoMatchGuidance
                : "No results found";
            }

            console.log(
              "[Tool] searchProducts result",
              JSON.stringify(
                {
                  store: source,
                  length: result.length,
                  isTradeInIntent,
                  refinedQuery: resolvedQuery,
                  keywords: voiceContext.keywords,
                  hasLinks: Boolean(this.voicePendingLinksMarkdown),
                },
                null,
                2,
              ),
            );
          }
        } else if (name === "searchtool") {
          // Non-product queries still use hybrid endpoint
          try {
            const response = await fetch(
              `${this.config.apiUrl}/api/tools/perplexity`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-API-Key": this.config.apiKey || "",
                },
                body: JSON.stringify({ query: parsedArgs.query }),
              },
            );
            if (response.ok) {
              const data = await response.json();
              result = data.result || "No results found";
              source = data.source || "perplexity";
              const linksMarkdown = this.formatMatchesMarkdown(data.matches);
              if (linksMarkdown) {
                this.voicePendingLinksMarkdown = linksMarkdown;
              }
            } else {
              console.warn(
                "[Tool] searchtool request failed:",
                response.status,
                response.statusText,
              );
              result =
                "I ran into an issue searching our site. Try rephrasing?";
            }
          } catch (error) {
            console.error("[Tool] searchtool error:", error);
            result =
              "I ran into an issue searching our site. Please try again in a moment.";
          }
          console.log(
            `[Tool] ${name} result from ${source}:`,
            result.substring(0, 200),
          );
        } else if (name === "sendemail") {
          // Call email send
          const messageText =
            `${parsedArgs?.message || ""} ${parsedArgs?.note || ""}`.toLowerCase();

          if (parsedArgs && parsedArgs.emailType === "trade_in") {
            result =
              "Trade-in submissions must call tradein_update_lead and tradein_submit_lead. Do not route trade-ins through sendemail.";
            console.warn("[Tool] Blocked trade-in attempt via sendemail.");
          } else if (
            messageText.includes("trade in") ||
            messageText.includes("trade-in") ||
            messageText.includes("tradein")
          ) {
            result =
              "This sounds like a trade-in request. Please finish it with tradein_update_lead and tradein_submit_lead instead of sendemail.";
            console.warn("[Tool] Blocked trade-in language via sendemail.");
          } else {
            const response = await fetch(
              `${this.config.apiUrl}/api/tools/email`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-API-Key": this.config.apiKey || "",
                },
                body: JSON.stringify(parsedArgs),
              },
            );
            const data = await response.json();
            result = data.result || "Email sent successfully";
            console.log("[Tool] Email result:", result);
          }
        } else if (name === "tradein_update_lead") {
          console.log("[Tool] Updating trade-in lead:", parsedArgs);
          const response = await fetch(
            `${this.config.apiUrl}/api/tradein/update`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-API-Key": this.config.apiKey || "",
              },
              body: JSON.stringify({
                sessionId: this.sessionId,
                ...parsedArgs,
              }),
            },
          );
          const data = await response.json();
          result = data.success
            ? "Lead updated successfully"
            : `Error: ${data.error || "Failed to update trade-in lead"}`;
          console.log("[Tool] Trade-in update result:", result);
        } else if (name === "tradein_submit_lead") {
          console.log("[Tool] Submitting trade-in lead:", parsedArgs);
          const response = await fetch(
            `${this.config.apiUrl}/api/tradein/submit`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-API-Key": this.config.apiKey || "",
              },
              body: JSON.stringify({
                sessionId: this.sessionId,
                summary:
                  parsedArgs.summary || "Trade-in request from voice chat",
                notify: parsedArgs.notify !== false,
                status: parsedArgs.status || "in_review",
              }),
            },
          );
          const data = await response.json();
          result = data.success
            ? "Trade-in submitted successfully. Our team will contact you within 24 hours."
            : `Error: ${data.error || "Failed to submit trade-in lead"}`;
          console.log("[Tool] Trade-in submit result:", result);
        } else if (name === "normalize_product") {
          try {
            const response = await fetch(
              `${this.config.apiUrl}/api/tools/normalize-product`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-API-Key": this.config.apiKey || "",
                },
                body: JSON.stringify({
                  query: parsedArgs.query,
                  limit: parsedArgs.limit,
                }),
              },
            );
            const data = await response.json();
            result = JSON.stringify({ ...data, slot: parsedArgs.slot });
          } catch (error) {
            console.error("[Tool] normalize_product error", error);
            result = "Failed to normalize product";
          }
        } else if (name === "price_lookup") {
          try {
            const response = await fetch(
              `${this.config.apiUrl}/api/tools/price-lookup`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-API-Key": this.config.apiKey || "",
                },
                body: JSON.stringify(parsedArgs),
              },
            );
            const data = await response.json();
            result = JSON.stringify({ ...data, subject: parsedArgs.subject });
          } catch (error) {
            console.error("[Tool] price_lookup error", error);
            result = "Failed to look up pricing";
          }
        } else if (name === "calculate_top_up") {
          try {
            const response = await fetch(
              `${this.config.apiUrl}/api/tools/calculate-top-up`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-API-Key": this.config.apiKey || "",
                },
                body: JSON.stringify(parsedArgs),
              },
            );
            const data = await response.json();
            result = JSON.stringify(data);
          } catch (error) {
            console.error("[Tool] calculate_top_up error", error);
            result = "Failed to calculate top-up";
          }
        } else if (name === "inventory_check") {
          try {
            const response = await fetch(
              `${this.config.apiUrl}/api/tools/inventory-check`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-API-Key": this.config.apiKey || "",
                },
                body: JSON.stringify(parsedArgs),
              },
            );
            const data = await response.json();
            result = JSON.stringify(data);
          } catch (error) {
            console.error("[Tool] inventory_check error", error);
            result = "Failed to check inventory";
          }
        } else if (name === "order_create") {
          try {
            const response = await fetch(
              `${this.config.apiUrl}/api/tools/order-create`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-API-Key": this.config.apiKey || "",
                },
                body: JSON.stringify({
                  ...parsedArgs,
                  sessionId: this.sessionId,
                }),
              },
            );
            const data = await response.json();
            result = JSON.stringify(data);
          } catch (error) {
            console.error("[Tool] order_create error", error);
            result = "Failed to create order";
          }
        } else if (name === "schedule_inspection") {
          try {
            const response = await fetch(
              `${this.config.apiUrl}/api/tools/schedule-inspection`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-API-Key": this.config.apiKey || "",
                },
                body: JSON.stringify({
                  ...parsedArgs,
                  sessionId: this.sessionId,
                }),
              },
            );
            const data = await response.json();
            result = JSON.stringify(data);
          } catch (error) {
            console.error("[Tool] schedule_inspection error", error);
            result = "Failed to schedule inspection";
          }
        } else if (name === "ocr_and_extract") {
          try {
            const response = await fetch(
              `${this.config.apiUrl}/api/tools/ocr-extract`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-API-Key": this.config.apiKey || "",
                },
                body: JSON.stringify(parsedArgs),
              },
            );
            const data = await response.json();
            result = JSON.stringify(data);
          } catch (error) {
            console.error("[Tool] ocr_and_extract error", error);
            result = "Failed to analyze photo";
          }
        } else if (name === "enqueue_human_review") {
          try {
            const response = await fetch(
              `${this.config.apiUrl}/api/tools/enqueue-human-review`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-API-Key": this.config.apiKey || "",
                },
                body: JSON.stringify(parsedArgs),
              },
            );
            const data = await response.json();
            result = JSON.stringify(data);
          } catch (error) {
            console.error("[Tool] enqueue_human_review error", error);
            result = "Failed to enqueue review";
          }
        }

        // Send tool result back to Realtime API
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: callId,
                output: result,
              },
            }),
          );

          // Trigger response generation
          this.ws.send(
            JSON.stringify({
              type: "response.create",
            }),
          );

          console.log("[Tool] Result sent back to AI");
        }
      } catch (error) {
        console.error("[Tool] Error:", error);
        this.updateVoiceStatus("Tool error: " + error.message);
      }
    },

    playAudio: function (base64) {
      if (!base64) {
        console.warn("[Voice] No audio data received");
        return;
      }
      console.log("[Voice] Processing audio, base64 length:", base64.length);
      const buf = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
      const i16 = new Int16Array(buf);
      const f32 = new Float32Array(i16.length);
      for (let i = 0; i < i16.length; i++) {
        f32[i] = Math.max(-1, Math.min(1, i16[i] / 32768));
      }
      this.audioQueue.push(f32);
      console.log(
        "[Voice] Audio queued, total chunks:",
        this.audioQueue.length,
        "samples:",
        f32.length,
      );
      console.log("[Voice] AudioContext state:", this.playbackContext?.state);
    },

    flushVoiceTurn: function (status = "success") {
      const userText = (this.voicePendingUserTranscript || "").trim();
      const assistantText = (this.voicePendingAssistantTranscript || "").trim();
      const linksMarkdown = this.voicePendingLinksMarkdown;
      const startedAt = this.voiceTurnStartedAt;
      const startedAtIso = startedAt
        ? new Date(startedAt).toISOString()
        : undefined;
      const latencyMs = startedAt ? Date.now() - startedAt : undefined;

      if (!userText) {
        this.voicePendingUserTranscript = null;
        this.voicePendingAssistantTranscript = "";
        this.voicePendingLinksMarkdown = null;
        this.voiceTurnStartedAt = 0;
        return;
      }

      const assistantWithLinks = linksMarkdown
        ? `${assistantText}${assistantText ? "\n\n" : ""}${linksMarkdown}`
        : assistantText;

      if (linksMarkdown && assistantText) {
        this.addTranscript(linksMarkdown, "assistant");
      }

      console.log("[Voice] Logging turn", {
        sessionId: this.sessionId,
        latencyMs,
        status,
      });

      this.voicePendingUserTranscript = null;
      this.voicePendingAssistantTranscript = "";
      this.voicePendingLinksMarkdown = null;
      this.voiceTurnStartedAt = 0;

      fetch(`${this.config.apiUrl}/api/chatkit/voice-log`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.config.apiKey || "",
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          userId: this.clientId,
          userTranscript: userText,
          assistantTranscript: assistantWithLinks,
          linksMarkdown,
          startedAt: startedAtIso,
          latencyMs,
          status,
        }),
      })
        .then((res) => {
          if (!res.ok) {
            return res
              .json()
              .catch(() => ({}))
              .then((body) => {
                console.error("[Voice] Voice log failed", res.status, body);
              });
          }
          console.log("[Voice] Voice log saved");
        })
        .catch((err) => {
          console.error("[Voice] Voice log error", err);
        });
    },

    addTranscript: function (text, role) {
      const transcript = document.getElementById("tz-voice-transcript");
      if (!transcript) return;
      const div = document.createElement("div");
      div.style.marginBottom = "8px";

      let labelColor = "#8b5cf6";
      let labelText = this.config.botName;
      if (role === "user") {
        labelColor = "#a78bfa";
        labelText = "You";
      } else if (role === "system") {
        labelColor = "#fbbf24";
        labelText = "Note";
      }

      const formattedText =
        role === "assistant" ? this.parseMarkdown(text) : this.escapeHtml(text);

      div.innerHTML = `<strong style="color: ${labelColor};">${labelText}:</strong> <span style="color: #e5e7eb;">${formattedText}</span>`;
      transcript.appendChild(div);
      transcript.classList.add("expanded");
      transcript.scrollTop = transcript.scrollHeight;
    },

    updateVoiceStatus: function (status) {
      document.getElementById("tz-voice-status").textContent = status;
    },

    showVoiceAttachment: function (imageUrl) {
      const wrapper = document.getElementById("tz-voice-attachment");
      const img = document.getElementById("tz-voice-preview-img");
      const label = document.getElementById("tz-voice-attachment-label");
      if (img) {
        img.src = imageUrl;
      }
      if (wrapper) {
        wrapper.style.display = "flex";
      }
      if (label) {
        label.textContent = "Photo ready to send";
      }
      this.addTranscript("📸 Photo attached (not sent yet).", "system");
      this.updateVoiceStatus("Photo attached. Add a note to send it.");
    },

    updateVoiceButton: function () {
      const btn = document.getElementById("tz-voice-btn");
      if (this.isRecording) {
        btn.classList.remove("start");
        btn.classList.add("stop");
        btn.innerHTML = `
          <svg viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12"/>
          </svg>
        `;
      } else {
        btn.classList.remove("stop");
        btn.classList.add("start");
        btn.innerHTML = `
          <svg viewBox="0 0 24 24">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          </svg>
        `;
      }
    },

    handleFileSelect: async function (event) {
      const file = event.target.files[0];
      if (!file) return;

      // Check if it's an image
      if (!file.type.startsWith("image/")) {
        alert("Please select an image file");
        return;
      }

      // Show loading state
      this.updateVoiceStatus && this.updateVoiceStatus("Uploading image...");

      try {
        // Upload to Appwrite
        const imageUrl = await this.uploadToAppwrite(file);

        if (imageUrl) {
          this.currentImage = imageUrl; // Store Appwrite URL instead of base64
          if (this.mode === "voice") {
            this.showVoiceAttachment(imageUrl);
          } else {
            document.getElementById("tz-preview-img").src = imageUrl;
            document.getElementById("tz-image-preview").style.display = "block";
          }
          console.log("[File] Image uploaded to Appwrite:", imageUrl);
        } else {
          // Fallback to base64 if Appwrite fails
          console.warn("[File] Appwrite upload failed, using base64 fallback");
          const reader = new FileReader();
          reader.onload = (e) => {
            this.currentImage = e.target.result;
            if (this.mode === "voice") {
              this.showVoiceAttachment(this.currentImage);
            } else {
              document.getElementById("tz-preview-img").src = this.currentImage;
              document.getElementById("tz-image-preview").style.display =
                "block";
            }
          };
          reader.readAsDataURL(file);
        }
      } catch (error) {
        console.error("[File] Upload error:", error);
        alert("Failed to upload image. Please try again.");
      }
    },

    uploadToAppwrite: async function (file) {
      try {
        // Use API endpoint to handle upload with server-side API key
        const formData = new FormData();
        formData.append("file", file);
        formData.append("sessionId", this.sessionId);

        const response = await fetch(
          `${this.config.apiUrl}/api/upload/appwrite`,
          {
            method: "POST",
            body: formData,
          },
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error || `Upload failed: ${response.status}`,
          );
        }

        const data = await response.json();

        if (data.url) {
          console.log("[Appwrite] Upload successful:", data.url);
          return data.url;
        } else {
          throw new Error("No URL returned from upload");
        }
      } catch (error) {
        console.error("[Appwrite] Upload error:", error);
        return null; // Return null to trigger base64 fallback
      }
    },

    removeImage: function () {
      this.currentImage = null;

      const textPreviewWrapper = document.getElementById("tz-image-preview");
      if (textPreviewWrapper) {
        textPreviewWrapper.style.display = "none";
      }

      const textPreviewImg = document.getElementById("tz-preview-img");
      if (textPreviewImg) {
        textPreviewImg.src = "";
      }

      const textFileInput = document.getElementById("tz-file-input");
      if (textFileInput) {
        textFileInput.value = ""; // Reset text-mode file input
      }

      const voiceWrapper = document.getElementById("tz-voice-attachment");
      if (voiceWrapper) {
        voiceWrapper.style.display = "none";
      }

      const voicePreviewImg = document.getElementById("tz-voice-preview-img");
      if (voicePreviewImg) {
        voicePreviewImg.src = "";
      }

      const voiceLabel = document.getElementById("tz-voice-attachment-label");
      if (voiceLabel) {
        voiceLabel.textContent = "Photo ready to send";
      }

      const voiceFileInput = document.getElementById("tz-voice-file-input");
      if (voiceFileInput) {
        voiceFileInput.value = "";
      }
    },

    escapeHtml: function (text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    },

    formatMatchesMarkdown: function (matches) {
      if (!matches || !matches.length) return null;

      const lines = matches
        .filter((match) => match && match.name)
        .map((match) => {
          const price = match && match.price ? " — S$" + match.price : "";
          let stock = "";
          if (match && match.stockStatus) {
            if (match.stockStatus === "instock") stock = " (In stock)";
            else if (match.stockStatus === "outofstock")
              stock = " (Out of stock)";
            else stock = ` (${match.stockStatus})`;
          }
          const link =
            match && match.permalink
              ? `[${match.name}](${match.permalink})`
              : match.name;
          return `- ${link}${price}${stock}`;
        })
        .filter(Boolean);

      if (!lines.length) return null;
      return `**Quick Links**\n${lines.join("\n")}`;
    },

    parseMarkdown: function (text) {
      // Escape HTML first
      text = this.escapeHtml(text);

      // Convert **bold**
      text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

      // Convert images FIRST (before links!) ![alt](url)
      text = text.replace(
        /!\[([^\]]*)\]\(([^)]+)\)/g,
        '<img src="$2" alt="$1" loading="lazy" style="max-width: 100%; border-radius: 8px; margin-top: 8px; display: block;" />',
      );

      // Convert links [text](url)
      text = text.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
      );

      // Convert line breaks
      text = text.replace(/\n/g, "<br>");

      return text;
    },
  };

  window.TradeZoneChatEnhanced = TradeZoneChatEnhanced;

  // Auto-initialize
  document.addEventListener("DOMContentLoaded", function () {
    const script = document.querySelector(
      'script[src*="chat-widget-enhanced.js"]',
    );
    if (script) {
      const apiUrl = script.getAttribute("data-api-url");
      if (apiUrl) {
        TradeZoneChatEnhanced.init({
          apiUrl: apiUrl,
          position: script.getAttribute("data-position") || "bottom-right",
          primaryColor: script.getAttribute("data-primary-color") || "#8b5cf6",
          videoUrl: script.getAttribute("data-video-url") || "",
          apiKey: script.getAttribute("data-api-key") || "",
        });
      }
    }
  });
})();
