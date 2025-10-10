# Widget Fixes Needed

## Issues Found in Demo

Testing URL: `https://trade.rezult.co/widget/demo-enhanced.html`

### 🐛 Critical Issues

#### 1. **Light Theme Instead of Dark**
**Current**: White background, light colors
**Expected**: Dark theme (#1a1a2e background, purple accents)

**Files to Fix**:
- `chat-widget-enhanced.js` lines 132, 219, 286, 365
- Change `background: white` to `background: #1a1a2e`
- Change `background: #f9fafb` to `background: #16162a`
- Update text colors to light (#e5e7eb)

#### 2. **No Video Avatar**
**Current**: Video not showing in hero section
**Expected**: Autoplay video from `https://videostream44.b-cdn.net/tradezone-welcome-avatar-2.mp4`

**Issue**: Video URL not being passed or rendered
**Fix**: Ensure `videoUrl` config is used in `createWidget()` function

#### 3. **No Markdown Rendering**
**Current**: Raw markdown text with URLs and image links
```
[View Product](https://tradezone.sg/product/...) - ![Product Image](https://...)
```

**Expected**: Clickable links and rendered images

**Fix Needed**:
```javascript
// Add markdown parser
parseMarkdown: function(text) {
  // Convert **bold**
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // Convert links [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="tz-link">$1</a>');
  
  // Convert images ![alt](url)
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="tz-image" />');
  
  // Convert line breaks
  text = text.replace(/\n/g, '<br>');
  
  return text;
},

// Update addMessage to use markdown
addMessage: function(text, role) {
  const formatted = role === 'assistant' ? this.parseMarkdown(text) : this.escapeHtml(text);
  div.innerHTML = `
    <div class="tz-chat-message-avatar">${role === 'user' ? 'U' : this.config.botName[0]}</div>
    <div class="tz-chat-message-bubble">${formatted}</div>
  `;
}
```

**CSS Needed**:
```css
.tz-link {
  color: #a78bfa;
  text-decoration: underline;
  transition: color 0.2s;
}

.tz-link:hover {
  color: #c4b5fd;
}

.tz-image {
  max-width: 100%;
  border-radius: 8px;
  margin-top: 8px;
  display: block;
}
```

#### 4. **Voice Not Working**
**Current**: Connects but no audio playback
**Console**: `[Voice] Connected`

**Possible Issues**:
- Audio queue not processing
- ScriptProcessorNode not connected
- AudioContext suspended
- Missing audio initialization

**Debug Steps**:
1. Check if `initAudio()` completes
2. Verify `playbackNode` is connected
3. Check `audioQueue` has data
4. Verify AudioContext state is "running"

---

## 🎨 Complete Dark Theme Colors

```css
/* Main Container */
#tz-chat-window {
  background: #1a1a2e;
  border: 1px solid rgba(139, 92, 246, 0.3);
}

/* Hero Section */
.tz-chat-hero {
  background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
}

/* Mode Toggle */
.tz-chat-mode-toggle {
  background: #16162a;
  border-bottom: 1px solid rgba(139, 92, 246, 0.1);
}

.tz-mode-btn {
  background: rgba(139, 92, 246, 0.05);
  border: 1px solid rgba(139, 92, 246, 0.2);
  color: #9ca3af;
}

.tz-mode-btn.active {
  background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
  color: white;
}

/* Messages Area */
.tz-chat-messages {
  background: #1a1a2e;
}

.tz-chat-message-bubble {
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.2);
  color: #e5e7eb;
}

.tz-chat-message.user .tz-chat-message-bubble {
  background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
  color: white;
}

/* Input Area */
.tz-chat-input-container {
  background: #16162a;
  border-top: 1px solid rgba(139, 92, 246, 0.1);
}

.tz-chat-input {
  background: rgba(139, 92, 246, 0.05);
  border: 1px solid rgba(139, 92, 246, 0.2);
  color: #e5e7eb;
}

.tz-chat-input::placeholder {
  color: #6b7280;
}
```

---

## 📋 Implementation Checklist

### High Priority
- [ ] Apply dark theme colors throughout
- [ ] Add markdown parser function
- [ ] Render links as clickable
- [ ] Render images inline
- [ ] Fix video avatar display
- [ ] Debug voice audio playback

### Medium Priority
- [ ] Add link styling (purple, underline)
- [ ] Add image styling (rounded, max-width)
- [ ] Add loading states for images
- [ ] Add error handling for broken images

### Low Priority
- [ ] Add link preview cards
- [ ] Add image lightbox
- [ ] Add copy code blocks
- [ ] Add syntax highlighting

---

## 🔧 Quick Fix Script

```javascript
// Apply these changes to chat-widget-enhanced.js

// 1. Update colors in injectStyles()
// Replace all white backgrounds with dark theme

// 2. Add markdown parser
parseMarkdown: function(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="tz-link">$1</a>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="tz-image" loading="lazy" />')
    .replace(/\n/g, '<br>');
},

// 3. Update addMessage()
addMessage: function(text, role) {
  const container = document.getElementById('tz-messages');
  const div = document.createElement('div');
  div.className = `tz-chat-message ${role}`;
  
  const formatted = role === 'assistant' ? this.parseMarkdown(text) : this.escapeHtml(text);
  
  div.innerHTML = `
    <div class="tz-chat-message-avatar">${role === 'user' ? 'U' : this.config.botName[0]}</div>
    <div class="tz-chat-message-bubble">${formatted}</div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
},

// 4. Ensure video URL is used
const videoHtml = this.config.videoUrl ? `
  <video autoplay loop muted playsinline>
    <source src="${this.config.videoUrl}" type="video/mp4">
  </video>
` : '';
```

---

## 🎯 Expected Result

After fixes:
- ✅ Dark theme (#1a1a2e background)
- ✅ Purple accents (#8b5cf6)
- ✅ Video avatar playing
- ✅ Clickable links (purple, underlined)
- ✅ Inline images (rounded corners)
- ✅ Voice audio working
- ✅ Professional appearance

---

## 📝 Notes

- Test on `demo-enhanced.html` after each fix
- Verify on mobile devices
- Check voice audio on different browsers
- Ensure CORS is working for video CDN
- Test markdown with various formats

**Status**: Fixes documented, ready to implement
**Priority**: High - Affects production demo
**ETA**: 1-2 hours for complete fix
