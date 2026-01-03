# Final Trade Flow Test – January 3, 2026

Comprehensive manual test run covering the end-to-end deterministic trade-in flow plus the dashboard’s Excel export. Run this before each major release or when modifying quote/order logic.

---

## Scope
- ✅ Verify dashboard exports (`Export as Excel`) still generate the tab-delimited `.xls` file that spreadsheets open without warnings.
- ✅ Validate the deterministic trade-in question order (price → qualification slots → summary) for both trade-up and cash trade-in paths.
- ✅ Confirm the agent answers follow-up product questions even when the user previously sent “nvm”.
- ✅ Ensure payout prompts only appear on cash trade-ins, never on trade-ups/top-up scenarios.

---

## Preconditions
1. Production (or staging) deployment with live catalog + price grid synced (`tradezone_price_grid.jsonl` dated Nov 12 2025 or newer).
2. Dashboard access with leads seeded so the table is non-empty.
3. Test browser session using latest Chrome (desktop) for UI checks.
4. Logs available (Coolify or Supabase) to confirm tool usage if needed.

---

## Test Matrix

### Test 1 – Dashboard Excel Export
- **Entry:** `Dashboard → Trade-In Leads → overflow menu (⋮) → Export as Excel`
- **Steps:**
  1. Load the trade-in dashboard and wait for leads.
  2. Click `Export → Export as Excel`.
  3. Verify download filename: `tradein-leads-YYYY-MM-DD.xls`.
  4. Open in Excel/Numbers → confirm tabular layout with columns `ID, Created, Status, Channel, Name, Email, Phone, Brand, Model, Storage, Condition, Price Range, Payout, Fulfilment`.
- **Pass:** File opens without corruption warning, dates rendered in local timezone, `Price Range` shows `S$` formatting (e.g., `S$150 – S$200`), and toast “Exported to Excel” appears once.
- **Fail:** Missing columns, empty rows, incorrect extension, or double toast.

### Test 2 – Trade-Up Deterministic Flow (PS4 Pro 1TB Disc → PS5 Pro Digital)
- **Entry message:** “can i trade ps4 pro 1 tb disc for ps5 pro digital”
- **Expected cadence:**
  1. **Response #1:** Immediate quote showing both prices and top-up math (e.g., `PS4 Pro 1TB trade-in is ~S$100. PS5 Pro Digital is S$900. Top-up ≈ S$800. Want to proceed?`).
  2. **Response #2 (after “yes”):** Ask condition (`mint/good/fair/faulty`).
  3. **Response #3:** Accessories question.
  4. **Response #4:** Photo prompt (“Photos help…send one?”).
  5. **Response #5:** Email collection (+ confirmation echo).
  6. **Response #6:** Phone number (+ confirmation echo).
  7. **Response #7:** Name.
  8. **Response #8:** Final recap: “Here’s what I got… Is this correct? Reply yes to submit.” No payout question anywhere.
- **Validation:** Check dashboard lead to ensure `top_up_amount`, `source/target` fields populated, `preferred_payout` auto-set to `top_up`.
- **Fail triggers:** Asking condition before price, re-searching for prices mid-flow, payout question asked, summary missing target device, or email missing trade-up details.

### Test 3 – Cash Trade-In Deterministic Flow (Switch OLED 64GB, no target)
- **Entry message:** “what’s the trade-in value for switch oled 64gb”
- **Expected cadence:**
  1. First reply shows trade-in range only (e.g., `Switch OLED trades for ~S$420-480`).
  2. Agent explicitly asks “Proceed?” or similar before collecting condition.
  3. Condition → Accessories → Photos → Email → Phone → Name → **Payout preference** (Cash/PayNow/Bank) since this is cash-only.
  4. Final recap includes payout preference and reminder about inspection: “Here’s what I got… Is this correct? Reply yes to submit.”
- **Validation:** `preferred_payout` equals the chosen option; payout asked only after photos/contact per checklist.
- **Fail:** Payout asked earlier than allowed or skipped entirely, or agent invents target device.

### Test 4 – Mixed Intent Follow-Up (“nvm” + product question)
- **Conversation:**
  1. User: “can i trade ps4 pro 1 tb disc”
  2. Agent: (price-first reply) “... What’s the condition?...”
  3. User: “nvm i want to know if got pokemon game”
- **Expected:** Agent does **not** exit; instead it answers the Pokémon product availability question (e.g., provides Pokémon games list) while keeping the trade-in lead active (status remains open until user explicitly confirms exit).
- **Validation:** Logs show `CONVERSATION_EXIT_PATTERNS` not triggered, and user receives a Pokémon response. Lead remains with latest status (should not auto-cancel).
- **Fail:** Agent replies “No problem—I'll stop here” or cancels lead prematurely.

### Test 5 – Deterministic Slot Completion Regression
- **Scenario:** Continue Test 2 conversation past summary and send “ok can you save that”.
- **Checks:**
  - `tradein_update_lead` fired for each slot (condition, accessories, photos, email, phone, name).
  - `tradein_submit_lead` only runs after user confirmation.
  - Dashboard lead displays the same math shown to user; email notification generated with trade-up block.
- **Pass:** Database/email values match conversation transcript; JSON payload saved (inspect Supabase `lead_notes` or logs).
- **Fail:** Missing slot persists, summary omits field, or email not sent.

### Test 6 – Auto-Submit After Idle (No Explicit Yes)
- **Scenario:** Complete a trade-in (all required fields) but do NOT reply “yes” to the final recap.
- **Expectation:** Lead is auto-submitted after a short delay (default 2 minutes) and staff email is sent.
- **Validation:** `trade_in_actions` shows `email_sent` without explicit user “yes”; dashboard status updates to `in_review`.
- **Fail:** Lead remains stuck with no email after the delay.

---

## Reporting
- Log pass/fail for each test above with screenshots (UI) and transcript snippets (chatbot) in `FINAL_TEST_RESULTS.md`.
- Open P0 ticket immediately if any deterministic ordering breaks; reference this checklist when filing.

---

## Rollback Guidance
If any test fails, halt deployment and revert the offending changes (usually `app/api/chatkit/agent/route.ts` or dashboard export components). Re-run the failed test after fixes before resuming release prep.
