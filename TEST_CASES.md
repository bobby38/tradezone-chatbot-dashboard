# Agent Fix Test Cases

Use these test cases with Comet Agentic Browser to verify the fixes.

---

## Test 1: Product Info Should NOT Trigger Trade-In

**Scenario:** User asks about product region/availability - should get product info, NOT trade-in prices.

### Steps:
1. Open chat
2. Send: `your switch are japan set?`
3. **Expected:** Answer about Switch region (Japan/Singapore set info)
4. **NOT Expected:** Trade-in prices like "S$350" or "trade-in value"

5. Send: `what about switch 2`
6. **Expected:** Info about Switch 2 availability/region
7. **NOT Expected:** "The trade-in value for Nintendo Switch 2 is S$350"

### Pass Criteria:
- ✅ No trade-in prices mentioned
- ✅ Answers the actual question about product info
- ✅ No "Proceed?" or condition questions

---

## Test 2: Warranty Policy Question - Direct Answer

**Scenario:** User asks about warranty policy - should be answered directly, NOT start support flow.

### Steps:
1. Open NEW chat session
2. Send: `is your warranty for preowned 1 year or 1 month`
3. **Expected:** Direct answer like "Pre-owned items have 7-day warranty" or "1 month warranty"
4. **NOT Expected:** "Are you in Singapore?" or support flow questions

### Pass Criteria:
- ✅ Direct answer about warranty policy
- ✅ No "Are you in Singapore?" question
- ✅ No name/phone/email collection

---

## Test 3: Singapore Question - Ask Only ONCE

**Scenario:** If support flow is needed, Singapore should be asked maximum ONE time per session.

### Steps:
1. Open NEW chat session
2. Send: `i have a warranty issue with my ps5`
3. **Expected:** "Are you in Singapore?" (first time is OK)
4. Send: `yes`
5. **Expected:** Continues to next step (asks about issue)
6. Send: `actually nevermind`
7. Send: `i have another warranty problem`
8. **Expected:** Should NOT ask "Are you in Singapore?" again
9. **NOT Expected:** Repeated Singapore question

### Pass Criteria:
- ✅ Singapore asked maximum 1 time
- ✅ After confirming, never asked again in same session
- ✅ Flow continues smoothly

---

## Test 4: Trade-In Only When Explicit

**Scenario:** Trade-in flow should ONLY start when user explicitly says trade/sell keywords.

### Steps:
1. Open NEW chat session
2. Send: `do you have ps5`
3. **Expected:** Product listing/availability info
4. **NOT Expected:** Trade-in prices or "Proceed?"

5. Send: `how much`
6. **Expected:** Asks "Looking to buy or trade in?" OR shows buy prices
7. **NOT Expected:** Assumes trade-in and shows trade-in price

8. Send: `i want to trade in my ps5`
9. **Expected:** NOW shows trade-in price and starts trade-in flow
10. **Expected:** "PS5 trade-in S$XXX. Proceed?"

### Pass Criteria:
- ✅ No trade-in until explicit "trade" or "sell" keyword
- ✅ Product questions get product answers
- ✅ Trade-in only after clear intent

---

## Test 5: Game Trade-In vs Console Trade-In

**Scenario:** "trade in ps5 games" should give game prices, not console prices.

### Steps:
1. Open chat
2. Send: `can i trade in ps5 games`
3. **Expected:** "Yes, we buy games! Typical range: S$5–S$40 per game"
4. **NOT Expected:** "PS5 trade-in S$350" (that's the console price)

### Pass Criteria:
- ✅ Shows game price range (S$5-40)
- ✅ Does NOT show console price (S$250-400)
- ✅ Offers to connect with staff for specific game quote

---

## Summary Checklist

| Test | Description | Status |
|------|-------------|--------|
| 1 | Product info doesn't trigger trade-in | ⬜ |
| 2 | Warranty policy answered directly | ⬜ |
| 3 | Singapore asked only once | ⬜ |
| 4 | Trade-in requires explicit intent | ⬜ |
| 5 | Game vs console trade-in | ⬜ |

---

## Bug Report Template

If a test fails, note:
- **Test #:** 
- **Message sent:**
- **Expected response:**
- **Actual response:**
- **Screenshot:** (if possible)
