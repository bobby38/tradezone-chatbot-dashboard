# Critical Bugs Found - November 26, 2025

## Test Session Summary
**User:** bobby38  
**Date:** Nov 26, 2025, 03:17-03:23 PM  
**Session ID:** client_1761401000362_1z8k1e61y_1764141438817  
**Lead ID:** 81ad579d-410a-4aed-8dcd-6ee3021a54aa

---

## Bug #1: Sport Queries Return Wrong Products 🔴 CRITICAL

**Issue:**
Sport-related queries (football, basketball) return completely unrelated products (Battle Axe, Pokemon Cards, Game Controllers) instead of actual sports games.

**Test Evidence:**
```
Query: "Any football games"
Result: Battle Axe, Pokemon TCG, Lenovo Controller ❌

Query: "Football"  
Result: Battle Axe, Pokemon TCG, Lenovo Controller ❌

Query: "Basketball"
Result: Battle Axe, Pokemon TCG, Lenovo Controller ❌

Query: "NBA"
Result: NBA 2K26, NBA 2K25, NBA 2K23 ✅ CORRECT
```

**Root Cause:**
Sport filtering logic exists at line 949 in `lib/tools/vectorSearch.ts` but is applied TOO LATE. By the time it runs, WooCommerce has already returned wrong results and vector enrichment has added noise.

**Expected Behavior:**
According to `agent.md`:
> **Nov 26, 2025 - Catalog Sport Guardrails**: We re-order results so SKUs whose names contain canonical keywords float to the top (football/soccer → FIFA, basketball → NBA 2K).

**Fix Location:** `lib/tools/vectorSearch.ts:949-990`

---

## Bug #2: ReferenceError: sportIntent is not defined 🔴 CRITICAL

**Issue:**
Code crashes when processing WooCommerce results for sport queries.

**Error Log:**
```
[VectorSearch] WooCommerce search failed, continuing to vector: 
ReferenceError: sportIntent is not defined
    at lib/tools/vectorSearch.ts:476
```

**Root Cause:**
Line 476 references `sportIntent.filterTokens`, but `sportIntent` is never defined. The sport detection logic at line 949 uses different variable names (`sportFilters` array).

**Code at Line 476:**
```typescript
if (sportIntent && wooProducts.length) {
  const prioritized = wooProducts.filter((product) => {
    const hay = (product.name || "").toLowerCase();
    return sportIntent.filterTokens.some((token) => // ❌ sportIntent doesn't exist
      hay.includes(token.toLowerCase()),
    );
  });
}
```

**Fix:** Define `sportIntent` before line 476, or rename variables consistently.

---

## Bug #3: Trade-Up Confirmation Message Wrong Format ⚠️ HIGH

**Issue:**
Trade-up submission message doesn't match the format specified in prompts.

**What User Received:**
```
"All set! Your trade-in details are saved. You'll trade your PS4 Pro for the 
PS5 Pro Digital with a top-up of S$780 via PayNow. Anything else I can help with?"
```

**What Prompt Says (lib/chatkit/defaultPrompt.ts:152-154):**
```
"Trade-up submitted! Trading {source device} (~S$XX) for {target device} (S$YY). 
Top-up: S$ZZ. We'll contact you to arrange. Visit 21 Hougang St 51, #02-09, 
11am–8pm for inspection. Anything else?"
```

**Missing Elements:**
- ❌ Individual device prices (should show PS4 Pro ~S$120, PS5 Pro S$900)
- ❌ "We'll contact you to arrange"
- ❌ Store address and hours
- ❌ "Trade-up submitted" vs "All set"

**Impact:** User doesn't know when/where to go for inspection.

---

## Bug #4: Payout Asked in Trade-UP Flow 🔴 CRITICAL

**Issue:**
Agent asks for "payout method" when customer is doing a trade-UP (paying TradeZone $780 top-up), not a cash trade-in (receiving money).

**Test Evidence:**
```
User: "Can I trade a ps4 pro for ps5 pro digital"
Agent: "Top-up: ~S$780" ✅ Correct - user pays us
...
Agent: "Your PS4 Pro trade-in value is S$120. The PS5 Pro Digital is S$900, 
so you'll need to top up S$780. What's your preferred payout method—cash or PayNow?" 
❌ WRONG - no payout happening!
```

**Root Cause:**
Agent doesn't distinguish between:
1. **Cash Trade-In** (user sells device → receives money → ask payout preference)
2. **Trade-Up/Exchange** (user swaps device → pays top-up → skip payout question)

**According to agent.md (line 6):**
> **Step 6: Confirm payout (AFTER photos - ONLY for cash trade-ins):**
> - **SKIP this step entirely if it's an upgrade/exchange** (customer needs to top up, not receive money)
> - Only ask "Cash, PayNow, or bank?" if customer is trading for CASH (no target device mentioned)

**Fix:** Add logic to detect trade-up context and skip payout question entirely.

---

## Bug #5: No Email Sent to Staff 🔴 CRITICAL

**Issue:**
Trade-in lead submitted successfully (saved to database), but NO email notification sent to `contactus@tradezone.sg`.

**Evidence:**
```
Dashboard shows:
✅ Lead saved (ID: 81ad579d-410a-4aed-8dcd-6ee3021a54aa)
✅ Contact info: Cab Test, bobby_dennie@hotmail.com, 84489068
✅ Device details: PS4 Pro → PS5 Pro Digital, $780 top-up
✅ Status: New

❌ No email received by staff
❌ User reported: "no have email"
```

**Expected Behavior (from CLAUDE.md):**
> **Trade-In Email Notifications:** 
> - Recipients: `contactus@tradezone.sg` (BCC: `info@rezult.co`)
> - Subject: `🎮 New Trade-In Request - {lead-id}`
> - Status: ✅ Working (FIXED 2025-01-20)

**Investigation Needed:**
1. Check if `EmailService.sendFormNotification` was called
2. Check SMTP configuration in Supabase `organizations.settings.smtp`
3. Check Coolify logs for email errors
4. Verify `notify !== false` in submission call

**Service Location:** `lib/trade-in/service.ts:649-708`

---

## Bug #6: No Recap Before Submission ⚠️ MEDIUM

**Issue:**
Agent immediately submits after collecting email, without asking "All good to submit?"

**Expected Flow (from lib/chatkit/defaultPrompt.ts:148-151):**
```
2. **Progressive recap & submission**
   1. After all required slots are filled, recap in ≤2 short sentences 
      and ask "All good to submit?"
   2. Only after the customer confirms, call tradein_submit_lead
```

**Actual Flow:**
```
Agent: "What's your email address?"
User: "Bobby_dennie@hotmail.com"
Agent: "All set! Your trade-in details are saved..." [SUBMITTED WITHOUT CONFIRMATION]
```

**Impact:** User doesn't get a chance to review/correct details before submission.

---

## Priority Fixes

### 🔥 P0 - Must Fix Immediately
1. **Bug #2** - Fix `sportIntent` ReferenceError (blocks WooCommerce search)
2. **Bug #5** - Debug missing email notification (staff not notified)
3. **Bug #4** - Remove payout question from trade-up flow (confusing UX)

### 🔴 P1 - High Priority
1. **Bug #1** - Fix sport query product filtering
2. **Bug #3** - Fix trade-up confirmation message format

### ⚠️ P2 - Medium Priority
1. **Bug #6** - Add recap confirmation before submission

---

## Files to Fix

| File | Issues | Lines |
|------|--------|-------|
| `lib/tools/vectorSearch.ts` | Bug #1, Bug #2 | 476, 949-990 |
| `app/api/chatkit/agent/route.ts` | Bug #3, Bug #4, Bug #6 | TBD |
| `lib/trade-in/service.ts` | Bug #5 (investigate) | 649-708 |
| `lib/email-service.ts` | Bug #5 (investigate) | TBD |

---

## Test Checklist After Fixes

- [ ] Query "football game" returns FIFA titles (not Battle Axe)
- [ ] Query "basketball game" returns NBA 2K titles (not Pokemon)
- [ ] Query "NBA" still returns NBA 2K titles correctly
- [ ] Trade-up flow skips payout question entirely
- [ ] Trade-up confirmation shows both prices + address
- [ ] Trade-up recap asks "All good to submit?" before submitting
- [ ] Email notification sent to `contactus@tradezone.sg` after submission
- [ ] Dashboard shows email_sent action (not email_failed)
