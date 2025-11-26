# Trade-Up Quote Cache Fix

## Problem Statement

When users request a trade-up (e.g., "trade DJI Pocket 3 to DJI Osmo 360"), the agent:
1. ✅ Correctly gives initial quote: "Pocket 3 ~S$350. Osmo 360 S$500. Top-up ~S$150"
2. ✅ User confirms: "ok can"
3. ✅ Collects condition: "good"
4. ✅ Collects accessories: "got all"
5. ❌ **RE-SEARCHES for target product** (DJI Osmo 360)
6. ❌ Searches WRONG vector store (trade-in instead of catalog)
7. ❌ Doesn't find it (Osmo 360 not in trade-in grid)
8. ❌ Contradicts initial quote: "The DJI Osmo 360 camera isn't listed"

## Root Cause

After giving the initial price quote, the agent continues to call `searchProducts` during the qualification phase (when collecting condition, accessories, contact). This triggers unnecessary searches that:
- Use the wrong vector store (trade-in instead of catalog for target device)
- Contradict the already-given quote
- Confuse the customer

## Solution Implemented

### 1. Database Migration

**File:** `supabase/migrations/20250126_add_quote_cache.sql`

Adds fields to `trade_in_leads` table to cache the initial quote:
- `initial_quote_given` BOOLEAN - Flag to prevent re-searching
- `source_device_name` TEXT - Device being traded in
- `source_price_quoted` DECIMAL - Trade-in value quoted
- `target_device_name` TEXT - Device customer wants to buy
- `target_price_quoted` DECIMAL - Retail price quoted
- `top_up_amount` DECIMAL - Calculated top-up
- `quote_timestamp` TIMESTAMPTZ - When quote was given

### 2. Save Quote After Initial Response

**File:** `app/api/chatkit/agent/route.ts` (line ~4960)

When trade-up quote is generated and both prices are available:
```typescript
// Set initial_quote_given flag to block future searches
await updateTradeInLead(tradeInLeadId, {
  initial_quote_given: true,
  source_device_name: sourceName,
  source_price_quoted: tradeValue,
  target_device_name: targetName,
  target_price_quoted: retailPrice,
  top_up_amount: topUp,
  quote_timestamp: new Date().toISOString(),
});
```

### 3. Block Re-Search When Quote Already Given

**File:** `app/api/chatkit/agent/route.ts` (line ~3625)

Before deciding whether to force `searchProducts`:
```typescript
// Check if quote already given
const quoteAlreadyGiven = tradeInLeadDetail?.initial_quote_given === true;

if (quoteAlreadyGiven) {
  console.log("[ChatKit] Quote already given - blocking product searches");
  messages.push({
    role: "system",
    content: `CRITICAL: Initial price quote already given. DO NOT call searchProducts again. 
    You are in QUALIFICATION mode - only collect condition, accessories, contact info. 
    Use tradein_update_lead to save details.`,
  });
}

// Don't force catalog search if quote already given
const shouldForceCatalog = !quoteAlreadyGiven && (tradeUpPairIntent || ...);
```

## How It Works

### First Message (Initial Quote)
```
User: "trade dji pocket 3 creator combo to dji osmo 360"
Agent: Searches both products ✅
Agent: "Your DJI Pocket 3 Creator Combo trades for ~S$350. 
       The DJI Osmo 360 is S$500. Top-up: ~S$150."
Agent: Saves initial_quote_given = TRUE ✅
```

### Subsequent Messages (Qualification)
```
User: "ok can"
Agent: Checks initial_quote_given = TRUE ✅
Agent: BLOCKS searchProducts ✅
Agent: "Great! What's the condition?"

User: "good"
Agent: Checks initial_quote_given = TRUE ✅
Agent: BLOCKS searchProducts ✅
Agent: Calls tradein_update_lead({condition: "good"}) ✅
Agent: "Got it! Accessories included?"

User: "got all"
Agent: Checks initial_quote_given = TRUE ✅
Agent: BLOCKS searchProducts ✅ (NO MORE RE-SEARCHING!)
Agent: Calls tradein_update_lead({accessories: "all"}) ✅
Agent: "Perfect! Contact number?"
```

## Migration Instructions

### Option 1: Manual (Recommended for now)

1. Go to Supabase Dashboard → SQL Editor
2. Paste contents of `supabase/migrations/20250126_add_quote_cache.sql`
3. Run the SQL
4. Verify columns added:
   ```sql
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'trade_in_leads' 
   AND column_name LIKE '%quote%';
   ```

### Option 2: Via Script (When exec_sql function available)

```bash
node scripts/apply-supabase-migration.js supabase/migrations/20250126_add_quote_cache.sql
```

## Testing Checklist

### Text Chat Test
- [ ] Open `/dashboard/chat`
- [ ] Message: "trade dji pocket 3 creator combo to dji osmo 360"
- [ ] Verify initial quote shows both prices ✅
- [ ] Message: "ok can"
- [ ] Message: "good" (condition)
- [ ] Message: "got all" (accessories)
- [ ] Verify NO re-search happens ✅
- [ ] Verify NO "isn't listed" message ✅
- [ ] Complete flow with contact info
- [ ] Verify submission works ✅

### Voice Chat Test
- [ ] Open `/dashboard/chat`
- [ ] Click "START A CALL"
- [ ] Say: "trade dji pocket 3 creator combo to dji osmo 360"
- [ ] Verify voice quote given ✅
- [ ] Say: "ok"
- [ ] Follow prompts for condition, accessories
- [ ] Verify NO re-search during qualification ✅
- [ ] Complete with contact info
- [ ] Verify submission works ✅

## Expected Logs

### Before Fix (BAD)
```
[VectorSearch] ✅ Using TRADE-IN vector store: vs_68f3ab92... ❌ WRONG
[ChatKit] Using TRADE-IN result (1354 chars)
Agent: "The DJI Osmo 360 camera isn't listed" ❌ CONTRADICTION
```

### After Fix (GOOD)
```
[TradeUp] Setting initial_quote_given flag to block re-searches ✅
[TradeUp] Quote cached successfully - future searches blocked ✅
[ChatKit] Quote already given - blocking product searches ✅
[ChatKit] Tool choice: auto (no forced searchProducts) ✅
Agent: "Perfect! Contact number?" ✅ NO RE-SEARCH
```

## Rollback Plan

If issues occur:

1. **Remove blocking logic:**
   ```typescript
   // Comment out lines 3625-3635 in route.ts
   // const quoteAlreadyGiven = tradeInLeadDetail?.initial_quote_given === true;
   ```

2. **Remove quote caching:**
   ```typescript
   // Comment out lines 4963-4975 in route.ts
   // await updateTradeInLead(tradeInLeadId, { initial_quote_given: true, ... });
   ```

3. **Drop database columns (if needed):**
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

## Files Modified

1. `supabase/migrations/20250126_add_quote_cache.sql` (NEW)
2. `app/api/chatkit/agent/route.ts` (2 changes)
   - Line ~3625: Check quote flag and block re-search
   - Line ~4963: Save quote cache after initial response

## Notes

- Works for both text and voice chat (same backend)
- Voice chat uses same agent route, so fix applies automatically
- No changes needed to voice-specific code
- Trade-in prompts already discourage re-searching, this enforces it technically
