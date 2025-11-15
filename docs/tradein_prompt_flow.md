# Trade-In Prompt + Retriever Instructions

This document captures the guardrails we implemented for both text and voice agents so they emit deterministic answers and machine-readable JSON alongside every trade-in calculation.

## 1. Retrieval Inputs

- **Vector Store IDs**
  - Catalog / WooCommerce content: `vs_68e89cf979e88191bb8b4882caadbc0d`
  - Trade-in grid + FAQs: `vs_68f3ab92f57c8191846cb6d643e4cb85`
- **Source Files**
  - Canonical CSV: `Tradezone Price Grid Nov 12 2025.csv`
  - Markdown snapshot (ingested into vector store): `tradezone_price_grid_for_openai_vector.md`
  - Synonym map: `data/tradein_synonyms.json`

## 2. JSON Reply Contract

Every quote must return the following JSON so downstream dashboards and QA tools can verify the numbers:

```json
{
  "reply_text": "Plain-English answer shown to the customer",
  "slots_filled": {
    "trade_in_brand": "Sony",
    "trade_in_model": "PS5 Fat",
    "trade_in_variant": "825GB Disc",
    "trade_in_condition": "preowned",
    "trade_in_value_sgd": 350,
    "target_brand": "Sony",
    "target_model": "PS5 Pro",
    "target_variant": "2TB Digital",
    "target_price_sgd": 1099,
    "used_device_discount_sgd": 0
  },
  "top_up_sgd": 749,
  "calculation_steps": [
    "target_price_sgd (1099) - trade_in_value_sgd (350) - used_device_discount_sgd (0) = 749"
  ],
  "confidence": 0.95,
  "provenance": [
    {"field": "trade_in_value_sgd", "source": "price_grid_v2025-11-12", "confidence": 0.95},
    {"field": "target_price_sgd", "source": "price_grid_v2025-11-12", "confidence": 0.95}
  ],
  "flags": {
    "requires_human_review": false,
    "is_provisional": false
  }
}
```

## 3. Prompt Flow (short version)

1. **Detect trade-in intent** (request_top_up / ask_trade_in_value). Route retrieval to the trade-in vector store first.
2. **Mirror the request**: “Got it—you want to trade your PS5 Disc for the PS5 Pro.”
3. **Immediate price answer**: Pull both rows from the grid, assume “good condition with box/cables” unless the user stated otherwise, and respond in one sentence: “PS5 Disc trade-in ~S$350 (assumes good condition). PS5 Pro new is S$1,099. Top-up ≈ S$749.”
4. **Only after confirmation** ask for missing slots (condition, accessories, photos, contact). Never ask for phone/email until the user opts in.
5. **Save slots via `tradein_update_lead`** after each answer; once all required fields exist, run `tradein_submit_lead`.
6. **Final recap**: repeat device, condition, accessories, quoted range, and remind customer the final price is confirmed on physical inspection.

## 4. Deterministic Math Guardrails

- Use the CSV + synonym map to resolve variants before calling the LLM.
- Arithmetic must be `target_price - trade_in_value - used_device_discount` with integer math (no rounding unless noted).
- If the grid stores a range, compute both min/max top-ups and label clearly.
- When confidence from the grid < 0.8 (e.g., fuzzy match), mark `flags.is_provisional = true` and offer a human review.

## 5. Voice/Text Parity

Voice agent uses the same retrieval inputs and prompt flow, with the only difference being shorter phrasing (≤12 words per sentence) and immediate stop-on-interrupt. All JSON payloads are still emitted for logging.

## 6. Updating the Grid

1. Update `Tradezone Price Grid Nov 12 2025.csv` (or a newer dated copy).
2. Run `python scripts/tradein_price_tool.py to-jsonl --csv ... --out data/tradezone_price_grid.jsonl --price-grid-version YYYY-MM-DD`.
3. Upload the JSONL to the trade-in vector store (`vs_68f3ab92f57c8191846cb6d643e4cb85`).
4. Redeploy if prompts reference the new version number.

With this pipeline we can checkpoint data, feed the vector store, and keep deterministic math in sync across text and voice agents.
