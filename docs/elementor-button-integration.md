# Open TradeZone Chat Widget from Elementor Button

## Quick Solution: Use JavaScript to Trigger Widget

The TradeZone chat widget can be opened programmatically from any Elementor button using JavaScript.

---

## **Method 1: Simple Click Handler (Recommended)**

### Step 1: Add Your Elementor Button
1. Add a Button widget in Elementor
2. Customize the button text (e.g., "Chat with Us", "Need Help?", "Ask Izacc")
3. Note the button's CSS class or add a custom CSS class like `open-chat-btn`

### Step 2: Add JavaScript to Open Widget
Add this code using **Elementor's Custom Code** feature or a **Custom HTML widget**:

```html
<script>
(function() {
  'use strict';
  
  // Wait for page to load
  document.addEventListener('DOMContentLoaded', function() {
    // Find all buttons with the class 'open-chat-btn'
    const chatButtons = document.querySelectorAll('.open-chat-btn');
    
    chatButtons.forEach(function(button) {
      button.addEventListener('click', function(e) {
        e.preventDefault();
        
        // Open the TradeZone chat widget
        if (window.TradeZoneChat) {
          window.TradeZoneChat.toggleChat();
        } else {
          console.error('TradeZone Chat widget not loaded');
        }
      });
    });
  });
})();
</script>
```

### Step 3: Add CSS Class to Your Button
1. Select your button in Elementor
2. Go to **Advanced → CSS Classes**
3. Add: `open-chat-btn`
4. Click **Update**

---

## **Method 2: Using Button Link with Hash**

### Step 1: Configure Button Link
1. Select your Elementor button
2. In the **Link** field, enter: `#open-tradezone-chat`
3. Save/Update

### Step 2: Add Link Handler Script
Add this Custom HTML widget anywhere on the page:

```html
<script>
(function() {
  'use strict';
  
  document.addEventListener('DOMContentLoaded', function() {
    // Handle all links with #open-tradezone-chat
    document.addEventListener('click', function(e) {
      if (e.target.matches('a[href="#open-tradezone-chat"]') || 
          e.target.closest('a[href="#open-tradezone-chat"]')) {
        e.preventDefault();
        
        if (window.TradeZoneChat) {
          window.TradeZoneChat.toggleChat();
        }
      }
    });
  });
})();
</script>
```

---

## **Method 3: Global Click Handler (For Multiple Buttons)**

If you want **any button** with specific text to open the chat:

```html
<script>
(function() {
  'use strict';
  
  document.addEventListener('DOMContentLoaded', function() {
    // Find all buttons with text containing "Chat" or "Contact"
    const allButtons = document.querySelectorAll('a, button');
    
    allButtons.forEach(function(btn) {
      const text = btn.textContent.trim().toLowerCase();
      
      if (text.includes('chat') || 
          text.includes('contact us') || 
          text.includes('need help')) {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          
          if (window.TradeZoneChat) {
            window.TradeZoneChat.toggleChat();
          }
        });
      }
    });
  });
})();
</script>
```

---

## **Where to Add the JavaScript Code**

### **Option A: Elementor Custom HTML Widget**
1. Drag a **Custom HTML** widget to your page
2. Paste the JavaScript code
3. You can hide the widget visually (it just needs to load the script)

### **Option B: Theme Settings (Site-Wide)**
1. Go to **Appearance → Customize → Additional CSS** (if your theme supports scripts)
2. Or use **Elementor → Settings → Custom Code**
3. Add the script in the **Footer** section

### **Option C: Code Snippets Plugin**
1. Install **Code Snippets** plugin
2. Add new snippet
3. Paste the JavaScript
4. Set to run on **Frontend Only**

---

## **Complete Example: Trade-In CTA Button**

### HTML/CSS in Elementor:
Create a button with:
- **Text**: "Get Instant Trade-In Quote"
- **CSS Class**: `trade-in-chat-btn`
- **Link**: `#` or `#open-chat`

### JavaScript (add via Custom HTML):
```html
<script>
document.addEventListener('DOMContentLoaded', function() {
  const tradeInBtn = document.querySelector('.trade-in-chat-btn');
  
  if (tradeInBtn) {
    tradeInBtn.addEventListener('click', function(e) {
      e.preventDefault();
      
      // Open chat widget
      if (window.TradeZoneChat && !window.TradeZoneChat.isOpen) {
        window.TradeZoneChat.toggleChat();
        
        // Optional: Send initial message
        setTimeout(function() {
          const input = document.getElementById('tradezone-chat-input');
          if (input) {
            input.value = 'I want to trade in my device';
            input.focus();
          }
        }, 300);
      }
    });
  }
});
</script>
```

---

## **Advanced: Pre-fill Chat Message**

To open the chat AND send an initial message automatically:

```html
<script>
function openChatWithMessage(message) {
  if (!window.TradeZoneChat) return;
  
  // Open chat if closed
  if (!window.TradeZoneChat.isOpen) {
    window.TradeZoneChat.toggleChat();
  }
  
  // Wait for chat to open, then send message
  setTimeout(function() {
    const input = document.getElementById('tradezone-chat-input');
    const sendBtn = document.getElementById('tradezone-chat-send');
    
    if (input && sendBtn) {
      input.value = message;
      sendBtn.click();
    }
  }, 500);
}

// Use on button click
document.querySelector('.trade-in-btn').addEventListener('click', function(e) {
  e.preventDefault();
  openChatWithMessage('I want to sell my PlayStation 5');
});

document.querySelector('.support-btn').addEventListener('click', function(e) {
  e.preventDefault();
  openChatWithMessage('I need help with my order');
});
</script>
```

---

## **Troubleshooting**

### Widget Not Opening
1. **Check browser console** (F12) for errors
2. **Verify widget is loaded**: Type `window.TradeZoneChat` in console - should show object
3. **Check button class**: Make sure CSS class matches your script
4. **Test directly**: Run `window.TradeZoneChat.toggleChat()` in console

### Button Click Not Working
1. **Check for conflicts**: Other scripts might be preventing clicks
2. **Use `!important`**: Add `pointer-events: auto !important` to button CSS
3. **Try different selector**: Use ID instead of class

### Script Not Running
1. **Check placement**: Script must be in Footer or after widget loads
2. **Verify DOMContentLoaded**: Widget must exist before script runs
3. **Check for JS errors**: Other scripts might break execution

---

## **Example Button Designs**

### Floating "Chat Now" Button (Sticky)
```html
<style>
.floating-chat-cta {
  position: fixed;
  bottom: 100px;
  right: 20px;
  z-index: 99998; /* Below widget (99999) */
  background: #ff6b35;
  color: white;
  padding: 15px 30px;
  border-radius: 50px;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  transition: transform 0.2s;
}

.floating-chat-cta:hover {
  transform: scale(1.05);
}
</style>

<button class="floating-chat-cta" onclick="window.TradeZoneChat.toggleChat()">
  💬 Chat Now
</button>
```

### Inline Product Page CTA
```html
<div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
  <h3 style="margin: 0 0 10px 0;">Questions about this product?</h3>
  <p style="margin: 0 0 15px 0; color: #666;">Chat with Izacc for instant answers!</p>
  <button class="elementor-button open-chat-btn" style="background: #2563eb; color: white; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer;">
    Ask Izacc
  </button>
</div>
```

---

## **Testing Checklist**

- [ ] Widget loads correctly on page
- [ ] Button has correct CSS class
- [ ] JavaScript runs without errors (check console)
- [ ] Clicking button opens chat widget
- [ ] Widget closes and reopens properly
- [ ] Works on mobile devices
- [ ] No conflicts with other page elements

---

## **Additional Resources**

- **Widget Installation Guide**: `/docs/widget-installation.md`
- **Widget Source Code**: `/public/widget/chat-widget.js`
- **API Documentation**: Check dashboard API settings

---

**Quick Test Command** (paste in browser console):
```javascript
window.TradeZoneChat.toggleChat()
```
If this opens the chat, your setup is correct and just needs the button wiring!
