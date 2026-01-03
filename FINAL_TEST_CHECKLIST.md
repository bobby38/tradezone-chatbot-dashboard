# Final Test Checklist - Before Voice Deployment
**Date:** 2026-01-03  
**Purpose:** Validate all critical fixes before switching to voice mode

---

## ✅ Trade-In Price Grid Tests

### Test 1: PS5 Pricing (Critical Fix)
**Input:** "How much can I trade in my PS5?"

**Expected:**
- Should show PS5 prices: $250-700 range
- Should ask which model (Fat/Slim/Pro)
- Should ask Digital or Disc edition
- Should NOT show $60 (that was the PS4 bug!)

**Pass Criteria:**
- ✅ Shows correct PS5 pricing ($250-700)
- ✅ Does NOT mention PS4 pricing
- ✅ Asks clarifying questions about model

---

### Test 2: PS4 vs PS5 Distinction
**Input:** "PlayStation 5 trade in"

**Expected:**
- Should match PS5 ONLY (not PS4)
- Should show $250-700 range
- Should ask for specific variant

**Pass Criteria:**
- ✅ Returns PS5 prices ($250-700)
- ✅ Does NOT return PS4 prices ($50-120)

---

### Test 3: Trade-Up with Installment
**Input:** "Trade my PS4 Pro 1TB for PS5 Pro on installment"

**Expected:**
- PS4 Pro trade-in: $100
- PS5 Pro retail: $900
- Top-up: $800
- Installment options:
  - 6 months: ~$133/month
  - 12 months: ~$67/month
- Sets preferred_payout to "installment" automatically

**Pass Criteria:**
- ✅ Shows correct PS4 Pro value ($100)
- ✅ Shows correct PS5 Pro price ($900)
- ✅ Calculates top-up ($800)
- ✅ Shows monthly payment options
- ✅ Response is concise (≤25 words for price quote)

---

### Test 4: Specific Model Query
**Input:** "PS5 Slim 1TB Disc trade in value"

**Expected:**
- Should return exactly $400
- Should ask about condition (mint/good/fair)
- Should mention it's subject to inspection

**Pass Criteria:**
- ✅ Returns $400 (correct price for PS5 Slim Disc)
- ✅ Asks about condition
- ✅ Mentions inspection disclaimer

---

### Test 5: Multiple Device Options
**Input:** "What's the trade-in for ROG Ally X?"

**Expected:**
- Should show multiple variants (1TB, 2TB, Xbox editions)
- Should show price range: $600-800
- Should ask which variant user has

**Pass Criteria:**
- ✅ Shows all ROG Ally X variants
- ✅ Correct pricing for each ($600-800 range)
- ✅ Asks clarifying question

---

## ✅ Product Search Tests (Previous Fixes)

### Test 6: PS4 Games
**Input:** "PS4 games"

**Expected:**
- Should show 66 brand new PS4 games
- Should NOT show PS5 games
- Should NOT show controllers/accessories
- Should show category link for "See all PS4 games"

**Pass Criteria:**
- ✅ Shows actual games (not accessories)
- ✅ Default to brand new (not pre-owned)
- ✅ Platform filtering works (no PS5 games)

---

### Test 7: Sports Games
**Input:** "NBA games"

**Expected:**
- Should trigger product search (not trade-in)
- Should show NBA 2K games (23 games available)
- Should show prices and category links

**Pass Criteria:**
- ✅ Triggers product search
- ✅ Shows basketball games
- ✅ Does NOT say "We only trade electronics"

---

### Test 8: Cross-Platform Games
**Input:** "EA Sports FC games"

**Expected:**
- Should show games for multiple platforms (PS4/PS5/Switch)
- Should ask "Which platform?" if not specified
- Should NOT exclude games just because they're multi-platform

**Pass Criteria:**
- ✅ Shows games across platforms
- ✅ Cross-platform filtering works

---

## ✅ Intent Detection Tests

### Test 9: Not Trading Detection
**Input:** "I'm not trading, just want to buy Pokemon games"

**Expected:**
- Should trigger product search (not trade-in)
- Should show Pokemon games (11 available)
- Should NOT ask about trade-in

**Pass Criteria:**
- ✅ Correctly detects "not trading" negation
- ✅ Shows product results
- ✅ No trade-in flow triggered

---

### Test 10: Trade-In Flow Persistence
**Input:** 
1. "Trade in my PS5"
2. "PS5 Slim Disc"
3. "Good condition"
4. "With box and controller"

**Expected:**
- Should maintain trade-in context across turns
- Should collect: model → condition → accessories
- Should update lead data progressively
- Should eventually ask for contact info

**Pass Criteria:**
- ✅ Remembers it's a trade-in across multiple messages
- ✅ Collects data in order
- ✅ Doesn't ask same question twice

---

## ✅ Edge Cases

### Test 11: Cheap Tablets
**Input:** "cheap tablets"

**Expected:**
- Should show affordable tablets
- Should show pagination if >8 results
- Should include "Showing X of Y" text

**Pass Criteria:**
- ✅ Shows tablet results
- ✅ Pagination works
- ✅ Shows result count

---

### Test 12: Mixed Query
**Input:** "How much for PS5 and do you have FIFA games?"

**Expected:**
- Should handle both intents:
  - Trade-in inquiry (PS5)
  - Product search (FIFA)
- Should ask clarification: "Are you trading in a PS5 or buying one?"

**Pass Criteria:**
- ✅ Recognizes mixed intent
- ✅ Asks clarifying question
- ✅ Doesn't get confused

---

## 🎯 Summary Scorecard

| Category | Tests | Expected Pass |
|----------|-------|---------------|
| Trade-In Pricing | 5 | 5/5 ✅ |
| Product Search | 3 | 3/3 ✅ |
| Intent Detection | 2 | 2/2 ✅ |
| Edge Cases | 2 | 2/2 ✅ |
| **TOTAL** | **12** | **12/12 ✅** |

---

## 🚨 Critical Issues to Watch For

If you see these, **DO NOT proceed to voice:**
- ❌ PS5 returning $60 (PS4 price)
- ❌ "PlayStation 5" matching PS4 entries
- ❌ Sports keywords triggering trade-in instead of product search
- ❌ "Not trading" still triggering trade-in flow
- ❌ Games showing accessories instead of actual games

---

## ✅ Ready for Voice When:
- All 12 tests pass
- No critical issues observed
- Trade-in pricing is accurate ($250-700 for PS5)
- Product search shows correct results
- Installment calculations are correct

---

## 🤖 Agentic Browser Automation Flow

Use this when running an automated browser agent (so you don't answer follow-ups manually). Each test includes the expected **bot response** and the expected **next prompt** the bot should ask. The agent can validate both and proceed to the next step automatically.

### Global Automation Rules
- **Reset conversation** between tests
- **Assert response** contains required facts and does not contain forbidden facts
- **Advance only if** the bot asks the expected next question
- **Fail fast** on any critical test

### Example Trade-In Flow (Test 10 in steps)
1. **User:** "Trade in my PS5"  
   **Bot must include:** price range $250-700, ask model  
   **Bot must ask next:** "Which PS5 model? (Fat/Slim/Pro)"
2. **User:** "PS5 Slim Disc"  
   **Bot must include:** $400  
   **Bot must ask next:** condition (mint/good/fair)
3. **User:** "Good condition"  
   **Bot must include:** inspection disclaimer  
   **Bot must ask next:** accessories (box/controller)
4. **User:** "With box and controller"  
   **Bot must include:** confirmation of details  
   **Bot must ask next:** contact info

### Agentic Flow for Each Test
For each test below, validate:
- **Answer**: expected pricing/results/intent  
- **Next Question**: correct follow-up question (if applicable)

## Notes:
- All fixes committed: `3b3d1e6c` (latest)
- Price grid synced: 94 devices with correct pricing
- Version filtering: PS4/PS5 confusion prevented
- Tests validated: 9/9 unit tests passing

**Test this in production (Comet or dashboard) and confirm everything works before enabling voice! 🎤**
