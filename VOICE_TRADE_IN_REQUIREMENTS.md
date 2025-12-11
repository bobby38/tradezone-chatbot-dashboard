# Voice Trade-In Flow Requirements

## 🎯 Critical Requirements

### 1. Deterministic Price Lookup
- **Must use trade-in vector store** (`OPENAI_VECTOR_STORE_ID_TRADEIN`)
- **Always get pricing FIRST** before asking questions
- **Never guess prices** - look up exact values from price grid
- **Cache pricing** to prevent re-searches

### 2. One-by-One Contact Collection
**Current (Wrong):** Agent asks for all contact info at once
**Required (Correct):** Sequential collection

```
Step 1: "What's your name?"
User: "Bobby"
→ Call tradein_update_lead({contact_name: "Bobby"})
→ Agent: "Thanks Bobby! What's your phone number?"

Step 2: User: "91234567"
→ Call tradein_update_lead({contact_phone: "91234567"})
→ Agent: "Got it! And your email?"

Step 3: User: "bobby@email.com"
→ Call tradein_update_lead({contact_email: "bobby@email.com"})
→ Agent: "Perfect! Now for payout..."
```

### 3. Trade-In Summary Structure

#### Cash Trade-In Summary
```json
{
  "type": "cash_tradein",
  "device": {
    "brand": "Sony",
    "model": "PlayStation 5",
    "storage": "1TB",
    "condition": "mint",
    "accessories": ["box", "controller", "cables"]
  },
  "pricing": {
    "trade_value": 550,
    "currency": "SGD",
    "price_source": "trade_price_grid",
    "subject_to_inspection": true
  },
  "contact": {
    "name": "Bobby",
    "phone": "+65 91234567",
    "email": "bobby@email.com"
  },
  "preferences": {
    "payout_method": "cash",
    "fulfillment": "walk_in"
  },
  "photos": {
    "provided": false,
    "count": 0
  }
}
```

#### Trade-Up Summary (Device X → Device Y)
```json
{
  "type": "trade_up",
  "source_device": {
    "brand": "Sony",
    "model": "PlayStation 5",
    "storage": "825GB",
    "condition": "good"
  },
  "target_device": {
    "brand": "Sony",
    "model": "PlayStation 5 Pro",
    "storage": "2TB",
    "condition": "new"
  },
  "pricing": {
    "source_trade_value": 400,
    "target_retail_price": 999,
    "top_up_amount": 599,
    "currency": "SGD",
    "subject_to_inspection": true
  },
  "contact": {
    "name": "Bobby",
    "phone": "+65 91234567",
    "email": "bobby@email.com"
  },
  "preferences": {
    "payout_method": "top_up",
    "fulfillment": "walk_in"
  }
}
```

### 4. Email Template Requirements

**Subject:** `🎮 Trade-In Request - [TYPE] - [LEAD-ID]`

**Body (Cash Trade-In):**
```
New Trade-In Request

DEVICE DETAILS:
• Brand: Sony
• Model: PlayStation 5
• Storage: 1TB
• Condition: Mint
• Accessories: Box, Controller, Cables

PRICING:
• Trade-In Value: S$550 (subject to inspection)

CONTACT:
• Name: Bobby
• Phone: +65 91234567
• Email: bobby@email.com

PREFERENCES:
• Payout: Cash
• Fulfillment: Walk-in

PHOTOS:
• Not provided - final quote upon inspection

Lead ID: [uuid]
Session: [room-name]
Created: [timestamp]
```

**Body (Trade-Up):**
```
New Trade-Up Request

FROM (Trade-In):
• Sony PlayStation 5 825GB (Good condition)
• Trade-In Value: ~S$400

TO (Purchase):
• Sony PlayStation 5 Pro 2TB (Brand New)
• Retail Price: S$999

PRICING SUMMARY:
• Trade-In: S$400
• Target: S$999
• Top-Up: S$599 (subject to inspection)

CONTACT:
• Name: Bobby
• Phone: +65 91234567
• Email: bobby@email.com

PREFERENCES:
• Payout: Top-up towards purchase
• Fulfillment: Walk-in

Lead ID: [uuid]
Session: [room-name]
Created: [timestamp]
```

## 🔧 Implementation Checklist

### Voice Agent (agents/voice/agent.py)

- [ ] Add `tradein_get_price` tool for deterministic lookup
- [ ] Update `tradein_update_lead` to save one field at a time
- [ ] Update `tradein_submit_lead` to create proper summary
- [ ] Add contact collection enforcement (one-by-one)
- [ ] Add price caching to prevent re-searches

### Backend API (app/api/tradein/)

- [ ] Create `/api/tradein/price` endpoint (lookup from price grid or vector)
- [ ] Update `/api/tradein/submit` to accept full summary structure
- [ ] Update email template to show all pricing details
- [ ] Save pricing summary to `trade_in_leads` table

### Database (trade_in_leads table)

Add columns if not exist:
```sql
ALTER TABLE trade_in_leads ADD COLUMN IF NOT EXISTS 
  source_device_name TEXT,
  source_price_quoted NUMERIC(10,2),
  target_device_name TEXT,
  target_price_quoted NUMERIC(10,2),
  top_up_amount NUMERIC(10,2),
  quote_timestamp TIMESTAMPTZ,
  initial_quote_given BOOLEAN DEFAULT FALSE;
```

## 📋 Conversation Flow Example

### Trade-Up Flow (PS5 → PS5 Pro)

```
User: "Can I upgrade my PS5 to PS5 Pro?"

Agent: [Calls tradein_get_price("PS5 trade-in")]
Agent: [Calls searchProducts("PS5 Pro price")]
Agent: "PS5 trade-in is around S$400. PS5 Pro costs S$999, so you'd top up S$599. Want to proceed?"

User: "Yes"

Agent: [Calls tradein_update_lead({brand: "Sony", model: "PlayStation 5", target_device: "PlayStation 5 Pro"})]
Agent: "Great! What storage does your PS5 have - 825GB or 1TB?"

User: "825GB"

Agent: [Calls tradein_update_lead({storage: "825GB"})]
Agent: "Got it! What's the condition - mint, good, fair, or faulty?"

User: "Good condition"

Agent: [Calls tradein_update_lead({condition: "good"})]
Agent: "Perfect! What's your name?"

User: "Bobby"

Agent: [Calls tradein_update_lead({contact_name: "Bobby"})]
Agent: "Thanks Bobby! What's your phone number?"

User: "91234567"

Agent: [Calls tradein_update_lead({contact_phone: "91234567"})]
Agent: "Got it! And your email?"

User: "bobby@email.com"

Agent: [Calls tradein_update_lead({contact_email: "bobby@email.com"})]
Agent: [Calls tradein_submit_lead({summary: <full structured summary>})]
Agent: "All set! Here's your summary:

FROM: PlayStation 5 825GB (Good) → Trade-in ~S$400
TO: PlayStation 5 Pro 2TB (New) → S$999
TOP-UP: ~S$599 (subject to inspection)

Contact: Bobby · 91234567 · bobby@email.com

We've submitted this to our team. Visit us at 21 Hougang St 51, #02-09, 12pm-8pm for inspection. Anything else?"
```

## 🚨 Critical Rules

1. **ALWAYS get price BEFORE asking questions**
2. **ALWAYS collect contact info ONE at a time**
3. **ALWAYS create complete summary with pricing**
4. **ALWAYS include pricing in email**
5. **NEVER guess prices** - always look up
6. **NEVER ask multiple questions at once**
7. **NEVER skip pricing in summary**

## 📊 Success Criteria

- ✅ Agent quotes exact prices from price grid
- ✅ Agent asks for name → phone → email sequentially
- ✅ Backend receives complete summary with all pricing
- ✅ Email shows all trade-in/trade-up details
- ✅ Dashboard shows complete pricing information
- ✅ No duplicate price searches (caching works)
