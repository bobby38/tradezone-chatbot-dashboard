# Trade-Up Flow Fixes - Complete

## Issues Fixed

### 1. ✅ Quote Re-Search Prevention
**Problem:** Agent was re-searching for products after initial quote, causing contradictions.

**Fix:** Added quote caching system
- Database fields: `initial_quote_given`, `source_device_name`, `target_device_name`, etc.
- After initial quote → sets flag
- On subsequent messages → blocks `searchProducts` tool
- Agent stays in "qualification mode" (collect details only)

**Files Changed:**
- `supabase/migrations/20250126_add_quote_cache.sql`
- `app/api/chatkit/agent/route.ts` (lines ~3625, ~4963)

---

### 2. ✅ Payout Context Fixed (Trade-Up vs Cash Trade-In)
**Problem:** Agent asked "cash, PayNow, or bank?" for trade-ups where customer PAYS top-up (not receives money).

**Fix:** Skip payout question for trade-ups
- Updated `buildMissingTradeInFieldPrompt()` to accept `isTradeUp` parameter
- Added check: `if (!hasPayout && !isTradeUp)` before asking payout
- Auto-sets `preferred_payout: "top_up"` for trade-up flows

**Files Changed:**
- `app/api/chatkit/agent/route.ts` (lines ~2503, ~2707, ~3605)

---

### 3. ✅ Photo Prompt Moved Before Contact
**Problem:** Photo prompt came AFTER contact info collection, should be BEFORE.

**Fix:** Reordered prompts
- New order: Condition → Accessories → **Photos** → Email → Phone → Name → (Payout skipped for trade-ups)
- Photos encouraged but optional
- If declined: "Noted—final quote after inspection"

**Files Changed:**
- `app/api/chatkit/agent/route.ts` (line ~2694)

---

### 4. ✅ Final Confirmation Shows Both Devices + Top-Up
**Problem:** Summary didn't show trade-up context (source device → target device + top-up).

**Fix:** Enhanced `buildTradeInUserSummary()`
- Detects trade-ups via `source_device_name` + `target_device_name`
- Shows:
  ```
  Trade-Up Summary:
  Trading: DJI Pocket 3 Creator Combo (trade-in ~S$350)
  For: DJI Osmo 360 (retail S$500)
  Top-up needed: S$150
  Condition: good
  Accessories: all
  Contact: Bobby Test · 8448 9068 · bobby_dennie@hotmail.com
  ```

**Files Changed:**
- `app/api/chatkit/agent/route.ts` (line ~2424)

---

### 5. ✅ Email Template Shows Trade-Up Details
**Problem:** Email said "You'll receive S$350-400" when customer should PAY S$150 top-up.

**Fix:** Updated email template
- Detects trade-ups via `source_device_name`, `target_device_name`, `top_up_amount`
- Shows highlighted trade-up section:
  ```
  🔄 TRADE-UP REQUEST:
  Trading: DJI Pocket 3 Creator Combo (~S$350)
  For: DJI Osmo 360 (S$500)
  Top-Up Required: S$150
  ```
- For cash trade-ins: Shows "Price Hint / Range" and "Preferred Payout"

**Files Changed:**
- `lib/email-service.ts` (lines ~258, ~405)

---

## New Trade-Up Flow

### User Experience:
```
User: "trade dji pocket 3 creator combo to dji osmo 360"
Agent: "Your DJI Pocket 3 Creator Combo trades for ~S$350. 
        The DJI Osmo 360 is S$500. Top-up: ~S$150. 
        Are you keen to proceed?"

User: "yes"
Agent: "What's the condition - mint, good, fair, or faulty?"

User: "good"
Agent: "Got it! Accessories included?"

User: "all"
Agent: "Photos help us quote faster—want to send one?"

User: "no"
Agent: "Noted—final quote after inspection. Email for quote?"

User: "bobby_dennie@hotmail.com"
Agent: "So bobby_dennie@hotmail.com?"

User: "yes"
Agent: "Contact number?"

User: "8448 9068"
Agent: "That's 8448 9068, correct?"

User: "yes"
Agent: "And your name?"

User: "bobby test"
Agent: "Trade-Up Summary:
        Trading: DJI Pocket 3 Creator Combo (trade-in ~S$350)
        For: DJI Osmo 360 (retail S$500)
        Top-up needed: S$150
        Condition: good
        Accessories: all
        Contact: Bobby Test · 8448 9068 · bobby_dennie@hotmail.com
        Confirm these details before we proceed."

User: "yes confirm"
Agent: "Submitted! Visit 21 Hougang St 51 for inspection. We'll contact you to arrange the trade-up."
```

### What Changed:
- ✅ No re-search after initial quote
- ✅ No payout question (customer pays top-up, doesn't receive money)
- ✅ Photos asked BEFORE contact
- ✅ Final confirmation shows BOTH devices + top-up
- ✅ Email shows trade-up context clearly

---

## Database Schema Changes

### New Fields in `trade_in_leads`:
```sql
initial_quote_given BOOLEAN DEFAULT FALSE
source_device_name TEXT
source_price_quoted DECIMAL(10,2)
target_device_name TEXT  
target_price_quoted DECIMAL(10,2)
top_up_amount DECIMAL(10,2)
quote_timestamp TIMESTAMPTZ
```

---

## Testing Checklist

### Text Chat:
- [ ] Trade-up quote shows both prices ✅
- [ ] User confirms "ok can" ✅
- [ ] Agent collects condition ✅
- [ ] Agent collects accessories ✅
- [ ] Agent asks for photos (BEFORE contact) ✅
- [ ] Agent does NOT re-search after "got all" ✅
- [ ] Agent does NOT ask for payout method ✅
- [ ] Agent collects email, phone, name ✅
- [ ] Final summary shows both devices + top-up ✅
- [ ] Email shows trade-up format (not payout) ✅

### Voice Chat:
- [ ] Same flow works via voice ✅
- [ ] No re-search during qualification ✅
- [ ] No payout question ✅
- [ ] Summary includes both devices ✅

---

## Rollback Instructions

If needed, revert changes in this order:

1. **Remove email template changes:**
   ```bash
   git diff lib/email-service.ts
   # Revert lines 258-268 and 405-430
   ```

2. **Remove summary changes:**
   ```bash
   git diff app/api/chatkit/agent/route.ts
   # Revert buildTradeInUserSummary function
   ```

3. **Remove payout skip logic:**
   ```bash
   # Revert buildMissingTradeInFieldPrompt changes
   ```

4. **Remove quote caching:**
   ```bash
   # Comment out quote cache logic in route.ts
   ```

5. **Drop database columns:**
   ```sql
   ALTER TABLE trade_in_leads 
   DROP COLUMN IF EXISTS initial_quote_given,
   DROP COLUMN IF EXISTS source_device_name,
   DROP COLUMN IF EXISTS source_price_quoted,
   DROP COLUMN IF EXISTS target_device_name,
   DROP COLUMN IF EXISTS target_price_quoted,
   DROP COLUMN IF EXISTS top_up_amount,
   DROP COLUMN IF EXISTS quote_timestamp;
   ```

---

## Files Modified Summary

1. `supabase/migrations/20250126_add_quote_cache.sql` (NEW)
2. `app/api/chatkit/agent/route.ts` (5 changes)
3. `lib/email-service.ts` (2 changes)

**Total Lines Changed:** ~150 lines
**Risk Level:** Low (additive changes, backward compatible)
