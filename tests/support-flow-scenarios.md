# Support Flow Test Scenarios

**Test Date:** _________  
**Tester:** _________  
**Environment:** Production / Staging  
**Commit:** `b1a82485` (Support flow spam detection + auto-offer triggers)

---

## Test 1: Warranty Support Escalation (Full Flow)

**Goal:** Confirm agent properly handles warranty inquiry with Singapore verification, sequential contact collection, and staff escalation.

### Preconditions
- Clean session (no prior interactions)
- Agent running with latest deployment
- User NOT in active trade-in flow

### Test Steps

| Step | User Input | Expected Agent Response | Status | Notes |
|------|-----------|------------------------|--------|-------|
| 1 | "I want to know if my warranty is still okay for my computer." | "Are you in Singapore?" | ☐ Pass ☐ Fail | Location check first |
| 2 | "Yes" | "What do you need help with?" OR "Roughly when did you buy it?" | ☐ Pass ☐ Fail | Proceeds to next step |
| 3 | User provides timing: "About 2 years ago" | "What is it for (console, game, camera, PC, phone)? Brand if you know." | ☐ Pass ☐ Fail | Device info collected |
| 4 | "PC, Asus" | "Your name?" | ☐ Pass ☐ Fail | Name requested |
| 5 | "robe bert" | "Phone number?" | ☐ Pass ☐ Fail | Phone requested after name |
| 6 | "6584489066" | "Email address?" | ☐ Pass ☐ Fail | Email requested after phone |
| 7 | "test@gmail.com" | "So that's test@gmail.com, correct?" | ☐ Pass ☐ Fail | Email confirmation |
| 8 | "Yes" | "Got it - I've sent this to the team. They'll get back to you soon. Anything else I can help with?" | ☐ Pass ☐ Fail | Confirmation + flow exit |

### Pass Criteria
- ✅ Location check occurs once (or skipped if already confirmed in session)
- ✅ Contact collection follows order: **name → phone → email**
- ✅ Email confirmation requested before submission
- ✅ Issue/reason captured (warranty concern + device details)
- ✅ `sendemail` tool called with complete payload
- ✅ Final confirmation message indicates staff will follow up
- ✅ Support flow state cleared after submission

### Fail Examples
- ❌ Agent skips name/email/phone collection
- ❌ Agent asks multiple questions in one response ("What's your name and email?")
- ❌ No email confirmation step
- ❌ Agent continues prompting after "Yes" confirmation
- ❌ Support flow loops back to earlier steps

### Verification
**Check Dashboard:**
- `/dashboard/submissions` → "Agent" tab
- Submission should show:
  - Name: "robe bert"
  - Email: "test@gmail.com"
  - Phone: "6584489066"
  - Message includes: warranty + PC + Asus + ~2 years ago

**Check Email (Staff):**
- Subject: TradeZone Support Request
- Body includes all above details
- Sent to: `contactus@tradezone.sg`

---

## Test 2: Trade-In for Cash (Product X)

**Goal:** Complete trade-in flow for single device with cash payout.

### Preconditions
- Clean session
- User NOT in support flow
- Using pricing from provided list

### Test Steps

| Step | User Input | Expected Agent Response | Status | Notes |
|------|-----------|------------------------|--------|-------|
| 1 | "I want to trade in my Steam Deck OLED 1TB" | Agent provides trade-in price: "~S$500" (subject to inspection) + "Proceed?" | ☐ Pass ☐ Fail | Price from preowned list |
| 2 | "yes" | "Storage size?" OR "Condition? (mint, good, fair, faulty)" | ☐ Pass ☐ Fail | Begins qualification |
| 3 | "1TB" | "Condition? (mint, good, fair, faulty)" | ☐ Pass ☐ Fail | Storage saved |
| 4 | "good condition" | "Box or accessories included?" | ☐ Pass ☐ Fail | Condition saved |
| 5 | "box et accessories yes" | "Photos to speed inspection? (yes/no)" | ☐ Pass ☐ Fail | Accessories saved |
| 6 | "pas de photo" (no photos) | "Email for the quote?" | ☐ Pass ☐ Fail | Photo declined, moves to contact |
| 7 | "bone@email.com" | "Phone number?" | ☐ Pass ☐ Fail | Email saved |
| 8 | "+65 8939 8963" | "Name to note?" | ☐ Pass ☐ Fail | Phone saved |
| 9 | "berta bone" | "Payout method: cash, PayNow, or bank transfer?" | ☐ Pass ☐ Fail | Name saved |
| 10 | "cash" | Recap showing all details + "Is this correct? Reply yes to submit." | ☐ Pass ☐ Fail | Full summary displayed |
| 11 | "yes" | "Trade-in submitted! Staff will contact you at bone@email.com or +65 8939 8963." | ☐ Pass ☐ Fail | Submission confirmed |

### Expected Recap Format (Step 10)
```
Here's what I got:
• Device: Valve Steam Deck OLED 1TB
• Trade-in: S$500 (subject to inspection)
• Condition: good
• Accessories: box, accessories
• Payout: cash
• Contact: berta bone · +65 8939 8963 · bone@email.com
• Photos: Not provided — final quote upon inspection

Is this correct? Reply yes to submit.
```

### Pass Criteria
- ✅ Trade-in price quoted accurately from preowned list
- ✅ All fields collected in correct order
- ✅ Photo decline acknowledged without blocking flow
- ✅ Recap includes ALL collected data
- ✅ Email notification sent to `contactus@tradezone.sg`
- ✅ Dashboard shows lead with status "in_review" or "submitted"

### Verification
**Dashboard Check:**
- `/dashboard/trade-in`
- Lead should show:
  - Brand: Valve
  - Model: Steam Deck OLED
  - Storage: 1TB
  - Condition: good
  - Accessories: box, accessories
  - Payout: cash
  - Contact: berta bone / +65 8939 8963 / bone@email.com
  - Photos: 0 uploaded
  - Notes: "Photos: Not provided — customer has none on hand"

---

## Test 3: Trade-Up with Installment (X → Y)

**Goal:** Trade one device for another with installment payment plan.

### Preconditions
- Clean session
- Using pricing from provided list

### Test Steps

| Step | User Input | Expected Agent Response | Status | Notes |
|------|-----------|------------------------|--------|-------|
| 1 | "trade my ROG Ally X 1TB to Legion Go 2 1TB" | "ROG Ally X 1TB ~S$550. Legion Go 2 1TB S$1300. Top-up ≈S$750 (subject to inspection/stock)." | ☐ Pass ☐ Fail | Trade-up pricing shown |
| 2 | "yes I want to proceed with 3 month installment" | "Storage size?" OR "Condition? (mint, good, fair, faulty)" | ☐ Pass ☐ Fail | Installment noted, proceeds |
| 3 | "good condition" | "Box or accessories included?" | ☐ Pass ☐ Fail | Condition saved |
| 4 | "box et accessories yes" | "Photos to speed inspection? (yes/no)" | ☐ Pass ☐ Fail | Accessories saved |
| 5 | "pas de photo" | "Email for the quote?" | ☐ Pass ☐ Fail | Photo declined |
| 6 | "kone@email.com" | "Phone number?" | ☐ Pass ☐ Fail | Email saved |
| 7 | "+65 8937 8963" | "Name to note?" | ☐ Pass ☐ Fail | Phone saved |
| 8 | "kerta bone" | Recap (NO payout question for trade-up) | ☐ Pass ☐ Fail | Payout skipped |
| 9 | User sees recap | "Is this correct? Reply yes to submit." | ☐ Pass ☐ Fail | Recap displayed |
| 10 | "yes" | "Trade-up submitted! Staff will contact you..." | ☐ Pass ☐ Fail | Success |

### Expected Recap Format (Step 9)
```
Here's what I got (trade-up):
• Trading: ROG Ally X 1TB (trade-in S$550)
• For: Legion Go 2 1TB (retail S$1300)
• Top-up: S$750
• Condition: good
• Accessories: box, accessories
• Contact: kerta bone · +65 8937 8963 · kone@email.com
• Photos: Not provided — final quote upon inspection

Is this correct? Reply yes to submit.
```

### Pass Criteria
- ✅ Trade-up detected (source + target devices identified)
- ✅ Top-up calculated correctly (S$1300 - S$550 = S$750)
- ✅ **Payout question SKIPPED** (trade-ups don't have payout)
- ✅ Installment preference captured from initial message
- ✅ Recap shows both devices + top-up amount
- ✅ Email sent with trade-up context

### Critical Trade-Up Rules
- 🔴 NO payout method question (user pays us, doesn't receive money)
- 🔴 Installment mentioned early should be noted but not block flow
- 🔴 Recap must show: source device (trade-in price) + target device (retail price) + top-up

### Verification
**Dashboard Check:**
- Lead should have:
  - `source_device_name`: "ROG Ally X 1TB"
  - `target_device_name`: "Legion Go 2 1TB"
  - `source_price_quoted`: 550
  - `target_price_quoted`: 1300
  - `top_up_amount`: 750
  - `preferred_payout`: NULL or "installment" (installment is enum value now)

---

## Test 4: Spam Detection → Immediate Exit

**Goal:** Verify spam is detected, emailed to staff, and flow exits immediately (Option 1).

### Test Steps

| Step | User Input | Expected Agent Response | Status | Notes |
|------|-----------|------------------------|--------|-------|
| 1 | "I can help with SEO backlinks for your website" | "I can only help with TradeZone products. I've flagged this for staff review. Is there anything else I can help with?" | ☐ Pass ☐ Fail | Spam detected |
| 2 | (verify no follow-up) | Agent does NOT ask "Are you in Singapore?" or continue support flow | ☐ Pass ☐ Fail | Flow ended |

### Pass Criteria
- ✅ Spam patterns detected (SEO, backlinks, promo, etc.)
- ✅ Email sent to staff with `[SPAM DETECTED - STAFF REVIEW NEEDED]` subject
- ✅ Support flow state cleared (no lingering state)
- ✅ Agent does NOT ask follow-up support questions
- ✅ User can start fresh conversation after spam rejection

### Spam Patterns to Test
- "SEO services for your business"
- "Buy Instagram followers cheap"
- "Crypto trading opportunity"
- "Guest post on your blog"
- Multiple URLs in one message

---

## Test 5: No Product Found → Auto-Offer Support

**Goal:** Verify auto-offer triggers when product search fails.

### Test Steps

| Step | User Input | Expected Agent Response | Status | Notes |
|------|-----------|------------------------|--------|-------|
| 1 | "do you have unicorn gaming console" | "I couldn't find 'unicorn gaming console' in our catalog. Would you like me to connect you with our team? They can check stock or help with special orders." | ☐ Pass ☐ Fail | Auto-offer triggered |
| 2 | "yes" | "Are you in Singapore?" | ☐ Pass ☐ Fail | Support flow starts |
| 3 | "yes" | "What do you need help with?" | ☐ Pass ☐ Fail | Purpose step |
| 4 | Continue flow... | Normal support escalation | ☐ Pass ☐ Fail | Completes normally |

### Pass Criteria
- ✅ Product search returns no results
- ✅ Agent offers staff escalation (not just "sorry, not found")
- ✅ `supportOfferState` set with reason: "no_product_found"
- ✅ User saying "yes" immediately starts support flow
- ✅ Purpose field pre-filled: "Auto-escalation: no_product_found"

---

## Price Reference (From User Provided List)

### Preowned Prices (Trade-In Values)
- **Steam Deck OLED 1TB:** S$500
- **ROG Ally X 1TB:** S$550
- **Legion Go 2 1TB:** S$1100
- **MSI Claw 1TB:** S$300
- **Switch OLED:** S$100
- **PS5 Slim 1TB Disc:** S$400
- **Xbox Series X:** S$300

### Brand New Prices (Retail)
- **Legion Go 2 1TB:** S$1300
- **ROG Ally X 1TB:** S$800
- **Switch 2:** S$500
- **PS5 Pro 2TB:** S$900

### Top-Up Calculations
- ROG Ally X 1TB → Legion Go 2 1TB: **S$750** (S$1300 - S$550)
- Steam Deck OLED 1TB → PS5 Pro 2TB: **S$400** (S$900 - S$500)
- Switch OLED → Switch 2: **S$400** (S$500 - S$100)

---

## Summary Checklist

**All Tests Must Verify:**
- [ ] One question at a time (no multi-part questions)
- [ ] Sequential contact collection (name → phone → email)
- [ ] Email confirmation before submission
- [ ] Recap includes ALL collected data
- [ ] Email sent to staff with complete context
- [ ] Dashboard records match user input
- [ ] Flow exits cleanly after completion
- [ ] No state leakage between sessions

**Known Issues to Avoid:**
- ❌ Agent asking "name and email together"
- ❌ Skipping photo prompt
- ❌ Payout question appearing in trade-ups
- ❌ Spam continuing to support flow
- ❌ Product not found with no escalation offer

---

**Test Completion Date:** _________  
**Overall Pass Rate:** _____ / 5 tests  
**Issues Found:** _________  
**Follow-Up Required:** _________
