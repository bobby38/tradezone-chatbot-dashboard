# Voice Agent Test Scenarios - January 5, 2026

**Purpose:** Verify all fixes applied today work correctly in production  
**Test Method:** Browser-based voice chat via LiveKit  
**Expected Duration:** 30-45 minutes for all tests

---

## 🎯 Test Objectives

Test all 6 critical fixes applied:
1. ✅ PS4 Pro/Slim device pattern extraction
2. ✅ Price announcement format
3. ✅ Location check for warranty/support
4. ✅ TTS currency pronunciation
5. ✅ Brand/model validation before submission
6. ✅ ONE question per response rule

---

## Test Setup

### Prerequisites
- [ ] Voice agent deployed with latest code (commits: `2817a809`, `300510e9`, `8af67d2c`)
- [ ] `.env.local` updated on production server:
  ```bash
  VOICE_STACK=realtime
  VOICE_LLM_MODEL=gpt-4o-mini-realtime-preview-2024-12-17
  VOICE_TTS_SPEED=1.15
  NEXT_PUBLIC_API_URL=https://trade.rezult.co
  ```
- [ ] Voice agent service restarted
- [ ] Browser with microphone access (Chrome/Safari recommended)
- [ ] Test URL: https://trade.rezult.co (or your LiveKit test page)

---

## Test 1: PS4 Pro Trade-In Flow ⭐ CRITICAL

**Objective:** Test PS4 Pro device detection + price announcement + deterministic flow

### Steps

| Step | Your Action | Expected Agent Response | Status | Notes |
|------|-------------|------------------------|--------|-------|
| 1 | Say: "I want to trade in my PS4 Pro 1TB" | "Yes, we trade this. Price is 100 dollars. Want to proceed?" | ☐ | ✅ Must announce price FIRST |
| 2 | Say: "Yes" | "Condition? Mint, good, fair, or faulty?" | ☐ | ✅ ONE question only |
| 3 | Say: "Good" | "Got the box?" | ☐ | ✅ ONE question only |
| 4 | Say: "Yes" | "Photos help. Want to send one?" | ☐ | ✅ Ask for photos |
| 5 | Say: "No" | "Email for the quote?" | ☐ | ✅ Move to contact info |
| 6 | Say: "test@gmail.com" | "So that's test@gmail.com, correct?" | ☐ | ✅ Email confirmation |
| 7 | Say: "Yes" | "Phone number?" | ☐ | ✅ ONE question only |
| 8 | Say: "84489068" | "That's 84489068, correct?" | ☐ | ✅ Phone confirmation |
| 9 | Say: "Yes" | "Your name?" | ☐ | ✅ ONE question only |
| 10 | Say: "Bobby" | "Cash, PayNow, bank, or installments?" | ☐ | ✅ Payout question |
| 11 | Say: "Cash" | "PS4 Pro good, with box. Bobby, 84489068, email noted. Cash. Correct?" | ☐ | ✅ Short recap (≤20 words) |
| 12 | Say: "Yes" | "Done! We'll contact you soon. Anything else?" | ☐ | ✅ Submission success |

### Verification Checks

After test completes, check:

- [ ] **Database:** Supabase `tradein_leads` table shows:
  - `brand`: "Sony"
  - `model`: "PlayStation 4 Pro"
  - `storage`: "1TB"
  - `condition`: "good"
  - `contact_email`: "test@gmail.com"
  - `contact_phone`: "84489068"
  - `contact_name`: "Bobby"
  - `preferred_payout`: "cash"

- [ ] **Email:** Check `contactus@tradezone.sg` received trade-in notification

- [ ] **Voice Quality:**
  - [ ] Agent said "100 dollars" (NOT "dollar sign 100" or "S 100")
  - [ ] Speech speed felt dynamic (not too slow)
  - [ ] No multi-question bundling (each question was separate)

### ❌ Common Failures

| Problem | Likely Cause | Fix |
|---------|--------------|-----|
| Agent says "dollar sign 100" | TTS currency not applied | Check `_normalize_voice_currency` deployment |
| Database shows brand: null | Device pattern not deployed | Check `auto_save.py` has PS4 Pro pattern |
| Agent asks "Condition? Also, got the box?" | Multi-question bundling | Instructions not followed - check deployment |
| Submission failed with 400 error | Brand/model validation failed | Check validation code at line 1815 |

---

## Test 2: Warranty Support - Location Check ⭐ CRITICAL

**Objective:** Test Singapore location check happens FIRST for warranty requests

### Steps

| Step | Your Action | Expected Agent Response | Status | Notes |
|------|-------------|------------------------|--------|-------|
| 1 | Say: "I want to check my warranty" | "Are you in Singapore?" | ☐ | ✅ FIRST question MUST be location |
| 2 | Say: "Yes" | "What's the issue?" OR "Roughly when did you buy it?" | ☐ | ✅ Proceed to support collection |
| 3 | Say: "My GPU is faulty, bought 2 years ago" | "What is it for? Brand if you know." OR "Your name?" | ☐ | ✅ Collect device/issue details |
| 4 | Say: "PC, Asus" | "Your name?" | ☐ | ✅ Start contact collection |
| 5 | Say: "Test User" | "Phone number?" | ☐ | ✅ Sequential collection |
| 6 | Say: "84489068" | "Email address?" | ☐ | ✅ Sequential collection |
| 7 | Say: "support@test.com" | "So that's support@test.com, correct?" | ☐ | ✅ Email confirmation |
| 8 | Say: "Yes" | "Got it - I've sent this to the team. They'll get back to you soon." | ☐ | ✅ Confirmation message |

### Verification Checks

- [ ] **Email:** Check `contactus@tradezone.sg` received support request with:
  - Name: "Test User"
  - Phone: "84489068"
  - Email: "support@test.com"
  - Issue: Warranty check for faulty GPU, PC Asus, ~2 years old
  - Location: Singapore

- [ ] **Location Check:** Agent asked "Are you in Singapore?" as THE FIRST QUESTION (not after issue description)

### ❌ Test Failure: Location Check Skipped

**If agent goes straight to "What's the issue?" WITHOUT asking location:**

**Problem:** Forced reply not triggered  
**Check:** Is warranty keyword in `_maybe_force_reply()` at line 619?  
**Expected code:**
```python
if "warranty" in lower or "covered" in lower:
    return "Are you in Singapore?"
```

---

## Test 3: International Location Rejection

**Objective:** Test non-Singapore locations are rejected immediately

### Steps

| Step | Your Action | Expected Agent Response | Status | Notes |
|------|-------------|------------------------|--------|-------|
| 1 | Say: "Can you ship to Malaysia?" | "Sorry, Singapore only. We don't ship internationally." | ☐ | ✅ Immediate rejection |
| 2 | Say: "I'm in the USA" | "Sorry, Singapore only. We don't ship internationally." | ☐ | ✅ Immediate rejection |

### Verification Checks

- [ ] Agent does NOT proceed with trade-in/support flow for non-Singapore users
- [ ] Clear rejection message mentions "Singapore only"

---

## Test 4: Photo Upload Flow

**Objective:** Test agent WAITS for photo upload without asking next question prematurely

### Steps

| Step | Your Action | Expected Agent Response | Status | Notes |
|------|-------------|------------------------|--------|-------|
| 1 | Say: "Trade in my Steam Deck" | "Yes, we trade this. Price is X dollars. Want to proceed?" | ☐ | ✅ Price announcement |
| 2 | Say: "Yes" | "Storage size?" OR "Condition?" | ☐ | ✅ Device details |
| 3 | Answer questions until photos | ... | ☐ | ✅ Sequential flow |
| 4 | Agent asks: "Photos help. Want to send one?" | (You say:) "Yes" | ☐ | ✅ Photo question |
| 5 | Agent should respond | "Go ahead, send it." | ☐ | ✅ Photo prompt |
| 6 | **CRITICAL CHECK** | Agent should WAIT silently (no "What's your name?" yet!) | ☐ | ❌ FAIL if agent asks name before photo |
| 7 | Upload photo OR say "done" | (Agent acknowledges photo OR continues) | ☐ | ✅ Photo received |
| 8 | Agent should NOW ask | "Email for the quote?" | ☐ | ✅ Contact collection AFTER photos |

### ❌ Test Failure: Premature Question

**If agent says: "Go ahead, send it. Meanwhile, what's your name?"**

**Problem:** Multi-question bundling, breaking photo wait flow  
**Expected:** Agent should say ONLY "Go ahead, send it." and WAIT  
**Fix needed:** Enforce stricter ONE question rule in instructions

---

## Test 5: TTS Currency Pronunciation

**Objective:** Test agent says "200 dollars" NOT "S two hundred" or "dollar sign 200"

### Steps

| Step | Your Action | Expected Agent Response (Voice) | Expected Agent Response (Text/Screen) | Status |
|------|-------------|-------------------------------|--------------------------------------|--------|
| 1 | Say: "How much for my PS5?" | Voice says: "Yes, we trade this. Price is TWO HUNDRED dollars." | Text shows: "Yes, we trade this. Price is 200 dollars." | ☐ |
| 2 | Listen carefully | Should NOT say: "S two hundred" OR "dollar sign two hundred" OR "S dollar two hundred" | - | ☐ |

### Verification Checks

- [ ] **Voice pronunciation:** Agent says numbers + "dollars" (e.g., "two hundred dollars")
- [ ] **NO currency symbol pronunciation:** No "S", "dollar sign", "SGD", etc.
- [ ] **Text display:** Screen can show "S$200" or "$200" (that's fine, only voice matters)

### ❌ Test Failure: Bad TTS Pronunciation

**If agent says "S two hundred" or "dollar sign two hundred":**

**Problem:** `_normalize_voice_currency()` not being applied  
**Check:** Is function called on agent responses? (line 251-278)  
**Expected:** Text "S$200" should be converted to "200 dollars" before TTS

---

## Test 6: PS5 Pro Detection

**Objective:** Test PS5 Pro is correctly detected (new pattern added today)

### Steps

| Step | Your Action | Expected Agent Response | Status | Notes |
|------|-------------|------------------------|--------|-------|
| 1 | Say: "I want to trade in my PS5 Pro 2TB" | "Yes, we trade this. Price is X dollars. Want to proceed?" | ☐ | ✅ Price announcement |
| 2 | Complete flow | ... | ☐ | ✅ Full flow |

### Verification Checks

- [ ] **Database:** `brand`: "Sony", `model`: "PlayStation 5 Pro"
- [ ] **Storage:** "2TB" captured correctly

---

## Test 7: Speech Speed Check

**Objective:** Verify agent speaks at 1.15x speed (more dynamic)

### Steps

| Step | Your Action | Expected Result | Status | Notes |
|------|-------------|----------------|--------|-------|
| 1 | Have a normal conversation | Agent should feel more dynamic/faster than before | ☐ | ✅ Speed improvement |
| 2 | Compare to previous sessions (if available) | Noticeably faster response delivery | ☐ | ✅ Speed comparison |

### Verification Checks

- [ ] **Speed feels dynamic:** Not robotic or too slow
- [ ] **Still clear:** Speed increase doesn't hurt comprehension
- [ ] **Adjustable:** If too fast/slow, adjust `VOICE_TTS_SPEED` env variable (1.0 = normal, 1.2 = faster, 1.1 = slightly faster)

---

## Test 8: One Question Per Response

**Objective:** Verify agent never bundles multiple questions

### Steps

Monitor throughout ALL tests above:

- [ ] Agent NEVER says: "Condition? Also, got the box?"
- [ ] Agent NEVER says: "What's your email and phone number?"
- [ ] Agent NEVER says: "Send photos. Meanwhile, what's your name?"
- [ ] Each question is followed by WAIT for user response
- [ ] Next question only comes AFTER user answers previous one

### ❌ Test Failure: Multi-Question Bundling Found

**If agent combines questions:**

**Problem:** LLM not following ONE question instruction strictly  
**Check:** Instructions at line 2248 should emphasize:
```
🔴 ONE QUESTION PER TURN - CRITICAL: Ask exactly ONE question, then STOP and WAIT
```

---

## Test Summary Scorecard

After completing all tests, fill this out:

| Test | Status | Notes |
|------|--------|-------|
| Test 1: PS4 Pro Trade-In | ☐ PASS ☐ FAIL | |
| Test 2: Warranty Location Check | ☐ PASS ☐ FAIL | |
| Test 3: International Rejection | ☐ PASS ☐ FAIL | |
| Test 4: Photo Upload Flow | ☐ PASS ☐ FAIL | |
| Test 5: TTS Currency | ☐ PASS ☐ FAIL | |
| Test 6: PS5 Pro Detection | ☐ PASS ☐ FAIL | |
| Test 7: Speech Speed | ☐ PASS ☐ FAIL | |
| Test 8: One Question Rule | ☐ PASS ☐ FAIL | |

**Overall Score:** ___/8 tests passed

---

## 🐛 Bug Report Template

If any test fails, use this template:

```
**Test Failed:** [Test name]
**Step:** [Which step failed]
**Expected:** [What should have happened]
**Actual:** [What actually happened]
**Voice Agent Response:** [Exact words agent said]
**Database State:** [Check Supabase tradein_leads table]
**Logs:** [Check Coolify logs for errors]
**Deployment Verified:** [✓] Code deployed [✓] .env.local updated [✓] Service restarted
```

---

## 🎉 Success Criteria

**Minimum to ship:**
- ✅ Test 1 (PS4 Pro Trade-In): MUST PASS - Core functionality
- ✅ Test 2 (Warranty Location): MUST PASS - Legal/compliance requirement
- ✅ Test 5 (TTS Currency): MUST PASS - User experience critical

**Nice to have:**
- ✅ Test 3 (International Rejection): Should pass
- ✅ Test 4 (Photo Upload): Should pass
- ✅ Test 6 (PS5 Pro): Should pass
- ✅ Test 7 (Speech Speed): Subjective, can adjust
- ✅ Test 8 (One Question): Should pass

**Ship if:** 6/8 tests pass including all 3 "MUST PASS" tests

---

## 📊 Quick Reference: What Changed Today

| Component | Before | After |
|-----------|--------|-------|
| **Price Format** | "Your PS4 Pro is worth about $100 for trade-in" | "Yes, we trade this. Price is 100 dollars. Want to proceed?" |
| **Device Detection** | Missing PS4 Pro/Slim, PS5 variants | All PS4/PS5 variants detected |
| **TTS Currency** | "S two hundred" OR "dollar sign 200" | "two hundred dollars" |
| **Location Check** | Sometimes skipped | ALWAYS asked first for warranty/support |
| **Speech Speed** | 1.0x (normal) | 1.15x (15% faster) |
| **Validation** | Could submit without brand/model | Blocked if brand/model missing |

---

**Happy Testing! 🚀**
