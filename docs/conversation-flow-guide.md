# TradeZone Conversational Flow (Text & Voice)

Authoritative reference for how Amara handles every customer interaction. Applies to **text chat, voice chat, mobile widget, and dashboard tooling** – they all share the same logic unless explicitly noted.

---

## 1. Core Principles
- **WooCommerce JSON is the single source of truth** for anything involving inventory, pricing, links, or availability. If it is not in the `tradezone-WooCommerce-Products.json` snapshot, the agent must not fabricate it.
- **Vector / Perplexity layers are enrichment only.** They can add context (specs, bundles, promos) *after* WooCommerce has produced products. They never introduce new SKUs.
- **Deterministic flows.** Once we detect trade-in intent, we do not bounce back to catalog chatter. Conversely, a product-info conversation stays catalog-focused until the user explicitly switches topics.
- **Staff escalation when WooCommerce is empty.** If the store snapshot has zero matches, Amara apologizes, offers to note the request, and collects contact info only if the user agrees.
- **Shared experience across text and voice.** Voice simply shortens copy, but responses, trade steps, validations, and logging match the text implementation.

---

## 2. Product Search Flow

1. **Detect intent** using message + history.
2. **WooCommerce search (mandatory first step).**
   - Clean the query (remove “cheap/under/etc.”).
   - Run `searchWooProducts` with price sorting when user mentions “cheap/under/etc.”
   - Apply sport filters (NBA/FIFA/WWE) so “basketball game” returns NBA titles instead of consoles.
3. **If WooCommerce returns products**
   - Respond with the exact names, prices, and links.
   - For phones/tablets we *stop here* (no enrichment) to avoid hallucinated SKUs.
   - For other families we may append enrichment (vector/perplexity) but the WooCommerce list is always shown first and never altered.
4. **If WooCommerce returns nothing**
   - Say “No matching products right now. Want me to note it for staff and check availability?”
   - If the customer says yes, collect name + email + phone and save a note so staff can follow up.
   - Optional: run Perplexity against tradezone.sg for promos, but results are framed as “site mention” and never override WooCommerce truth.

### Guardrails
- No “Quick Links” sourced from vector data.
- Price language *always* matches WooCommerce snapshot values.
- Basketball/football/wrestling keywords must keep the request inside the correct sports category.
- Platform qualifiers (PS5, Switch, etc.) remain attached to the customer's words; do not drop them.

---

## 3. Trade-In / Trade-Up Flow

Treat this like a step form. Once we enter the flow, we either:
1. Finish the checklist (device → desired item → pricing → contact info → recap), or
2. Explicitly confirm cancellation.

### Steps
1. **Intent confirmation**
   - “Are you looking to trade in or upgrade? What device do you have?”
2. **Collect device details**
   - Brand/model, storage/config, condition, accessories, defects.
   - Ask for photos before discussing payouts. Prompt for upload (widget) or email instructions.
3. **Target device & pricing**
   - Detect upgrade target (e.g., “trade Pocket 3 for DJI 360”) and confirm.
   - Pull trade values from the trade-in vector store only.
   - Calculate top-up using WooCommerce price of the desired item.
4. **Contact details**
   - Name, phone, email (mandatory).
   - Confirm user is in Singapore.
5. **Recap + submission**
   - Read back: “You’re trading X for Y, estimated value S$…, top-up …, contact …”
   - Create/update trade-in lead (send to `tradein_update_lead`) + email notification.
6. **Stay in trade context** until either the user closes it or everything above is satisfied.

### Forbidden behaviors
- Asking for payout preference before we know the device and target.
- Switching back to catalog search mid-trade unless the user cancels.
- Declaring “not in stock” while WooCommerce lists the item; instead offer staff follow-up.

---

## 4. Voice-Specific Notes

- Voice UI mirrors text content. Transcript displays the same WooCommerce lists, markdown, and trade recaps (rendered in plain text).
- On mobile:
  - When Voice mode is selected, hide the hero video, expand the transcript area, and keep “Tap the mic to start” visible with an animated button.
  - Once recording starts, show live transcript entries (`You: …`, `Amara: …`).
  - The note box + send button remain at the bottom; attachments share the same preview logic as text chat.
- The widget logs every voice turn to the dashboard (same logging pipeline as text).
- If the microphone session drops or the model can’t parse audio, fall back to prompting the user to repeat rather than fabricating an answer.

---

## 5. When WooCommerce Has Nothing

Use this template for both text and voice:

> “I couldn’t find that in our store right now. Want me to note it for staff so they can check availability for you?”

If yes:
1. Collect name, email, phone.
2. Store a lead/note summarizing the request.
3. Confirm we’ll reach out when it’s available.

If no:
1. Offer related categories or remind them they can share a TradeZone.sg product link for a manual lookup.

---

## 6. Regression Checklist
- `npm run dev`, then test each scenario in both modes:
  1. “Any basketball game for PS5”
  2. “Any FIFA game”
  3. “Any gaming chair” (should not show GPUs)
  4. “Cheap iPhone”
  5. “Trade my PS4 Pro 1TB for PS5 Pro Digital”
  6. “Need a tablet under $400”
- Confirm:
  - Outputs list WooCommerce items only.
  - Sport/platform filters keep the topic relevant.
  - Trade flow collects all steps without detours.
  - Voice transcript mirrors the text logic and the UI stays readable on mobile.

Keep this document up to date whenever we adjust the flow or add new device families. Breaking these rules is how hallucinations creep back in.
