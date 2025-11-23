# TradeZone Chatbot - Comprehensive Test Plan
**Last Updated**: November 23, 2025  
**Deployment**: After commit `da918b7` (all 7 critical fixes)

---

## 🎯 Test Objectives

Verify all November 23 fixes are working in production:
1. ✅ Product search returns real products (no hallucinations)
2. ✅ Accessories filtered from phone/tablet searches
3. ✅ Promotion queries check live website via Perplexity
4. ✅ Trade-in flow requests photos before confirmation
5. ✅ Installment detection captures month-based responses
6. ✅ Voice chat uses exact WooCommerce prices
7. ✅ No Zep 403 errors blocking conversations

---

## 📱 Test Environment

**Platform**: https://trade.rezult.co  
**Chat URL**: https://trade.rezult.co/dashboard/chat  
**Voice URL**: https://trade.rezult.co (voice widget)  
**Dashboard**: https://trade.rezult.co/dashboard

**Test Accounts**:
- Text chat: Available to all visitors (Guest sessions)
- Voice chat: Available to all visitors
- Dashboard: Requires admin login

---

## 🧪 Test Cases

### 1. Product Search - Anti-Hallucination

**Priority**: 🔴 CRITICAL  
**Fixes Tested**: Commits `ec88798`, `42c9c0c`, `7b56be0`

#### Test 1.1: iPhone Search (Text Chat)
```
Input: "any cheap iphone"

Expected Output:
- ✅ Shows real iPhones from WooCommerce
- ✅ Cheapest option: iPhone 13 mini ~S$429
- ✅ NO "Hades S$40" hallucination
- ✅ NO "iPhone SE" (not in stock)
- ✅ Product links included

Pass Criteria:
- All product names exist in WooCommerce
- All prices match WooCommerce data
- No accessories in results (e.g., Tesla Cyberdock)
```

#### Test 1.2: iPhone Search (Voice Chat)
```
Voice Input: "What's the cheapest iPhone you have?"

Expected Output:
- ✅ Voice says real product name + exact price
- ✅ Example: "We have the iPhone 13 mini for S$429"
- ✅ NO "iPhone SE for S$599" hallucination
- ✅ NO wrong prices (e.g., iPhone 13 at S$1,299)

Pass Criteria:
- Voice transcript shows exact WooCommerce data
- No hallucinated products mentioned
```

#### Test 1.3: Generic Phone Query
```
Input: "any phone" or "show me phones"

Expected Output:
- ✅ Shows actual phones (iPhone, Samsung, etc.)
- ✅ NO chargers (Tesla Cyberdock)
- ✅ NO cases or screen protectors
- ✅ NO warranty extensions
- ✅ Maximum 5 results initially

Pass Criteria:
- Zero accessories in results
- All items are actual phones
```

---

### 2. Accessory Filtering

**Priority**: 🟡 HIGH  
**Fixes Tested**: Commit `32f562f`

#### Test 2.1: Phone Category - No Accessories
```
Inputs to test:
- "any iphone"
- "cheap samsung phone"
- "show me tablets"

Expected Output:
- ✅ Only phones/tablets shown
- ✅ NO chargers, cables, docks
- ✅ NO cases, covers, protectors
- ✅ NO stands, holders, mounts

Fail Indicators:
- ❌ Tesla Cyberdock appears
- ❌ Any "charger", "case", "protector" in results
```

#### Test 2.2: Accessory Search Still Works
```
Input: "any iphone charger"

Expected Output:
- ✅ Shows chargers (accessories allowed when explicitly requested)
- ✅ Tesla Cyberdock OK in this context

Pass Criteria:
- Accessories only blocked from phone/tablet category searches
- Direct accessory searches still work
```

---

### 3. Promotion Queries - Live Website Check

**Priority**: 🟡 HIGH  
**Fixes Tested**: Commit `4525d31`

#### Test 3.1: General Promotion Query
```
Inputs to test:
- "any promotion at the moment"
- "any deals"
- "black friday sale"
- "current offers"

Expected Output:
- ✅ Uses Perplexity to check tradezone.sg
- ✅ Returns live website content
- ✅ NOT stale vector store data

Verification:
- Check logs for "[ChatKit] Perplexity search" 
- Response should reference recent website content
```

---

### 4. Trade-In Flow - Photo Request

**Priority**: 🔴 CRITICAL  
**Fixes Tested**: Commit `ec88798`

#### Test 4.1: Complete Trade-In Flow
```
Conversation Flow:
1. User: "trade in ps4 pro for ps5"
2. Agent: Asks for storage
3. User: "1tb"
4. Agent: Asks for condition
5. User: "good"
6. Agent: Asks for accessories
7. User: "yes box and controller"
8. Agent: Asks for email
9. User: "test@email.com"
10. Agent: Asks for phone
11. User: "84489068"
12. Agent: Asks for name
13. User: "John Doe"
14. Agent: ✅ SHOULD ASK FOR PHOTOS HERE ← CRITICAL
15. User: "no photos"
16. Agent: Asks for payout method
17. User: "cash"
18. Agent: Confirms and submits

Pass Criteria:
- ✅ Photo request appears BEFORE payout question
- ✅ Photo request appears AFTER contact info
- ✅ Accepts "no photos" / "don't have any"
- ✅ Email sent after completion

Fail Indicators:
- ❌ Never asks for photos
- ❌ Asks for photos AFTER payout
- ❌ Email not sent
```

---

### 5. Installment Detection

**Priority**: 🟡 HIGH  
**Fixes Tested**: Commit `ec88798`

#### Test 5.1: Month-Based Installment
```
Conversation:
1. Agent: "Cash, PayNow, or bank transfer?"
2. User: "3 months" OR "6mo" OR "12 month"

Expected:
- ✅ Captures as "installment" payout
- ✅ Dashboard shows "Installment" (not "Walk-in")
- ✅ Email sent with installment option

Verification:
- Check /dashboard/trade-in for lead
- preferred_payout should be "installment"
```

#### Test 5.2: Explicit Installment
```
Inputs:
- "installment"
- "payment plan"
- "can I do installments?"

Expected:
- ✅ All variations captured correctly
```

---

### 6. System Stability

**Priority**: 🔴 CRITICAL  
**Fixes Tested**: Commit `ec88798` (Zep disabled)

#### Test 6.1: No 403 Errors
```
Test Method:
1. Have 10+ conversation turns
2. Check Coolify logs for errors

Expected:
- ✅ NO Zep 403 errors
- ✅ Conversations complete normally
- ✅ Warning logs: "Zep.ai memory DISABLED"

Fail Indicators:
- ❌ "[Zep] thread.addMessages failed"
- ❌ 403 status codes
- ❌ Conversations abruptly ending
```

#### Test 6.2: Long Conversations
```
Test:
- Start conversation
- Send 20+ messages
- Mix of product searches and questions

Expected:
- ✅ All messages get responses
- ✅ No crashes or timeouts
- ✅ Context maintained via chat history
```

---

### 7. Voice Chat Parity

**Priority**: 🟡 HIGH  
**Fixes Tested**: Commit `42c9c0c`

#### Test 7.1: Voice Product Search
```
Voice Inputs:
- "Do you have any gaming chairs?"
- "What's the price of PS5?"
- "Show me cheap tablets"

Expected:
- ✅ Same anti-hallucination as text chat
- ✅ Exact product names from WooCommerce
- ✅ Exact prices from WooCommerce
- ✅ No accessories in phone/tablet results

Verification:
- Voice transcript should match text chat behavior
```

---

## 🔍 Regression Tests

**Ensure existing features still work:**

### Regression 1: Standard Product Search
```
Inputs:
- "ps5 price"
- "rtx 4090"
- "nintendo switch"

Expected:
- ✅ WooCommerce products shown
- ✅ Vector enrichment (specs, details)
- ✅ Product links included
```

### Regression 2: Support Flow
```
Input: "I want to speak to staff"

Expected:
- ✅ Collects name + email + phone
- ✅ Sends email via sendemail tool
- ✅ Creates submission in dashboard
- ✅ Reference code provided
```

### Regression 3: Trade-In Email
```
After completing trade-in flow:

Expected:
- ✅ Email sent to contactus@tradezone.sg
- ✅ BCC to info@rezult.co
- ✅ Subject: "🎮 New Trade-In Request - {lead-id}"
- ✅ Includes all device details
- ✅ Shows in /dashboard/trade-in
```

---

## 📊 Test Results Template

```markdown
## Test Session: [Date]
**Tester**: [Name]
**Environment**: Production / Staging
**Commit**: da918b7

### Product Search Tests
- [ ] Test 1.1: iPhone Search (Text) - PASS/FAIL
- [ ] Test 1.2: iPhone Search (Voice) - PASS/FAIL
- [ ] Test 1.3: Generic Phone Query - PASS/FAIL

### Accessory Filtering Tests
- [ ] Test 2.1: No Accessories in Phone Results - PASS/FAIL
- [ ] Test 2.2: Direct Accessory Search - PASS/FAIL

### Promotion Tests
- [ ] Test 3.1: Perplexity for Promotions - PASS/FAIL

### Trade-In Flow Tests
- [ ] Test 4.1: Photo Request Timing - PASS/FAIL

### Installment Tests
- [ ] Test 5.1: Month-Based Detection - PASS/FAIL
- [ ] Test 5.2: Explicit Installment - PASS/FAIL

### Stability Tests
- [ ] Test 6.1: No 403 Errors - PASS/FAIL
- [ ] Test 6.2: Long Conversations - PASS/FAIL

### Voice Parity Tests
- [ ] Test 7.1: Voice Product Search - PASS/FAIL

### Regression Tests
- [ ] Regression 1: Standard Search - PASS/FAIL
- [ ] Regression 2: Support Flow - PASS/FAIL
- [ ] Regression 3: Trade-In Email - PASS/FAIL

### Issues Found
1. [Issue description]
   - Severity: Critical/High/Medium/Low
   - Steps to reproduce
   - Expected vs Actual

### Overall Status
- Total Tests: X
- Passed: X
- Failed: X
- Blocked: X
```

---

## 🚨 Known Limitations

1. **LLM Probabilistic Behavior**: Even with 3-layer protection, occasional edge cases may slip through. Monitor for new hallucination patterns.

2. **Perplexity Rate Limits**: Promotion queries use Perplexity API which has rate limits. May fail gracefully under high load.

3. **Voice Transcription Accuracy**: Voice chat depends on OpenAI transcription quality. Accents or background noise may affect accuracy.

4. **WooCommerce Cache**: Product data cached for performance. New products may take up to 1 hour to appear.

---

## 📈 Success Metrics

**Must Pass**:
- ✅ 0 product hallucinations in 20 test queries
- ✅ 0 accessories in phone/tablet searches
- ✅ 100% photo request before payout
- ✅ 0 Zep 403 errors in logs

**Should Pass**:
- ✅ Promotion queries use Perplexity 90%+ of time
- ✅ Installment detection 95%+ accuracy
- ✅ Voice/text price parity 100%

---

## 🔄 Post-Deployment Checklist

After deploying to production:
1. [ ] Run all test cases above
2. [ ] Monitor Coolify logs for 30 minutes
3. [ ] Check /dashboard/trade-in for new leads
4. [ ] Verify email notifications arrive
5. [ ] Test from mobile device
6. [ ] Test from different browsers
7. [ ] Check dashboard analytics update
8. [ ] Verify CSV export still works
9. [ ] Test admin functions (assign, status update)
10. [ ] Confirm no regression in existing features

---

## 📞 Emergency Rollback

If critical issues found:

```bash
# Revert to previous stable commit
git revert da918b7..HEAD
git push origin main

# Or rollback specific commit
git revert <commit-hash>
git push origin main
```

**Previous Stable Commits**:
- `ab2f908` - Before November 23 fixes (Gemini integration)
- `cb26c2a` - Before Gemini (working baseline)

---

## 📝 Test Log History

### November 23, 2025 - Initial Deployment
- Commits: `ec88798`, `42c9c0c`, `7b56be0`, `32f562f`, `4525d31`
- Status: PENDING USER TESTING
- Tester: [TBD]

