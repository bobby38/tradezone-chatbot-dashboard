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

(function() {
  'use strict';

  const TradeZoneChatEnhanced = {
    config: {
      apiUrl: '',
      position: 'bottom-right',
      primaryColor: '#8b5cf6', // TradeZone purple
      secondaryColor: '#6d28d9',
      accentColor: '#a78bfa',
      darkBg: '#1a1a2e',
      greeting: 'Hi! How can I help you today?',
      botName: 'Izacc',
      placeholder: 'Ask about products, prices, trade-ins...',
      videoUrl: '', // Optional hero video
      enableVoice: true,
      enableVideo: true
    },
    
    sessionId: null,
    isOpen: false,
    messages: [],
    mode: 'text', // 'text' or 'voice'
    
    // Voice chat state
    ws: null,
    audioContext: null,
    mediaStream: null,
    processor: null,
    playbackContext: null,
    playbackNode: null,
    audioQueue: [],
    isRecording: false,
    isResponding: false,

    init: function(options) {
      this.config = { ...this.config, ...options };
      this.sessionId = this.generateSessionId();
      
      // Ensure viewport meta tag for mobile
      this.ensureViewport();
      
      this.injectStyles();
      this.createWidget();
      this.attachEventListeners();
      
      console.log('[TradeZone Chat Enhanced] Widget initialized', this.sessionId);
    },

    ensureViewport: function() {
      // Check if viewport meta tag exists
      let viewport = document.querySelector('meta[name="viewport"]');
      if (!viewport) {
        viewport = document.createElement('meta');
        viewport.name = 'viewport';
        viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
        document.head.appendChild(viewport);
        console.log('[TradeZone Chat] Added viewport meta tag for mobile');
      }
    },

    generateSessionId: function() {
      return 'Guest-' + Math.floor(1000 + Math.random() * 9000);
    },

    injectStyles: function() {
      const styles = `
        /* Base Widget Styles */
        #tz-chat-widget {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          position: fixed;
          ${this.config.position === 'bottom-right' ? 'right: 20px;' : 'left: 20px;'}
          bottom: 20px;
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
          ${this.config.position === 'bottom-right' ? 'right: 20px;' : 'left: 20px;'}
          bottom: 90px;
          width: 400px;
          height: 650px;
          max-height: calc(100vh - 120px);
          background: white;
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.12);
          flex-direction: column;
          overflow: hidden;
        }

        #tz-chat-window.open {
          display: flex;
        }

        /* Hero/Video Section */
        .tz-chat-hero {
          position: relative;
          height: 200px;
          background: linear-gradient(135deg, ${this.config.primaryColor} 0%, #764ba2 100%);
          overflow: hidden;
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
          bottom: 0;
          background: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.3) 100%);
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 20px;
          color: white;
        }

        .tz-chat-hero-title {
          font-size: 24px;
          font-weight: 700;
          margin: 0 0 4px 0;
          text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }

        .tz-chat-hero-subtitle {
          font-size: 14px;
          margin: 0;
          opacity: 0.95;
          text-shadow: 0 1px 2px rgba(0,0,0,0.3);
        }

        .tz-chat-close {
          position: absolute;
          top: 12px;
          right: 12px;
          background: rgba(0,0,0,0.3);
          border: none;
          color: white;
          cursor: pointer;
          padding: 8px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(10px);
          transition: background 0.2s;
        }

        .tz-chat-close:hover {
          background: rgba(0,0,0,0.5);
        }

        /* Mode Toggle */
        .tz-chat-mode-toggle {
          display: flex;
          gap: 8px;
          padding: 12px 16px;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
        }

        .tz-mode-btn {
          flex: 1;
          padding: 8px 16px;
          border: 1px solid #e5e7eb;
          background: white;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
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
          background: ${this.config.primaryColor};
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
          padding: 20px;
          background: #f9fafb;
        }

        .tz-chat-message {
          margin-bottom: 16px;
          display: flex;
          gap: 8px;
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
          border-radius: 12px;
          background: white;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
          font-size: 14px;
          line-height: 1.5;
        }

        .tz-chat-message.user .tz-chat-message-bubble {
          background: ${this.config.primaryColor};
          color: white;
        }

        /* Voice Mode */
        .tz-voice-container {
          display: none;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          gap: 24px;
        }

        .tz-voice-container.active {
          display: flex;
        }

        .tz-voice-status {
          font-size: 16px;
          font-weight: 500;
          color: #1f2937;
          text-align: center;
        }

        .tz-voice-button {
          width: 80px;
          height: 80px;
          border-radius: 40px;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        .tz-voice-button.start {
          background: ${this.config.primaryColor};
        }

        .tz-voice-button.stop {
          background: #ef4444;
          animation: pulse 2s infinite;
        }

        .tz-voice-button svg {
          width: 36px;
          height: 36px;
          fill: white;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }

        .tz-voice-transcript {
          max-height: 200px;
          overflow-y: auto;
          width: 100%;
          padding: 16px;
          background: #f9fafb;
          border-radius: 8px;
          font-size: 14px;
          line-height: 1.6;
        }

        /* Input Area */
        .tz-chat-input-container {
          padding: 16px;
          background: white;
          border-top: 1px solid #e5e7eb;
        }

        .tz-chat-input-wrapper {
          display: flex;
          gap: 8px;
        }

        .tz-chat-input {
          flex: 1;
          padding: 10px 14px;
          border: 1px solid #e5e7eb;
          border-radius: 20px;
          font-size: 14px;
          outline: none;
        }

        .tz-chat-input:focus {
          border-color: ${this.config.primaryColor};
        }

        .tz-chat-send {
          width: 40px;
          height: 40px;
          border-radius: 20px;
          background: ${this.config.primaryColor};
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
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
            height: 100vh;
            max-height: 100vh;
            bottom: 0;
            right: 0;
            left: 0;
            border-radius: 0;
          }

          #tz-chat-button {
            width: 56px;
            height: 56px;
            bottom: 16px;
            right: 16px;
          }

          .tz-chat-hero {
            height: 160px;
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
            max-width: 80%;
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

      const styleSheet = document.createElement('style');
      styleSheet.textContent = styles;
      document.head.appendChild(styleSheet);
    },

    createWidget: function() {
      const widget = document.createElement('div');
      widget.id = 'tz-chat-widget';
      
      const videoHtml = this.config.enableVideo && this.config.videoUrl ? `
        <video autoplay loop muted playsinline>
          <source src="${this.config.videoUrl}" type="video/mp4">
        </video>
      ` : '';

      widget.innerHTML = `
        <button id="tz-chat-button" aria-label="Open chat">
          <svg viewBox="0 0 24 24">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
          </svg>
        </button>

        <div id="tz-chat-window">
          <div class="tz-chat-hero">
            ${videoHtml}
            <div class="tz-chat-hero-overlay">
              <h3 class="tz-chat-hero-title">${this.config.botName}</h3>
              <p class="tz-chat-hero-subtitle">AI Assistant • Always here to help</p>
            </div>
            <button class="tz-chat-close" aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2"/>
              </svg>
            </button>
          </div>

          ${this.config.enableVoice ? `
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
          ` : ''}

          <div class="tz-chat-messages" id="tz-messages">
            <div class="tz-chat-message">
              <div class="tz-chat-message-avatar">${this.config.botName[0]}</div>
              <div class="tz-chat-message-bubble">${this.config.greeting}</div>
            </div>
          </div>

          ${this.config.enableVoice ? `
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
          ` : ''}

          <div class="tz-chat-input-container" id="tz-input-container">
            <div class="tz-chat-input-wrapper">
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
          </div>
        </div>
      `;

      document.body.appendChild(widget);
    },

    attachEventListeners: function() {
      document.getElementById('tz-chat-button').addEventListener('click', () => this.toggleChat());
      document.querySelector('.tz-chat-close').addEventListener('click', () => this.toggleChat());
      document.getElementById('tz-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.sendMessage();
      });
      document.getElementById('tz-send').addEventListener('click', () => this.sendMessage());

      if (this.config.enableVoice) {
        document.querySelectorAll('.tz-mode-btn').forEach(btn => {
          btn.addEventListener('click', (e) => this.switchMode(e.target.closest('.tz-mode-btn').dataset.mode));
        });
        document.getElementById('tz-voice-btn').addEventListener('click', () => this.toggleVoice());
      }
    },

    toggleChat: function() {
      const window = document.getElementById('tz-chat-window');
      const button = document.getElementById('tz-chat-button');
      
      this.isOpen = !this.isOpen;
      
      if (this.isOpen) {
        window.classList.add('open');
        button.style.display = 'none';
        document.getElementById('tz-input').focus();
      } else {
        window.classList.remove('open');
        button.style.display = 'flex';
        if (this.isRecording) this.stopVoice();
      }
    },

    switchMode: function(mode) {
      this.mode = mode;
      
      document.querySelectorAll('.tz-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
      });

      if (mode === 'text') {
        document.getElementById('tz-messages').style.display = 'block';
        document.getElementById('tz-input-container').style.display = 'block';
        document.getElementById('tz-voice-container').classList.remove('active');
        if (this.isRecording) this.stopVoice();
      } else {
        document.getElementById('tz-messages').style.display = 'none';
        document.getElementById('tz-input-container').style.display = 'none';
        document.getElementById('tz-voice-container').classList.add('active');
      }
    },

    sendMessage: async function() {
      const input = document.getElementById('tz-input');
      const message = input.value.trim();
      
      if (!message) return;

      this.addMessage(message, 'user');
      input.value = '';

      try {
        const response = await fetch(`${this.config.apiUrl}/api/chatkit/agent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: this.sessionId,
            message: message
          })
        });

        const data = await response.json();
        if (data.response) {
          this.addMessage(data.response, 'assistant');
        }
      } catch (error) {
        console.error('[Chat] Error:', error);
        this.addMessage('Sorry, I encountered an error. Please try again.', 'assistant');
      }
    },

    addMessage: function(text, role) {
      const container = document.getElementById('tz-messages');
      const div = document.createElement('div');
      div.className = `tz-chat-message ${role}`;
      div.innerHTML = `
        <div class="tz-chat-message-avatar">${role === 'user' ? 'U' : this.config.botName[0]}</div>
        <div class="tz-chat-message-bubble">${this.escapeHtml(text)}</div>
      `;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    },

    toggleVoice: async function() {
      if (!this.isRecording) {
        await this.startVoice();
      } else {
        this.stopVoice();
      }
    },

    startVoice: async function() {
      try {
        // Get realtime config
        const response = await fetch(`${this.config.apiUrl}/api/chatkit/realtime`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: this.sessionId })
        });

        const config = await response.json();

        // Connect to OpenAI Realtime
        this.ws = new WebSocket(
          'wss://api.openai.com/v1/realtime',
          ['realtime', `openai-insecure-api-key.${config.config.apiKey}`, 'openai-beta.realtime-v1']
        );

        this.ws.onopen = async () => {
          console.log('[Voice] Connected');
          this.updateVoiceStatus('Connected');
          
          // Configure session
          this.ws.send(JSON.stringify({
            type: 'session.update',
            session: {
              modalities: ['text', 'audio'],
              voice: config.config.voice || 'verse',
              output_audio_format: 'pcm16'
            }
          }));

          // Initialize audio
          await this.initAudio();
          this.isRecording = true;
          this.updateVoiceButton();
        };

        this.ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          this.handleVoiceEvent(data);
        };

      } catch (error) {
        console.error('[Voice] Error:', error);
        this.updateVoiceStatus('Error starting voice');
      }
    },

    stopVoice: function() {
      if (this.ws) this.ws.close();
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
      }
      if (this.audioContext) this.audioContext.close();
      if (this.playbackContext) this.playbackContext.close();
      
      this.isRecording = false;
      this.updateVoiceButton();
      this.updateVoiceStatus('Stopped');
    },

    initAudio: async function() {
      // Input (microphone)
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 24000 }
      });

      this.audioContext = new AudioContext({ sampleRate: 24000 });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        const base64 = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(pcm16.buffer))));
        this.ws.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: base64
        }));
      };

      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      // Output (playback)
      this.playbackContext = new AudioContext({ sampleRate: 24000 });
      this.playbackNode = this.playbackContext.createScriptProcessor(2048, 1, 1);
      
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
    },

    handleVoiceEvent: function(event) {
      switch (event.type) {
        case 'conversation.item.input_audio_transcription.completed':
          this.addTranscript(event.transcript, 'user');
          break;

        case 'response.audio_transcript.delta':
          this.addTranscript(event.delta, 'assistant');
          break;

        case 'response.audio.delta':
          this.playAudio(event.delta);
          this.updateVoiceStatus('Speaking...');
          break;

        case 'response.done':
          this.updateVoiceStatus('Listening...');
          break;

        case 'input_audio_buffer.speech_started':
          if (this.isResponding) {
            this.ws.send(JSON.stringify({ type: 'response.cancel' }));
            this.audioQueue = [];
          }
          break;
      }
    },

    playAudio: function(base64) {
      const buf = Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer;
      const i16 = new Int16Array(buf);
      const f32 = new Float32Array(i16.length);
      for (let i = 0; i < i16.length; i++) {
        f32[i] = Math.max(-1, Math.min(1, i16[i] / 32768));
      }
      this.audioQueue.push(f32);
    },

    addTranscript: function(text, role) {
      const transcript = document.getElementById('tz-voice-transcript');
      const div = document.createElement('div');
      div.style.marginBottom = '8px';
      div.innerHTML = `<strong>${role === 'user' ? 'You' : this.config.botName}:</strong> ${this.escapeHtml(text)}`;
      transcript.appendChild(div);
      transcript.scrollTop = transcript.scrollHeight;
    },

    updateVoiceStatus: function(status) {
      document.getElementById('tz-voice-status').textContent = status;
    },

    updateVoiceButton: function() {
      const btn = document.getElementById('tz-voice-btn');
      if (this.isRecording) {
        btn.classList.remove('start');
        btn.classList.add('stop');
        btn.innerHTML = `
          <svg viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12"/>
          </svg>
        `;
      } else {
        btn.classList.remove('stop');
        btn.classList.add('start');
        btn.innerHTML = `
          <svg viewBox="0 0 24 24">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          </svg>
        `;
      }
    },

    escapeHtml: function(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  };

  window.TradeZoneChatEnhanced = TradeZoneChatEnhanced;

  // Auto-initialize
  document.addEventListener('DOMContentLoaded', function() {
    const script = document.querySelector('script[src*="chat-widget-enhanced.js"]');
    if (script) {
      const apiUrl = script.getAttribute('data-api-url');
      if (apiUrl) {
        TradeZoneChatEnhanced.init({
          apiUrl: apiUrl,
          position: script.getAttribute('data-position') || 'bottom-right',
          primaryColor: script.getAttribute('data-primary-color') || '#2563eb',
          videoUrl: script.getAttribute('data-video-url') || ''
        });
      }
    }
  });
})();
