# Final Testing Checklist - January 18, 2025

## Deployment Status
- [ ] Coolify redeploy completed
- [ ] Build successful (no errors)
- [ ] Application accessible at production URL

---

## 🎯 Priority 1: Critical Functionality Tests

### Test 1: Product Family Filtering (PS5)
**User Query:** "any ps5 bundle"

**Expected Results:**
- ✅ Shows PS5 30th Anniversary Bundle
- ✅ Shows Ghost of Yotei Bundle  
- ✅ Shows other PS5-specific products
- ❌ Does NOT show Nintendo Switch products
- ❌ Does NOT show Moza R3 (racing wheel)
- ❌ Does NOT show Sims 4

**Pass Criteria:**
- Zero cross-family contamination
- All results are PS5-related

**Rollback If:**
- Any non-PS5 products appear in results

---

### Test 2: Product Family Filtering (Xbox)
**User Query:** "xbox bundles"

**Expected Results:**
- ✅ Shows Xbox Series X/S products only
- ❌ Does NOT show PlayStation products
- ❌ Does NOT show Nintendo products

**Pass Criteria:**
- All results are Xbox-related

---

### Test 3: Trade-In Price-First Flow
**User Query:** "Can I upgrade Xbox Series S to X?"

**Expected Response Order:**
1. **First:** Agent searches trade-in prices
2. **Second:** Agent quotes "Xbox Series S trade-in is S$150 (preowned). Series X costs S$600 new, so you'd top up S$450. Want to proceed?"
3. **Then (ONLY after user confirms):** Asks about condition

**WRONG Flow (Fail):**
- Agent asks "What's the condition?" BEFORE showing price

**Pass Criteria:**
- Price shown in FIRST response
- Condition question comes AFTER user confirms interest

**Verification Data:**
- Xbox Series S trade-in: S$150
- Xbox Series X new price: S$600
- Gap up: S$450

---

### Test 4: Trade-In Price Accuracy
**User Query:** "What's the trade-in value for PS5?"

**Expected Prices (verify against data/tradezone_price_grid.jsonl):**
- PS5 Standard (preowned): S$350-380
- PS5 Digital (preowned): S$280-300

**Pass Criteria:**
- Prices match price grid data exactly
- Currency shown as S$ (Singapore Dollars)

---

## ⚡ Priority 2: Performance Tests

### Test 5: Vector Search Latency
**Monitor in Coolify Logs:**

**Before Optimization:**
```
[ChatKit] Vector search latency: 4.3s
```

**After Optimization (Expected):**
```
[ChatKit] Vector search latency: <2s (ideally <1s)
```

**Pass Criteria:**
- Latency consistently below 2 seconds
- No regression to 4s+ times

**Test Query:** "any ps5 bundle"

---

### Test 6: Token Usage Reduction
**Monitor in Coolify Logs:**

**Before Optimization:**
```
Total tokens: 12,490
```

**After Optimization (Expected):**
```
Total tokens: 3,000-5,000 range
```

**Pass Criteria:**
- Token usage below 6,000 per query
- History truncation working (max 20 messages)

**Test Method:**
1. Start fresh conversation
2. Send 30+ messages back and forth
3. Check logs - should see truncation at 20 messages

---

## 🔧 Priority 3: Integration Tests

### Test 7: Zep Graph Query Tool
**User Query:** "What bundles are available for PS5?"

**Expected Behavior:**
- Agent uses `tradezone_graph_query` tool (check telemetry)
- Returns structured data from Zep graph
- Graph ID: `b1ad95f2-5fc2-4c55-a778-b45b7cea8dd3`

**Pass Criteria:**
- Graph query appears in Bot Logs
- 182 total entities (88 products + 94 trade-in entries)

---

### Test 8: WooCommerce Fallback Filtering
**Setup:** Temporarily empty catalog (or query for obscure product)

**User Query:** "ps5 controller"

**Expected Behavior:**
- Falls back to WooCommerce API
- Family filtering STILL applies
- Does NOT return Xbox/Switch controllers

**Pass Criteria:**
- WooCommerce results respect family keywords
- No cross-contamination even in fallback mode

---

## 📧 Priority 4: Email & Notifications

### Test 9: Trade-In Submission Email
**User Flow:**
1. Complete trade-in conversation
2. Submit trade-in request
3. Check email delivery

**Expected:**
- Email sent to: `contactus@tradezone.sg`
- BCC: `info@rezult.co`
- Subject: `🎮 New Trade-In Request - {lead-id}`
- Body contains: Brand, Model, Condition, User contact info

**Pass Criteria:**
- Email received within 2 minutes
- All fields populated correctly
- No SMTP errors in logs

---

### Test 10: Support Request Email (Singapore Only)
**User Query:** "I need help with my order"

**Expected Behavior:**
1. Agent asks: "Are you in Singapore?"
2. If YES → Collects phone number and sends support email
3. If NO → Politely declines

**Pass Criteria:**
- Location verification enforced
- Phone number collected
- Email sent with all details

---

## 🎤 Priority 5: Voice Chat Tests

### Test 11: Realtime Voice Chat Configuration
**Test Endpoint:** `POST /api/chatkit/realtime`

**Expected Response:**
```json
{
  "client_secret": {
    "value": "eph_*****",
    "expires_at": 1737244800
  },
  "session": { ... },
  "tools": [ ... ]
}
```

**Pass Criteria:**
- Ephemeral key generated
- All tools registered (search_products, tradein_update_lead, etc.)
- Voice config includes correct instructions

---

### Test 12: Voice Trade-In Flow
**Via Voice Chat:** "I want to trade in my Xbox Series S"

**Expected:**
1. Agent responds with price (voice)
2. Agent asks condition (voice)
3. Trade-in created in database
4. Email notification sent

**Pass Criteria:**
- Voice responses under 3 seconds
- Price-first flow maintained in voice
- Email notification triggered

---

## 🛡️ Priority 6: Security & Rate Limiting

### Test 13: API Key Authentication
**Test:** `POST /api/chatkit/agent` without X-API-Key header

**Expected:**
```json
{ "error": "Unauthorized", "status": 401 }
```

**Pass Criteria:**
- Request rejected
- Security event logged to `chat_security_events`

---

### Test 14: Rate Limiting (IP-Based)
**Test:** Send 25 requests in 1 minute from same IP

**Expected:**
- First 20 requests: Success
- Request 21+: `429 Too Many Requests`
- Response: `{ "error": "Too many requests" }`

**Pass Criteria:**
- Rate limit enforced at 20 req/min
- Cooldown period works (60 seconds)

---

### Test 15: Session Budget Control
**Test:** Create session, send queries until budget exceeded

**Expected:**
- Budget limit: $10/day (default)
- After limit: `403 Forbidden - Daily budget exceeded`
- Logged to `chat_usage_metrics`

**Pass Criteria:**
- Budget tracking accurate
- Hard cutoff at limit
- Resets at midnight UTC

---

## 🔍 Priority 7: Edge Cases

### Test 16: Empty Catalog Handling
**Scenario:** Query for product not in catalog

**User Query:** "Do you have VR headsets?"

**Expected:**
1. Catalog search returns empty
2. Falls back to WooCommerce API
3. If WooCommerce empty → Falls back to Perplexity
4. Graceful response (not error)

**Pass Criteria:**
- No crashes or error messages shown to user
- Fallback chain works correctly

---

### Test 17: Long Conversation History
**Test:**
1. Start conversation
2. Send 50+ messages
3. Check token usage remains stable

**Expected:**
- History truncated at 20 messages (10 exchanges)
- Token usage plateaus around 5K
- No unbounded growth

**Pass Criteria:**
- Memory usage stable
- Performance consistent throughout conversation

---

### Test 18: Special Characters in Query
**User Query:** "PS5 bundle with Spider-Man 2 (disc version) & controller?"

**Expected:**
- Query parsed correctly
- Special characters handled (&, -, ?)
- Returns relevant PS5 products

**Pass Criteria:**
- No parsing errors
- Results accurate despite special chars

---

## 📊 Success Metrics Summary

### Must Pass (Critical):
- ✅ Test 1: Product family filtering (PS5)
- ✅ Test 3: Trade-in price-first flow
- ✅ Test 5: Vector search latency <2s
- ✅ Test 6: Token usage <6K
- ✅ Test 9: Trade-in email delivery

### Should Pass (Important):
- ✅ Test 2: Xbox family filtering
- ✅ Test 4: Trade-in price accuracy
- ✅ Test 7: Zep graph integration
- ✅ Test 13: API authentication

### Nice to Have (Non-Critical):
- ✅ Test 8: WooCommerce fallback filtering
- ✅ Test 10: Support email flow
- ✅ Test 11-12: Voice chat tests
- ✅ Test 14-18: Edge cases

---

## 🚨 Rollback Procedure

**If Any Critical Test Fails:**

1. **Immediate Rollback:**
   ```bash
   git log --oneline  # Find previous working commit
   git revert 7ca0a19  # Revert performance optimization
   git revert f04103e  # Revert WooCommerce filtering
   git revert 402d5b6  # Revert trade-in price-first
   git revert 285d968  # Revert catalog filtering
   git push origin main
   ```

2. **Redeploy in Coolify:**
   - Click "Redeploy" button
   - Monitor build logs

3. **Notify Team:**
   - Document failure in AGENT.md
   - Create issue in GitHub (if applicable)

4. **Investigation:**
   - Check Coolify logs for errors
   - Review Supabase logs
   - Test locally with `npm run dev`

---

## ✅ Sign-Off Checklist

- [ ] All Priority 1 tests passed
- [ ] All Priority 2 tests passed
- [ ] At least 75% of Priority 3-7 tests passed
- [ ] No regressions in existing functionality
- [ ] Performance improvements verified (latency + tokens)
- [ ] Email notifications working
- [ ] Documentation updated (this file + AGENT.md)
- [ ] Team notified of deployment

**Tested By:** _________________  
**Date:** _________________  
**Status:** [ ] PASS [ ] FAIL [ ] PARTIAL  
**Notes:** _________________________________________________

---

## 📝 Post-Deployment Monitoring (72 Hours)

### Monitor Daily:
1. **Coolify Logs → Search for:**
   - `[ChatKit] Vector search latency:`
   - `[ChatKit] Token usage:`
   - `ERROR` or `FATAL`

2. **Supabase Dashboard → Check:**
   - `chat_usage_metrics` table (cost tracking)
   - `chat_security_events` table (rate limit violations)
   - `chat_logs` table (conversation quality)

3. **User Feedback:**
   - Slower response times? → Check latency logs
   - Wrong product results? → Check family filtering
   - Email not received? → Check SMTP logs

### Success Indicators:
- [ ] Average latency: <2s (down from 4.3s)
- [ ] Average tokens: <5K (down from 12K)
- [ ] Zero product family cross-contamination
- [ ] 100% trade-in price-first adherence
- [ ] 100% email delivery rate

---

**Last Updated:** January 18, 2025  
**Related Docs:** 
- `PERFORMANCE_OPTIMIZATION_PLAN.md`
- `TESTING_CHECKLIST_2025-01-18.md`
- `ENV_BACKUP_INSTRUCTIONS.md`
- `AGENT.md` (changelog section)
