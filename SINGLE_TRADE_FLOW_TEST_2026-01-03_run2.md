# Single Trade Flow Test (One Trade Only) – January 3, 2026

Purpose: Validate the trade-in flow without contaminating leads. Run **one trade only** per session.

---

## Test Hygiene (Mandatory)
1. Use a **fresh sessionId** for this test.
2. Do **not** start a second trade in the same session.
3. Finish with either **explicit submit** or **idle auto-submit** (wait 2–3 minutes).
4. **Session persistence is expected** (localStorage). For a fresh run, use Incognito/Private or clear site storage.

---

## Test A – Single Trade‑Up Flow (PS4 Pro 1TB Disc → PS5 Pro Digital)

**Entry message:**  
“can i trade ps4 pro 1 tb disc for ps5 pro digital”

### Expected order (no deviations)
1. **Price-first reply** with top‑up.  
   Example (2 lines):  
   “Trade-in: **PS4 Pro 1TB Disc** (S$100, subject to inspection).  
   Target: **PS5 Pro Digital** (S$900). Top-up: **S$800**.  
   Proceed?”
2. **Condition** (mint/good/fair/faulty)
3. **Accessories/box**
4. **Photos** (ask once; if no, note “Photos: Not provided — final quote upon inspection”)
5. **Email**
6. **Phone**
7. **Name**
8. **Final recap**: “Here's what I got… Is this correct? Reply yes to submit.”
9. **Submit only after “yes”** (or auto‑submit after delay)

### Pass checks
- No re‑quoting or price changes after Step 1
- Email collected before phone + name
- Recap shown before submit
- No “submitted/passed to team” line before recap confirmation

---

## Test B – Single Cash Trade‑In (Switch OLED 64GB)

**Entry message:**  
“what’s the trade‑in value for switch oled 64gb”

### Expected order
1. **Price-first reply** + “Proceed?”
   Example (2 lines):  
   “Trade-in: **Switch OLED 64GB** (S$100, subject to inspection).  
   Proceed?”
2. **Condition**
3. **Accessories/box**
4. **Photos**
5. **Email**
6. **Phone**
7. **Name**
8. **Payout preference** (Cash/PayNow/Bank)
9. **Final recap** + explicit “yes” to submit

### Pass checks
- “Proceed?” asked before condition
- Payout asked **after** contact info
- Recap shown before submit

---

## Test C – Idle Auto‑Submit

**Scenario:** Complete all required fields, then **do not** reply “yes.”  
**Expected:** Lead auto‑submits after idle delay (default 2 minutes) and staff email is sent.

---

## Recording Results
Log results in `FINAL_TEST_RESULTS.md` with:
- SessionId
- Timestamp
- Pass/Fail for each step
- Screenshot of recap + submission
