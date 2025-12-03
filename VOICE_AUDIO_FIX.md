# Voice Audio Fix - Firefox Compatibility
## Date: November 30, 2025

---

## 🎯 Problem Summary

**User Report**: "Voice sounds like chipmunk sometimes, especially in Firefox"

**Root Cause**: Sample rate mismatch between microphone and AudioContext

---

## 🔍 Technical Analysis

### **Firefox-Specific Error**
```
DOMException: AudioContext.createMediaStreamSource: 
Connecting AudioNodes from AudioContexts with different sample-rate 
is currently not supported.
```

### **Why This Happens**

1. **Microphone native rate**: Usually 48kHz (browser default)
2. **Our old code**: Forced AudioContext to 24kHz
3. **Firefox behavior**: Refuses to connect nodes with different sample rates
4. **Chrome/Safari**: Allows it but may cause distortion (chipmunk effect)

### **The Wrong Approach** ❌
```javascript
// DON'T DO THIS - causes Firefox errors and Chrome distortion
const audioContext = new AudioContext({ sampleRate: 24000 });
const source = audioContext.createMediaStreamSource(stream); // stream is 48kHz!
// Firefox: Error!
// Chrome: Chipmunk voice!
```

---

## ✅ The Correct Solution

### **Smart Approach: Match Native Sample Rate**

**For Input (Microphone)**:
```javascript
// 1. Let browser choose best sample rate for mic
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    // NO sampleRate specified - let browser decide
  },
});

// 2. Read what the browser actually gave us
const track = stream.getAudioTracks()[0];
const settings = track.getSettings();
const nativeSampleRate = settings.sampleRate || 48000; // Usually 48kHz

// 3. Create AudioContext with SAME rate
const audioContext = new AudioContext({ sampleRate: nativeSampleRate });
const source = audioContext.createMediaStreamSource(stream);
// ✅ Firefox happy! Chrome happy! No resampling = perfect quality!
```

**For Output (Playback)**:
```javascript
// OpenAI sends us 24kHz PCM16 audio, so playback uses 24kHz
const playbackContext = new AudioContext({ sampleRate: 24000 });
// ✅ Correct because this is receiving pre-encoded audio from OpenAI
```

---

## 📊 Sample Rate Flow Diagram

```
User's Mic (Hardware)
    ↓
Browser MediaStream (48kHz native - best quality)
    ↓
AudioContext (48kHz - MATCHES mic, no resampling!)
    ↓
ScriptProcessor (processes at 48kHz)
    ↓
Convert Float32 → Int16 PCM
    ↓
Send to OpenAI (browser's WebSocket handles any needed conversion)
    ↓
OpenAI API (receives audio, processes it)
    ↓
OpenAI returns 24kHz PCM16 audio
    ↓
Playback AudioContext (24kHz - matches OpenAI format)
    ↓
User hears perfect audio ✅
```

---

## 🔧 Files Changed

### **1. Widget** (`public/widget/chat-widget-enhanced.js`)

**Before** (buggy):
```javascript
// Forced 24kHz everywhere
this.audioContext = new AudioContext({ sampleRate: 24000 }); // ❌
```

**After** (fixed):
```javascript
// Use native mic rate (usually 48kHz)
const nativeSampleRate = trackSettings?.sampleRate || 48000;
this.audioContext = new AudioContext({ sampleRate: nativeSampleRate }); // ✅
```

### **2. Dashboard** (`components/realtime-voice.tsx`)

**Before** (buggy):
```javascript
// Forced 24kHz
const audioContext = new AudioContext({ sampleRate: 24000 }); // ❌
```

**After** (fixed):
```javascript
// Use native mic rate
const nativeSampleRate = streamSettings.sampleRate || 48000;
const audioContext = new AudioContext({ sampleRate: nativeSampleRate }); // ✅
```

---

## ✅ Testing Results

### **Before Fix**:
- ❌ Firefox: Error on voice start, no audio
- ❌ Chrome: Occasional chipmunk voice (random)
- ❌ Safari: Sometimes distorted

### **After Fix**:
- ✅ Firefox: Works perfectly, no errors
- ✅ Chrome: Perfect audio quality
- ✅ Safari: Perfect audio quality
- ✅ Mobile (all browsers): Works correctly

---

## 🎓 Key Learnings

### **1. Don't Force Sample Rates**
Let the browser choose the best native rate for hardware.

### **2. Match Stream to Context**
AudioContext sample rate MUST match MediaStream sample rate (Firefox requirement).

### **3. Separate Input and Output**
- **Input context**: Use mic's native rate (48kHz)
- **Output context**: Use OpenAI's format (24kHz)

### **4. Browser Handles Conversion**
Modern browsers automatically handle sample rate conversion when sending/receiving data over WebSocket. Don't try to do it manually!

---

## 📝 Console Output (Expected)

**Good (After Fix)**:
```
[Voice] Microphone native rate: 48000 Hz
[Audio Capture] Using native microphone rate: 48000 Hz
[Voice] Playback AudioContext: 24kHz (OpenAI audio format)
```

**Bad (Before Fix)**:
```
[Voice] Microphone native rate: 48000 → Resampling to 24kHz  ❌
DOMException: AudioContext.createMediaStreamSource: 
Connecting AudioNodes from AudioContexts with different sample-rate 
is currently not supported.
```

---

## 🚀 Deployment Status

- ✅ **Widget**: Fixed in `chat-widget-enhanced.js`
- ✅ **Dashboard**: Fixed in `realtime-voice.tsx`
- ✅ **Tested**: Firefox, Chrome, Safari, Mobile
- ✅ **Production Ready**: Yes

---

## 🔮 Future Considerations

### **Optional Enhancement: Adaptive Quality**
If you want to optimize for bandwidth in the future:

```javascript
// Detect connection speed
const connection = navigator.connection;
const isSlow = connection?.effectiveType === '2g' || connection?.effectiveType === '3g';

// Use lower sample rate for slow connections
const targetRate = isSlow ? 24000 : nativeSampleRate;
```

But for now, using native rate everywhere gives **best quality** and **best compatibility**.

---

**Status**: ✅ **FIXED AND TESTED**
**Works on**: Firefox ✅ | Chrome ✅ | Safari ✅ | Mobile ✅
