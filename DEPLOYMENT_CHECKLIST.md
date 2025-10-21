# TradeZone Widget - Deployment Checklist

## ✅ Pre-Deployment (Completed)

### Environment Variables Added to Coolify
- [x] `NEXT_PUBLIC_APPWRITE_ENDPOINT=https://studio.getrezult.com/v1`
- [x] `NEXT_PUBLIC_APPWRITE_PROJECT_ID=68e9c230002bf8a2f26f`
- [x] `NEXT_PUBLIC_APPWRITE_BUCKET_ID=68e9c23f002de06d1e68`
- [x] `APPWRITE_API_KEY=standard_beaed1a9e4dae3069f9e...`

### Code Changes Deployed
- [x] Mobile overflow fixes (`100dvh`, body scroll lock)
- [x] Voice tool execution (`handleToolCall` function)
- [x] Image attachment feature (📎 button)
- [x] Appwrite storage integration
- [x] Bot name changed to "Amara"
- [x] API endpoint `/api/upload/appwrite`

## 🧪 Post-Deployment Testing

### 1. Mobile Experience
**Test on actual mobile device (Chrome/Safari)**
- [ ] Open widget on mobile
- [ ] Verify no overflow/scrolling issues
- [ ] Check body scroll is locked when widget open
- [ ] Test full screen display
- [ ] Verify chat input works
- [ ] Test file attachment button

### 2. Image Upload (Appwrite)
**Test image attachment flow**
- [ ] Click attach button (📎)
- [ ] Select an image
- [ ] Verify upload to Appwrite (check console logs)
- [ ] Confirm image preview shows
- [ ] Send message with image
- [ ] Verify image URL starts with: `https://studio.getrezult.com/v1/storage/...`
- [ ] Check image displays in chat bubble
- [ ] Test remove image button (×)

**Expected URL Format**:
```
https://studio.getrezult.com/v1/storage/buckets/68e9c23f002de06d1e68/files/{fileId}/view?project=68e9c230002bf8a2f26f
```

### 3. Voice Chat & Tools
**Test voice mode with tools**
- [ ] Click "Voice" mode button
- [ ] Allow microphone access
- [ ] Say: "Do you have gaming keyboards?"
- [ ] Verify tool execution (check console for `[Tool] Executing: searchtool`)
- [ ] Confirm AI responds with product info (not generic answer)
- [ ] Test email tool: "I want to trade in my PlayStation"
- [ ] Verify email submission works

**Expected Console Logs**:
```
[Tool] Executing: searchtool with args: {"query":"gaming keyboards"}
[Tool] Search result: ...
[Tool] Result sent back to AI
```

### 4. Text Chat & History
- [ ] Type a message in text mode
- [ ] Verify response from Amara (not Izacc)
- [ ] Send multiple messages
- [ ] Confirm conversation history maintained
- [ ] Check markdown rendering (links, bold text)
- [ ] Verify no repeated greetings

### 5. API Endpoints
**Verify all endpoints respond correctly**
- [ ] `POST /api/upload/appwrite` - Image upload
- [ ] `POST /api/chatkit/agent` - Text chat
- [ ] `POST /api/chatkit/realtime` - Voice config
- [ ] `POST /api/tools/perplexity` - Product search
- [ ] `POST /api/tools/email` - Email submission

## 🔍 Monitoring & Debugging

### Check Console Logs
**Success indicators:**
```
[Appwrite] Upload successful: https://studio.getrezult.com/...
[Tool] Executing: searchtool with args: ...
[Tool] Result sent back to AI
[Voice] Connected
[Voice] Tool called: searchtool
```

**Error indicators to watch for:**
```
[Appwrite] Upload error: ...
[Tool] Error: ...
[Voice] Error: ...
```

### Browser DevTools Check
1. **Network Tab**: Verify uploads to Appwrite succeed (200 status)
2. **Console**: No JavaScript errors
3. **Application > Local Storage**: Session ID stored
4. **Performance**: Image loads from CDN (fast)

## 🐛 Common Issues & Fixes

### Issue: Image upload fails
**Check:**
- Appwrite API key in Coolify environment
- Bucket permissions set to public read
- File size under limit (check Appwrite bucket settings)

**Fix:**
- Verify env vars: `APPWRITE_API_KEY` exists
- Check API response in Network tab
- Falls back to base64 automatically

### Issue: Voice tools don't execute
**Check:**
- Console shows `[Tool] Executing: ...`
- Tools configured in `/api/chatkit/realtime`
- API endpoints responding

**Fix:**
- Check OpenAI API key is valid
- Verify tools array in session config
- Check `/api/tools/perplexity` endpoint

### Issue: Mobile overflow
**Check:**
- CSS using `100dvh` not `100vh`
- Body has `tz-widget-open` class when open
- No transform on mobile media query

**Fix:**
- Clear browser cache
- Force refresh (Ctrl+Shift+R)
- Check responsive mode in DevTools

## 📊 Success Criteria

### All Tests Pass ✅
- [ ] Mobile: No overflow, perfect fit
- [ ] Images: Upload to Appwrite, display from CDN
- [ ] Voice: Tools execute, products found
- [ ] Text: History maintained, Amara responds
- [ ] Security: API key not exposed in browser

### Performance Metrics
- [ ] Image load time: < 500ms (CDN)
- [ ] Voice response: < 2s (with tools)
- [ ] Text response: < 1s
- [ ] Widget opens: < 100ms

## 🚀 Production URL

**Widget Demo**: https://trade.rezult.co/widget/demo-enhanced.html

**Test on actual site**:
```html
<script src="https://trade.rezult.co/widget/chat-widget-enhanced.js"></script>
<script>
  TradeZoneChatEnhanced.init({
    apiUrl: 'https://your-production-domain.com',
    position: 'bottom-right',
    primaryColor: '#8b5cf6',
    videoUrl: 'https://videostream44.b-cdn.net/tradezone-amara-welcome.mp4',
    botName: 'Amara',
    enableVoice: true,
    enableVideo: true
  });
</script>
```

## 📝 Final Checklist

- [ ] All environment variables in Coolify
- [ ] Code deployed and built successfully
- [ ] Mobile testing passed
- [ ] Appwrite uploads working
- [ ] Voice tools executing
- [ ] No console errors
- [ ] Bot name is "Amara"
- [ ] Images served from CDN
- [ ] Conversation history working

---

**Status**: Ready for production testing! 🎉

**Next Step**: Test on https://trade.rezult.co/widget/demo-enhanced.html
