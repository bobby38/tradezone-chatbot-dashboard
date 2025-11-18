# Testing Checklist - TradeZone Chatbot
**Date:** January 18, 2025  
**Deployments:** Commits 285d968 → 7ca0a19

## Pre-Testing: Deployment Verification

- [ ] Code pulled from main branch (latest: 7ca0a19)
- [ ] Coolify redeploy completed successfully
- [ ] No build errors in deployment logs
- [ ] Application status shows "Running" (green)

---

## Test Suite 1: Product Family Filtering ✅

### PS5 Products (Should ONLY show PS5)
- [ ] **Test:** "any ps5 bundle"
  - ✅ **Expected:** PS5 30th Anniversary, Ghost of Yotei
  - ❌ **Not Expected:** Nintendo Switch, Moza R3, Sims 4
  
- [ ] **Test:** "PS5 games"
  - ✅ **Expected:** PlayStation 5 game titles only
  - ❌ **Not Expected:** PS4, Xbox, Switch games

### Xbox Products (Should ONLY show Xbox)
- [ ] **Test:** "xbox bundles"
  - ✅ **Expected:** Xbox Series consoles/accessories
  - ❌ **Not Expected:** PlayStation, Nintendo products
  
- [ ] **Test:** "xbox series x price"
  - ✅ **Expected:** Xbox Series X pricing only
  - ❌ **Not Expected:** Other console pricing

### Nintendo Switch (Should ONLY show Switch)
- [ ] **Test:** "switch bundles"
  - ✅ **Expected:** Nintendo Switch consoles/bundles
  - ❌ **Not Expected:** PlayStation, Xbox products

### General Search (No Family Filter)
- [ ] **Test:** "controllers"
  - ✅ **Expected:** Controllers from ALL families (mixed results OK)
  
- [ ] **Test:** "headphones"
  - ✅ **Expected:** Mixed accessories (no filtering)

---

## Test Suite 2: Trade-In Price-First Flow ✅

### Xbox Upgrade (Price BEFORE Condition)
- [ ] **Test:** "Can I upgrade Xbox Series S to X?"
  - **Step 1:** Agent shows price immediately
    - ✅ "Xbox Series S trade-in: S$150"
    - ✅ "Xbox Series X: S$600"
    - ✅ "Top-up: S$450"
  - **Step 2:** THEN asks condition
    - ✅ "What's the condition - mint/good/fair/faulty?"
  - ❌ **Wrong:** Asking condition BEFORE showing price

### PS5 Trade-In
- [ ] **Test:** "How much for my PS5?"
  - **Step 1:** Agent shows price range
    - ✅ "PS5 trade-in ranges S$400-550"
  - **Step 2:** Asks storage
    - ✅ "What storage - 1TB or 825GB?"
  - ❌ **Wrong:** Asking storage BEFORE price

### Nintendo Switch Trade-In
- [ ] **Test:** "Trade in Nintendo Switch"
  - **Step 1:** Price shown first
    - ✅ Shows trade-in value range
  - **Step 2:** Qualification questions
    - ✅ Model (OLED/Standard/Lite)
    - ✅ Condition

---

## Test Suite 3: Performance Monitoring 🚀

### Vector Search Latency
- [ ] Check Coolify logs after each search
  - ✅ **Target:** <2 seconds
  - ⚠️ **Warning:** 2-4 seconds
  - ❌ **Issue:** >4 seconds

**Log Pattern:**
```
[ChatKit] Vector search: XXXXms for query: "..."
```

### Token Usage
- [ ] Check logs for token consumption
  - ✅ **Target:** <5,000 tokens
  - ⚠️ **Warning:** 5,000-8,000 tokens
  - ❌ **Issue:** >8,000 tokens

**Log Pattern:**
```
[ChatKit] High usage detected: { tokens: XXXX, cost: $X.XXXX }
```

### Response Time (User-Perceived)
- [ ] Measure time from send to response
  - ✅ **Good:** <3 seconds total
  - ⚠️ **Acceptable:** 3-5 seconds
  - ❌ **Poor:** >5 seconds

---

## Test Suite 4: Zep Graph Integration 🧠

### Structured Queries
- [ ] **Test:** "What bundles are available for PS5?"
  - Check telemetry (Settings → Bot Logs)
  - ✅ **Expected:** `tradezone_graph_query` tool used
  
- [ ] **Test:** "Can I upgrade from Xbox S to X?"
  - ✅ **Expected:** Graph query for upgrade path

### Memory Context
- [ ] Multi-turn conversation
  - **Turn 1:** "I have a PS5"
  - **Turn 2:** "How much can I get for it?"
  - ✅ **Expected:** Agent remembers PS5 from Turn 1

---

## Test Suite 5: Edge Cases & Error Handling 🛡️

### Invalid Queries
- [ ] **Test:** "asdfghjkl"
  - ✅ **Expected:** Graceful "I didn't understand" response
  
- [ ] **Test:** Empty message
  - ✅ **Expected:** No crash, prompt for input

### Cross-Family Confusion
- [ ] **Test:** "PS5 Xbox bundle"
  - ✅ **Expected:** Clarifying question about which console
  - ❌ **Wrong:** Showing both PS5 and Xbox mixed

### Long Conversation (History Truncation Test)
- [ ] Have 25+ message conversation
  - ✅ **Expected:** Tokens stay <8K (history truncated)
  - ❌ **Wrong:** Tokens keep growing unbounded

---

## Test Suite 6: Email & Trade-In Submissions 📧

### Trade-In Email Flow
- [ ] Complete trade-in submission
  - Device details collected
  - Contact info provided
  - ✅ **Expected:** Email sent to contactus@tradezone.sg
  - Check Supabase `trade_in_leads` table

### Support Email
- [ ] Request staff contact (non-trade-in)
  - ✅ **Expected:** Email via `emailSend` tool
  - ✅ **Expected:** Singapore location verified

---

## Test Suite 7: Voice Chat (Optional) 🎤

### Voice Search
- [ ] Click "Start A Call"
- [ ] Say: "Do you have PS5 bundles?"
  - ✅ **Expected:** Same family filtering as text
  - ✅ **Expected:** Voice response within 2-3s

### Voice Trade-In
- [ ] Say: "I want to trade in my Xbox"
  - ✅ **Expected:** Price-first flow
  - ✅ **Expected:** Tool calls work (tradein_update_lead)

---

## Results Summary

**Date Tested:** _______________  
**Tester:** _______________

| Test Suite | Pass | Fail | Notes |
|------------|------|------|-------|
| 1. Family Filtering | [ ] | [ ] | |
| 2. Trade-In Flow | [ ] | [ ] | |
| 3. Performance | [ ] | [ ] | |
| 4. Zep Graph | [ ] | [ ] | |
| 5. Edge Cases | [ ] | [ ] | |
| 6. Email Submissions | [ ] | [ ] | |
| 7. Voice Chat | [ ] | [ ] | |

**Overall Status:** 🟢 Pass / 🟡 Partial / 🔴 Fail

**Critical Issues Found:**
- 

**Minor Issues Found:**
- 

**Recommended Actions:**
- 

---

## Rollback Procedure (If Major Issues)

```bash
# Revert to previous stable commit
git revert 7ca0a19 f04103e 402d5b6 285d968
git push

# Or rollback to specific commit
git reset --hard a036e68
git push --force

# Then redeploy in Coolify
```

**⚠️ Only use if critical production issues occur!**

---
