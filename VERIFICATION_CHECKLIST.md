# TradeZone Chatbot - Verification Checklist

**Use this checklist to verify all examples match production**

---

## ✅ Test Instructions

1. Open https://trade.rezult.co (or your production URL)
2. For each query below, type it into the chatbot
3. Compare the response with what's documented
4. Mark ✅ if accurate, ❌ if different
5. Note any discrepancies

---

## 📋 Product Search Tests

### Test 1: NBA Games ✅ **VERIFIED**
**Query:** `NBA games`

**Expected Response:**
- Shows 8 products
- NBA 2K26 ($54.90), NBA 2K25 ($39.90), NBA 2K18 ($9.90), etc.
- Includes product images and "View Product" links
- Shows "💡 These are brand new games. Want to see pre-owned options?"

**Status:** ✅ VERIFIED (tested by client)

---

### Test 2: Gaming Headset
**Query:** `gaming headset`

**Expected Response:**
- Shows 3 products
- PlayStation Pulse Elite Wireless Headset ($99.00)
- Jabra Engage 65 Convertible Headset ($484.00)
- +1 Year Store Warranty Extension (VR Headset) ($60.00)

**Status:** ⬜ Not yet tested

**Your Result:**
```
[Paste actual response here]
```

---

### Test 3: FIFA Games
**Query:** `fifa`

**Expected Response:**
- Shows FIFA 19 ($19.90)
- Shows product image
- "Showing all 1 results. [View all games on website]"
- "💡 These are brand new games. Want to see pre-owned options?"

**Status:** ⬜ Not yet tested

**Your Result:**
```
[Paste actual response here]
```

---

### Test 4: Silent Hill
**Query:** `silent hill`

**Expected Response:**
- Shows 3 products
- PS5 Silent Hill F ($79.90)
- SILENT HILL 2 Remake ($84.90)
- be quiet! Silent Loop 2 360 ARGB Liquid Cooler ($199.00)

**Status:** ⬜ Not yet tested

**Your Result:**
```
[Paste actual response here]
```

---

### Test 5: Car Games
**Query:** `car games`

**Expected Response:**
- Shows 3 products
- Pokemon Legends: Z-A ($74.90)
- Project CARS 3 ($29.90)
- Cars 3: Driven To Win ($34.90)

**Status:** ⬜ Not yet tested

**Your Result:**
```
[Paste actual response here]
```

---

### Test 6: Gamepad for Switch
**Query:** `gamepad for switch`

**Expected Response:**
- Shows 12 products
- Nintendo Switch Pro Controller ($39.90)
- Nintendo Switch 2 Pro Controller ($109.00)
- JSAUX accessories, etc.

**Status:** ⬜ Not yet tested

**Your Result:**
```
[Paste actual response here]
```

---

### Test 7: PS5 Games
**Query:** `ps5 games`

**Expected Response:**
- Shows PS5 games
- PS5 Silent Hill F, EA Sports FC 26, etc.
- Includes product images

**Status:** ⬜ Not yet tested

**Your Result:**
```
[Paste actual response here]
```

---

### Test 8: PS4 Games
**Query:** `ps4 games`

**Expected Response:**
- Shows PS4 games
- EA Sports FC 26 ($74.90)
- Shows "brand new games" message

**Status:** ⬜ Not yet tested

**Your Result:**
```
[Paste actual response here]
```

---

### Test 9: Pokemon Games
**Query:** `pokemon games`

**Expected Response:**
- Shows Pokemon Legends: Z-A ($74.90)
- Nintendo Switch edition
- "Showing all 1 results"

**Status:** ⬜ Not yet tested

**Your Result:**
```
[Paste actual response here]
```

---

### Test 10: Cheap Tablets
**Query:** `cheap tablets`

**Expected Response:**
- Shows tablets sorted by price
- Galaxy Tab A9 WiFi Graphite 64GB ($159.00) - cheapest
- Multiple tablet options

**Status:** ⬜ Not yet tested

**Your Result:**
```
[Paste actual response here]
```

---

### Test 11: Affordable Phones
**Query:** `any affordable phones`

**Expected Response:**
- Shows affordable phone options
- Oppo A17k Gold 64GB ($140)
- Google Pixel 9 Pro Fold ($799)
- Galaxy Z Fold 6 ($899)

**Status:** ⬜ Not yet tested

**Your Result:**
```
[Paste actual response here]
```

---

## 💰 Trade-In Tests

### Test 12: PS5 Trade-In Pricing
**Query:** `How much can I trade in my PS5?`

**Expected Response:**
```
PS5 trade-in values are as follows:
- PS5 Fat 825GB Disc: S$350
- PS5 Slim 1TB Disc: S$400
- PS5 Pro 2TB Digital: S$700

Which model and storage do you have?
```

**Status:** ⬜ Not yet tested

**Your Result:**
```
[Paste actual response here]
```

---

## ℹ️ Policy & Information Tests

### Test 13: Opening Hours
**Query:** `What are your opening hours?`

**Expected Response:**
```
Open daily, 12 pm to 8 pm.
```

**Status:** ⬜ Not yet tested

**Your Result:**
```
[Paste actual response here]
```

---

### Test 14: Shipping Policy
**Query:** `How much is shipping?`

**Expected Response:**
```
Shipping is $5, 1-3 business days in Singapore.
```

**Status:** ⬜ Not yet tested

**Your Result:**
```
[Paste actual response here]
```

---

### Test 15: Malaysia Location
**Query:** `I'm from Malaysia, can I buy?`

**Expected Response:**
```
Sorry, Singapore only.
```

**Status:** ⬜ Not yet tested

**Your Result:**
```
[Paste actual response here]
```

---

### Test 16: Cryptocurrency
**Query:** `Can I trade Bitcoin here?`

**Expected Response:**
```
Sorry, we don't handle crypto. We only do electronics in Singapore. Need product help?
```

**Status:** ⬜ Not yet tested

**Your Result:**
```
[Paste actual response here]
```

---

## 🛠️ Tech Support Tests

### Test 17: GPU Recommendation
**Query:** `good gpu for AI local LLM`

**Expected Response:**
```
For local LLMs, best GPU is NVIDIA RTX 4090 24GB. 
RTX 4080 is a cheaper option. Want me to check stock?
```

**Status:** ⬜ Not yet tested

**Your Result:**
```
[Paste actual response here]
```

---

### Test 18: Future Product (PS6)
**Query:** `Do you have PS6?`

**Expected Response:**
```
Not in stock yet. Want staff support to notify you when available?
```

**Status:** ⬜ Not yet tested

**Your Result:**
```
[Paste actual response here]
```

---

## 📊 Verification Summary

**Completion Status:**
- Total Tests: 18
- Verified: 1 ✅
- Pending: 17 ⬜
- Failed: 0 ❌

**Pass Rate:** [To be calculated after testing]

---

## 🎯 Voice Chat Tests (Optional)

If testing voice chat, verify these key differences:

### Voice Response Style:
- ✅ Short responses (under 50 words)
- ✅ No "S$" pronunciation (just "$")
- ✅ Follow-up questions ("Want more details?")
- ✅ Natural phrasing ("Got it" vs "Information saved")

### Voice Trade-In Flow:
```
Test: "I want to trade in my PS5"

Expected Flow:
1. "Which PS5? Slim, Fat, or Pro?"
2. [User answers] → "Worth about $400. Proceed?"
3. "yes" → "Storage size?"
4. [Continue through full flow]

✅ Must ask in this order:
   Storage → Condition → Box → Photos → Name → Phone → Email → Submit
```

---

## 📝 Notes Section

**Issues Found:**
```
[Document any discrepancies here]
```

**Suggestions:**
```
[Any improvements or changes needed]
```

---

**Verification Date:** _______________  
**Verified By:** _______________  
**Final Status:** ⬜ All Pass / ⬜ Some Issues / ⬜ Major Problems

---

*Save this file after completing all tests and share results with development team.*
