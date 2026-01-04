# Voice Agent Issues - January 4, 2026

**Test Session Analysis:** Bobby's PS4 Pro 1TB Trade-In  
**Date:** 2026-01-04  
**Status:** 🔴 **CRITICAL ISSUES FOUND**

---

## Issue 1: Brand/Model NOT Captured 🔴 CRITICAL

### Problem
User said: **"I like to trade my PS4 Pro 1TB disc"**  
Database Result: `brand: null, model: null`  
Submission Error: `Missing required trade-in details: device brand, device model`

### Root Cause
**File:** `agents/voice/auto_save.py:169-182`

PS4 Pro pattern is **MISSING** from device_patterns dictionary!

**Current patterns (line 169):**
```python
device_patterns = {
    "playstation 5": {"brand": "Sony", "model": "PlayStation 5"},
    "ps5": {"brand": "Sony", "model": "PlayStation 5"},
    "playstation 4": {"brand": "Sony", "model": "PlayStation 4"},
    "ps4": {"brand": "Sony", "model": "PlayStation 4"},  # ← Generic PS4 only!
    # ❌ MISSING: "ps4 pro", "ps4 slim", "playstation 4 pro", "playstation 4 slim"
}
```

When user says "PS4 Pro", pattern matches generic "ps4" but NOT the variant.

### Fix Required
Add PS4 variants BEFORE generic patterns (order matters):

```python
device_patterns = {
    # ✅ ADD THESE (specific variants first)
    "playstation 4 pro": {"brand": "Sony", "model": "PlayStation 4 Pro"},
    "ps4 pro": {"brand": "Sony", "model": "PlayStation 4 Pro"},
    "playstation 4 slim": {"brand": "Sony", "model": "PlayStation 4 Slim"},
    "ps4 slim": {"brand": "Sony", "model": "PlayStation 4 Slim"},
    
    # ✅ ADD PS5 variants too
    "playstation 5 pro": {"brand": "Sony", "model": "PlayStation 5 Pro"},
    "ps5 pro": {"brand": "Sony", "model": "PlayStation 5 Pro"},
    "playstation 5 slim": {"brand": "Sony", "model": "PlayStation 5 Slim"},
    "ps5 slim": {"brand": "Sony", "model": "PlayStation 5 Slim"},
    "playstation 5 digital": {"brand": "Sony", "model": "PlayStation 5 Digital"},
    "ps5 digital": {"brand": "Sony", "model": "PlayStation 5 Digital"},
    
    # Generic fallbacks (must come AFTER variants)
    "playstation 5": {"brand": "Sony", "model": "PlayStation 5"},
    "ps5": {"brand": "Sony", "model": "PlayStation 5"},
    "playstation 4": {"brand": "Sony", "model": "PlayStation 4"},
    "ps4": {"brand": "Sony", "model": "PlayStation 4"},
}
```

**Priority:** 🔴 **P0 - BLOCKS ALL PS4/PS5 SUBMISSIONS**

---

## Issue 2: Multiple Questions in One Response 🔴 CRITICAL

### Problem
Agent says: **"Condition? Mint, good,"** (cut off mid-sentence)  
Agent says: **"Whenever you're ready, you can share your contact details—like your name, phone number, or email"**

**Expected:** ONE question per response  
**Actual:** Multiple questions OR long explanations

### Examples from Logs
```
❌ "Condition? Mint, good,"  
❌ "Whenever you're ready, you can share your contact details—like your name, phone number, or email—so we can proceed with the next steps."
```

### Root Cause
Voice agent instructions say "one question at a time" but LLM is NOT enforcing it strictly enough.

**File:** `agents/voice/agent.py:2253-2263`

Current instruction:
```
"Keep spoken responses to 1–2 sentences, and stop immediately if the caller interrupts."
```

This is TOO VAGUE. LLM interprets "1-2 sentences" as permission to bundle questions.

### Fix Required
**Make it EXPLICIT and add examples:**

```python
# BEFORE
"Keep spoken responses to 1–2 sentences"

# AFTER
🔴 **ONE QUESTION ONLY - VOICE RULE:**
- Ask EXACTLY ONE question per response
- NO bundling (NOT "name, phone, or email")
- NO options (NOT "Condition? Mint, good, fair")
- NO explanations after the question

✅ CORRECT:
"What's the condition?"
"Your name?"
"Phone number?"

❌ WRONG:
"Condition? Mint, good, fair" (listing options)
"Can you share your name, phone, and email?" (multiple questions)
"Your contact details—like name, phone, or email?" (bundled)
```

**Priority:** 🔴 **P0 - RUINS UX**

---

## Issue 3: TTS Currency Pronunciation 🟡 HIGH

### Problem
Agent text: **"$200"**  
TTS Speech: **"S two hundred"** or **"dollar sign two hundred"**

### Root Cause
**File:** `agents/voice/agent.py:251-258`

Current `_normalize_voice_currency()`:
```python
def _normalize_voice_currency(text: str) -> str:
    normalized = text.replace("S$", "$")  # ← Still says "dollar sign"
    normalized = normalized.replace("Singapore dollars", "dollars")
    return normalized
```

TTS engines pronounce "$200" as "dollar sign two hundred" or skip it entirely.

### Fix Required
Convert to spoken English:

```python
def _normalize_voice_currency(text: str) -> str:
    """Convert currency symbols to spoken English for TTS."""
    if not text:
        return text
    
    # Pattern: S$XXX or $XXX → "XXX dollars"
    # Handles: S$200, $450, S$1,300
    def replace_currency(match):
        amount = match.group(1)
        # Remove commas for clean speech
        clean_amount = amount.replace(",", "")
        return f"{clean_amount} dollars"
    
    # Match S$XXX or $XXX
    normalized = re.sub(r'[S\$]\$?([\d,]+)', replace_currency, text)
    
    # Cleanup
    normalized = normalized.replace("Singapore dollars", "dollars")
    normalized = normalized.replace("  ", " ")  # Remove double spaces
    
    return normalized

# Examples:
# "Trade-in: S$200" → "Trade-in: 200 dollars"
# "Your PS5 is worth $350" → "Your PS5 is worth 350 dollars"
# "Top-up: S$1,300" → "Top-up: 1300 dollars"
```

**Priority:** 🟡 **P1 - POOR UX**

---

## Issue 4: Recap Too Long for Voice 🟡 HIGH

### Problem
Voice recap is a **wall of text** (73 words):

```
"Noted. Now, let's recap: PS4 Pro 1TB, condition good, box included, 
photos sent. Bobby, phone 8448 9068, email bobby_dennie@hotmail.com. 
Everything correct?"
```

**Expected:** Short, conversational (≤20 words)  
**Actual:** Long text-chat format

### Root Cause
Voice agent uses **same recap format as text chat**.

No voice-specific optimization exists.

### Fix Required
Add voice-specific recap in `agent.py`:

```python
def _build_voice_recap(collected_data: dict) -> str:
    """
    Short voice recap (≤20 words).
    Format: Device, condition, payout. Name for contact. Sound good?
    """
    parts = []
    
    # Device
    if collected_data.get("model") and collected_data.get("storage"):
        parts.append(f"{collected_data['model']} {collected_data['storage']}")
    
    # Condition
    if collected_data.get("condition"):
        parts.append(f"{collected_data['condition']} condition")
    
    # Payout (not for trade-ups)
    if collected_data.get("payout") and not collected_data.get("is_trade_up"):
        parts.append(f"cash payout" if collected_data["payout"] == "cash" else collected_data["payout"])
    
    # Contact
    if collected_data.get("name"):
        parts.append(f"{collected_data['name']} for contact")
    
    recap = ", ".join(parts[:3])  # Max 3 parts
    return f"{recap}. Sound good?"

# Examples:
# ✅ "PS4 Pro 1TB, good condition, cash. Bobby for contact. Sound good?"
# ✅ "Steam Deck 512GB, mint, PayNow. Alice for contact. Sound good?"
# ✅ "Switch OLED, fair condition. Bob for contact. Sound good?"
```

**Priority:** 🟡 **P1 - POOR UX**

---

## Issue 5: No Validation Before Submission 🔴 CRITICAL

### Problem
Agent attempts submission **3+ times** even though brand/model are missing:

```
[ForceSubmit] ❌ Failed: 400 - Missing required trade-in details: device brand, device model
[ForceSubmit] ❌ Failed: 400 - Missing required trade-in details: device brand, device model
[ForceSubmit] ❌ Failed: 400 - Missing required trade-in details: device brand, device model
```

Agent says:
- "Let's try again. One moment, please."
- "I'm sorry that's not going through."
- "It seems there's a technical issue."

**This confuses the user!**

### Root Cause
**File:** `agents/voice/auto_save.py` (ForceSubmit function)

No validation check before calling submit API.

### Fix Required
Add validation guard in `ForceSubmit`:

```python
def force_submit_trade_in(session_id: str, checklist_state: Any):
    """
    Force submit when recap confirmed.
    ✅ NEW: Validate required fields BEFORE API call.
    """
    logger.warning(f"[ForceSubmit] 🚀 Force submitting for {session_id}")
    
    # ✅ VALIDATION GUARD
    collected = checklist_state.collected_data
    missing = []
    
    if not collected.get("brand"):
        missing.append("brand")
    if not collected.get("model"):
        missing.append("model")
    if not collected.get("condition"):
        missing.append("condition")
    if not collected.get("email"):
        missing.append("email")
    if not collected.get("phone"):
        missing.append("phone")
    
    if missing:
        logger.error(f"[ForceSubmit] ❌ Cannot submit - missing: {missing}")
        # Return error to LLM so it asks for missing data
        return {
            "error": f"Missing: {', '.join(missing)}. Please collect these before submitting.",
            "missing_fields": missing
        }
    
    # Proceed with submission
    payload = build_submit_payload(session_id, collected)
    response = call_submit_api(payload)
    return response
```

**Priority:** 🔴 **P0 - BLOCKS SUBMISSIONS**

---

## Issue 6: Submission Loop Without Recovery 🟡 HIGH

### Problem
When submission fails, agent:
1. Retries immediately (fails again)
2. Says "technical issue"
3. Offers staff escalation
4. **NEVER asks for the missing brand/model!**

**Expected:** Ask for missing data  
**Actual:** Gives up and offers staff

### Root Cause
LLM doesn't parse the error message to know WHAT is missing.

Error: `"Missing required trade-in details: device brand, device model"`  
Agent response: "technical issue" (generic)

### Fix Required
Parse error and guide LLM:

```python
# When submit fails with 400
if "device brand" in error_message or "device model" in error_message:
    return {
        "error": "INSTRUCTION: Ask user 'What device is this again? Brand and model?' then use tradein_update_lead to save it.",
        "required_action": "collect_device"
    }
```

**Priority:** 🟡 **P1 - POOR RECOVERY**

---

## Summary: Critical Fixes Needed

| Issue | Priority | Impact | Fix Location |
|-------|----------|--------|--------------|
| 1. Brand/Model not captured | 🔴 P0 | **BLOCKS SUBMISSIONS** | `auto_save.py:169` |
| 2. Multiple questions | 🔴 P0 | **RUINS UX** | `agent.py:2253` |
| 3. TTS currency | 🟡 P1 | Poor UX | `agent.py:251` |
| 4. Long recap | 🟡 P1 | Poor UX | `agent.py` (new function) |
| 5. No validation | 🔴 P0 | **RETRY LOOPS** | `auto_save.py` (ForceSubmit) |
| 6. No error recovery | 🟡 P1 | Poor recovery | `agent.py` (error handling) |

**Total Critical (P0):** 3 issues  
**Total High (P1):** 3 issues

---

## Test Case After Fixes

**Input:** "I want to trade my PS4 Pro 1TB disc for cash"

**Expected Flow:**
1. ✅ Brand/model captured: Sony / PlayStation 4 Pro
2. ✅ "What's the condition?" (ONE question)
3. ✅ Price spoken as "one hundred dollars" (not "S one hundred")
4. ✅ Recap: "PS4 Pro 1TB, good condition, cash. Bobby for contact. Sound good?" (short)
5. ✅ Validation passes → submission succeeds → email sent

**Current Flow:**
1. ❌ Brand/model NULL
2. ❌ "Condition? Mint, good," (multiple + cut off)
3. ❌ "S one hundred" (bad TTS)
4. ❌ Long text recap (73 words)
5. ❌ Submission fails 3x → "technical issue"

---

## Next Steps

1. **Fix P0 issues first** (blocks submissions):
   - Add PS4/PS5 variants to device_patterns
   - Enforce ONE question rule with examples
   - Add validation guard before submission

2. **Then fix P1 issues** (poor UX):
   - Improve TTS currency conversion
   - Create voice-specific recap format
   - Add error recovery guidance

3. **Test with same scenario**:
   - PS4 Pro 1TB trade-in for cash
   - Verify brand/model captured
   - Verify one question at a time
   - Verify short recap
   - Verify submission succeeds

---

**Document Created:** 2026-01-04  
**Tester:** Bobby (PS4 Pro 1TB test)  
**Status:** Awaiting fixes
