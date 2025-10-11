/**
 * TradeZone Enhanced Chat Widget
 * Full-featured chat widget with text, voice, and video avatar
 *
 * Features:
 * - Text chat with typing indicators
 * - Voice chat (GPT Realtime)
 * - Video avatar/hero section
 * - Call button for voice mode
 * - Responsive design
 *
 * Usage:
 * <script src="https://your-domain.com/widget/chat-widget-enhanced.js"></script>
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

    init: function (options) {
      this.config = { ...this.config, ...options };
      this.sessionId = this.generateSessionId();

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

    generateSessionId: function () {
      return "Guest-" + Math.floor(1000 + Math.random() * 9000);
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
          width: 28px;
          height: 28px;
          fill: white;
        }

        #tz-chat-window {
          display: none;
          position: fixed;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 420px;
          height: 600px;
          max-height: calc(100vh - 40px);
          background: #1a1a2e;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          flex-direction: column;
          overflow: hidden;
          border: 1px solid rgba(139, 92, 246, 0.3);
          z-index: 999998;
        }

        /* Mobile responsive full-screen experience */
        @media (max-width: 768px) {
          #tz-chat-widget {
            right: auto;
            left: 0;
            bottom: 0;
            width: 100vw;
          }

          #tz-chat-button {
            position: fixed;
            right: calc(env(safe-area-inset-right, 0px) + 16px);
            bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
          }

          #tz-chat-window {
            width: 100vw;
            height: calc(var(--tz-widget-height, 100dvh));
            max-height: none;
            inset: 0;
            border-radius: 0;
            transform: none !important;
            border: none;
          }

          /* Messages must scroll, not widget */
          .tz-chat-messages {
            flex: 1;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch;
            min-height: 0;
            padding-bottom: 12px;
          }

          /* Input stays at bottom, above keyboard */
          .tz-chat-input-container {
            flex-shrink: 0;
            padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
          }

          /* Prevent body scroll */
          body.tz-widget-open {
            overflow: hidden !important;
            position: fixed !important;
            width: 100% !important;
            height: 100% !important;
          }

          /* Always visible close button */
          .tz-chat-close {
            top: calc(env(safe-area-inset-top, 0px) + 16px) !important;
            right: calc(env(safe-area-inset-right, 0px) + 16px) !important;
            width: 48px !important;
            height: 48px !important;
            background: rgba(0,0,0,0.65) !important;
            backdrop-filter: blur(10px);
            z-index: 1000;
            border: 2px solid rgba(255,255,255,0.3);
            color: #f8fafc;
          }
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
          font-size: 24px;
          font-weight: 700;
          margin: 0 0 4px 0;
          text-shadow: 0 2px 8px rgba(0,0,0,0.8);
          opacity: 0.9;
        }

        .tz-chat-hero-subtitle {
          font-size: 14px;
          margin: 0;
          opacity: 0.9;
          text-shadow: 0 2px 8px rgba(0,0,0,0.8);
        }

        .tz-chat-close {
          position: absolute;
          top: 12px;
          right: 12px;
          background: rgba(0,0,0,0.5);
          border: none;
          border-radius: 50%;
          width: 36px;
          height: 36px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          transition: background 0.2s;
          z-index: 10;
          pointer-events: auto !important;
        }

        .tz-chat-close:hover {
          background: rgba(139, 92, 246, 0.8);
        }

        @media (max-width: 768px) {
          .tz-chat-close {
            width: 44px;
            height: 44px;
            background: rgba(0,0,0,0.7);
          }
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
          width: 16px;
          height: 16px;
        }

        /* Messages Area */
        .tz-chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          background: #1a1a2e;
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
        }

        .tz-chat-message-bubble a:hover {
          color: #c4b5fd;
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
          display: none;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 20px;
          gap: 16px;
          flex: 1;
          min-height: 0;
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
          width: 20px;
          height: 20px;
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
          width: 20px;
          height: 20px;
          fill: white;
        }

        /* Mobile Optimizations */
        @media (max-width: 768px) {
          #tz-chat-window {
            width: 100vw;
            height: calc(var(--tz-widget-height, 100dvh));
            max-height: none;
            inset: 0;
            border-radius: 0;
          }

          #tz-chat-button {
            width: 56px;
            height: 56px;
            right: calc(env(safe-area-inset-right, 0px) + 16px);
            bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
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
            padding: 30px 16px;
          }

          .tz-voice-button {
            width: 72px;
            height: 72px;
          }

          .tz-voice-button svg {
            width: 32px;
            height: 32px;
          }

          .tz-voice-status {
            font-size: 15px;
          }

          .tz-voice-transcript {
            font-size: 13px;
            max-height: 150px;
          }

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

        /* Small mobile devices */
        @media (max-width: 375px) {
          .tz-chat-hero {
            height: 140px;
          }

          .tz-chat-hero-title {
            font-size: 18px;
          }

          .tz-voice-button {
            width: 64px;
            height: 64px;
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

          <div class="tz-chat-messages" id="tz-messages">
            <div class="tz-chat-message">
              <div class="tz-chat-message-avatar">${this.config.botName[0]}</div>
              <div class="tz-chat-message-bubble">${this.config.greeting}</div>
            </div>
          </div>

          ${
            this.config.enableVoice
              ? `
          <div class="tz-voice-container" id="tz-voice-container">
            <div class="tz-voice-status" id="tz-voice-status">Ready to start</div>
            <button class="tz-voice-button start" id="tz-voice-btn">
              <svg viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </button>
            <div class="tz-voice-transcript" id="tz-voice-transcript"></div>
          </div>
          `
              : ""
          }

          <div class="tz-chat-input-container" id="tz-input-container">
            <div class="tz-chat-input-wrapper">
              <button class="tz-chat-attach" id="tz-attach" title="Attach image">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
                <svg viewBox="0 0 24 24">
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
      `;

      document.body.appendChild(widget);
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

      this.isOpen = false;
      window.classList.remove("open");
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
        this.isOpen = true;
        window.classList.add("open");
        button.style.display = "none";
        document.body.classList.add("tz-widget-open"); // Lock body scroll on mobile
        this.updateWidgetHeight();
        document.getElementById("tz-input").focus();
      }
    },

    switchMode: function (mode) {
      this.mode = mode;

      document.querySelectorAll(".tz-mode-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.mode === mode);
      });

      if (mode === "text") {
        document.getElementById("tz-messages").style.display = "block";
        document.getElementById("tz-input-container").style.display = "block";
        document
          .getElementById("tz-voice-container")
          .classList.remove("active");
        if (this.isRecording) this.stopVoice();
      } else {
        this.hideTypingIndicator();
        document.getElementById("tz-messages").style.display = "none";
        document.getElementById("tz-input-container").style.display = "none";
        document.getElementById("tz-voice-container").classList.add("active");
      }
      this.updateWidgetHeight();
    },

    sendMessage: async function () {
      const input = document.getElementById("tz-input");
      const message = input.value.trim();

      if (!message && !this.currentImage) return;

      // Show user message with image if present
      this.addMessage(message || "(Image)", "user", this.currentImage);
      input.value = "";

      const imageToSend = this.currentImage;
      this.removeImage(); // Clear after sending

      try {
        this.showTypingIndicator();
        // Build history from messages array
        const history = this.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

        const response = await fetch(
          `${this.config.apiUrl}/api/chatkit/agent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
            headers: { "Content-Type": "application/json" },
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
          sampleRate: 24000,
        },
      });

      this.audioContext = new AudioContext({ sampleRate: 24000 });
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
      this.playbackContext = new AudioContext({ sampleRate: 24000 });
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
          this.addTranscript(event.transcript, "user");
          break;

        case "response.audio_transcript.delta":
          // Accumulate transcript instead of adding each word
          if (!this.currentTranscript) {
            this.currentTranscript = "";
          }
          this.currentTranscript += event.delta;
          break;

        case "response.audio_transcript.done":
          // Add complete transcript when done
          if (this.currentTranscript) {
            this.addTranscript(this.currentTranscript, "assistant");
            this.currentTranscript = "";
          }
          break;

        case "response.audio.delta":
          console.log(
            "[Voice] Received audio delta, length:",
            event.delta?.length || 0,
          );
          this.playAudio(event.delta);
          this.updateVoiceStatus("Speaking...");
          break;

        case "response.done":
          console.log("[Voice] Response complete");
          this.updateVoiceStatus("Listening...");
          break;

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
          break;

        case "input_audio_buffer.speech_started":
          console.log("[Voice] User started speaking");
          if (this.voiceState.isResponding) {
            this.ws.send(JSON.stringify({ type: "response.cancel" }));
            this.audioQueue = [];
          }
          break;

        case "input_audio_buffer.speech_stopped":
          console.log("[Voice] User stopped speaking");
          break;

        case "error":
          console.error("[Voice] Error:", event.error);
          this.updateVoiceStatus(
            "Error: " + (event.error?.message || "Unknown error"),
          );
          break;
      }
    },

    handleToolCall: async function (callId, name, argsJson) {
      try {
        console.log("[Tool] Executing:", name, "with args:", argsJson);
        const parsedArgs = JSON.parse(argsJson);
        let result = "";

        if (name === "searchProducts" || name === "searchtool") {
          // Use hybrid search (vector→perplexity fallback) for both tools
          const response = await fetch(
            `${this.config.apiUrl}/api/tools/perplexity`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: parsedArgs.query }),
            },
          );
          const data = await response.json();
          result = data.result || "No results found";
          const source = data.source || "unknown";
          console.log(
            `[Tool] ${name} result from ${source}:`,
            result.substring(0, 200),
          );
        } else if (name === "sendemail") {
          // Call email send
          const response = await fetch(
            `${this.config.apiUrl}/api/tools/email`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(parsedArgs),
            },
          );
          const data = await response.json();
          result = data.result || "Email sent successfully";
          console.log("[Tool] Email result:", result);
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

    addTranscript: function (text, role) {
      const transcript = document.getElementById("tz-voice-transcript");
      const div = document.createElement("div");
      div.style.marginBottom = "8px";

      // Parse markdown for assistant messages, escape for user
      const formattedText =
        role === "assistant" ? this.parseMarkdown(text) : this.escapeHtml(text);

      div.innerHTML = `<strong style="color: ${role === "user" ? "#a78bfa" : "#8b5cf6"};">${role === "user" ? "You" : this.config.botName}:</strong> <span style="color: #e5e7eb;">${formattedText}</span>`;
      transcript.appendChild(div);
      transcript.scrollTop = transcript.scrollHeight;
    },

    updateVoiceStatus: function (status) {
      document.getElementById("tz-voice-status").textContent = status;
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
          // Show preview
          document.getElementById("tz-preview-img").src = imageUrl;
          document.getElementById("tz-image-preview").style.display = "block";
          console.log("[File] Image uploaded to Appwrite:", imageUrl);
        } else {
          // Fallback to base64 if Appwrite fails
          console.warn("[File] Appwrite upload failed, using base64 fallback");
          const reader = new FileReader();
          reader.onload = (e) => {
            this.currentImage = e.target.result;
            document.getElementById("tz-preview-img").src = this.currentImage;
            document.getElementById("tz-image-preview").style.display = "block";
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
      document.getElementById("tz-image-preview").style.display = "none";
      document.getElementById("tz-preview-img").src = "";
      document.getElementById("tz-file-input").value = ""; // Reset file input
    },

    escapeHtml: function (text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
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
        });
      }
    }
  });
})();
