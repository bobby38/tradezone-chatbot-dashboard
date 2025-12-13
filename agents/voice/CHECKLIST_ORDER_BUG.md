# Critical Bug: Voice Agent Violating Checklist Order

## Issue
The voice agent is asking for contact information (name, phone, email) BEFORE completing device details (accessories, photos), which violates the deterministic checklist order and causes data loss.

## Expected Order (from agent.py lines 811-822)
```python
STEPS = [
    "storage",      # 0
    "condition",    # 1
    "accessories",  # 2  ← MUST come before contact
    "photos",       # 3  ← MUST come before contact
    "name",         # 4
    "phone",        # 5
    "email",        # 6
    "payout",       # 7
    "recap",        # 8
    "submit",       # 9
]
```

## Actual Order in Conversation
```
1. ✅ Storage (implied in "Switch OLED")
2. ✅ Condition (not shown in transcript, may have been skipped)
3. ❌ SKIPPED accessories
4. ❌ SKIPPED photos
5. ❌ Asked "Your name?" ← WRONG! Should be accessories first
6. ❌ Asked "Contact number?"
7. ❌ Asked "Email address?"
8. ❌ Finally asked "Got the box and accessories?" ← TOO LATE!
9. ❌ FAILED to save
```

## Why This Causes Failure

### The Gating Logic (auto_save.py lines 668-691)
```python
if field == "contact_name":
    if checklist_state.can_collect_contact("name"):  # ← Checks ready_for_contact()
        checklist_state.mark_field_collected("name", value)
    else:
        logger.info("[auto-save] ⏭️ Skipping name until device details complete")
```

### The Readiness Check (agent.py lines 858-873)
```python
def ready_for_contact(self) -> bool:
    """Determine if we have enough device details to request contact info"""
    has_storage = self._storage_collected()
    has_condition = "condition" in self.collected_data
    has_accessories = "accessories" in self.collected_data  # ← REQUIRED!
    has_photos = "photos" in self.collected_data  # ← REQUIRED!
    ready = has_storage and has_condition and has_accessories and has_photos
    return ready
```

### What Happened
1. Agent asked "Your name?" when accessories/photos weren't collected yet
2. User said "Bobby"
3. Auto-save extracted name but `can_collect_contact("name")` returned FALSE
4. Name was SKIPPED (not saved)
5. Same for phone and email - all SKIPPED
6. Agent finally asked "Got the box and accessories?"
7. User said "Yes"
8. Auto-save tried to save accessories
9. API call included accessories but NO contact info (because it was skipped earlier)
10. API validation failed → "I'm having trouble saving the details"

## Root Cause

**The LLM is not respecting the deterministic checklist order!**

Looking at agent.py lines 700-715, the `tradein_update_lead` tool returns:
```python
if next_question == "recap":
    return "✅ Information saved. 🚨 SYSTEM RULE: You MUST now display..."
elif next_question == "submit":
    return "✅ All information collected. 🚨 SYSTEM RULE: You MUST call..."
else:
    return f"✅ Saved. 🚨 SYSTEM RULE: You MUST ask ONLY '{next_question}' next..."
```

But the LLM is **ignoring these system rules** and asking questions out of order!

## Why the LLM Ignores the Rules

The problem is in the **instructions** at agent.py lines 1145-1222. The trade-up flow instructions say:

```python
**Step 6: Collect Device Details BEFORE contact info**
1. ✅ Ask storage (if not mentioned): "Storage size?"
2. ✅ Ask condition next: "Condition of your {SOURCE}? Mint, good, fair, or faulty?"
3. ✅ Ask accessories/box: "Got the box and accessories?"
4. ✅ Nudge for photos: "Photos help—want to send one?"
5. ✅ Call tradein_update_lead after EACH of these answers...

**Step 7: Collect Contact Info + pricing context**
6. ✅ Ask name: "Your name?"
7. ✅ Ask phone: "Contact number?" → repeat back for confirmation
8. ✅ Ask email: "Email address?" → repeat back for confirmation
```

The instructions are CORRECT, but the LLM is not following them!

## The Real Problem

The issue is that **the LLM has too much freedom**. Even with explicit instructions and system rules, it's making its own decisions about question order.

The checklist state machine exists (TradeInChecklistState) but it's only used for:
1. Tracking what's been collected
2. Gating auto-save (preventing out-of-order saves)
3. Returning the next question

But the LLM is **not forced to ask the next question**. It can ask whatever it wants!

## Solution

We need to **enforce the checklist order at the LLM level**, not just at the auto-save level.

### Option 1: Stronger System Rules (Quick Fix)
Add to the instructions at line 991:

```python
🔴 CRITICAL - CHECKLIST ORDER ENFORCEMENT:
You MUST follow this EXACT order. DO NOT skip ahead:
1. Storage → 2. Condition → 3. Accessories → 4. Photos → 5. Name → 6. Phone → 7. Email → 8. Payout

NEVER ask for name/phone/email until AFTER you've asked about accessories and photos.
If you ask for contact info before accessories/photos, the data will be LOST and the trade-in will FAIL.

After EVERY tradein_update_lead call, the tool will tell you the EXACT next question.
You MUST ask that question and ONLY that question. DO NOT skip ahead or ask multiple questions.
```

### Option 2: Force Tool Response (Better Fix)
Modify the tool response at lines 700-715 to be MORE forceful:

```python
# Instead of just returning the next question, return a COMMAND
if next_question == "accessories":
    return "🚨 STOP! You MUST ask about accessories NOW. Say EXACTLY: 'Got the box and accessories?' DO NOT ask for name/phone/email yet!"
elif next_question == "photos":
    return "🚨 STOP! You MUST ask about photos NOW. Say EXACTLY: 'Photos help—want to send one?' DO NOT ask for contact info yet!"
elif next_question == "name":
    return "🚨 NOW you can ask for contact. Say EXACTLY: 'Your name?'"
```

### Option 3: Disable LLM Question Generation (Best Fix)
Instead of letting the LLM generate questions, have the tool response include the EXACT text to speak:

```python
return {
    "status": "saved",
    "next_action": "speak",
    "text_to_speak": "Got the box and accessories?",
    "do_not_modify": True
}
```

Then in the agent, force it to speak that exact text without modification.

## Immediate Fix

The quickest fix is to update the instructions to be MORE explicit about the consequences of violating order:

```python
🔴 CRITICAL - DATA LOSS WARNING:
If you ask for name/phone/email BEFORE asking about accessories and photos,
the contact information will be SILENTLY DISCARDED and the trade-in will FAIL.

You MUST complete device details FIRST:
1. Storage
2. Condition  
3. Accessories ← MUST ask this BEFORE name
4. Photos ← MUST ask this BEFORE name
5. ONLY THEN ask for name/phone/email

The system will REJECT contact info if accessories/photos aren't collected first.
This is a HARD REQUIREMENT enforced by the database.
```

## Testing After Fix

Test this exact flow:
```
Agent: "Your Switch OLED trades for S$100. The Nintendo Switch 2 is S$500. Top-up: S$400. Want to proceed?"
User: "Yes"
Agent: "Storage size?" ← Should ask this OR skip if already known
User: "64GB" OR Agent skips (OLED is always 64GB)
Agent: "Condition?" ← Should ask this
User: "Good"
Agent: "Got the box and accessories?" ← MUST ask this BEFORE name
User: "Yes"
Agent: "Photos help—want to send one?" ← MUST ask this BEFORE name
User: "No photos"
Agent: "Your name?" ← NOW it's safe to ask
User: "Bobby"
Agent: "Contact number?"
User: "84489068"
Agent: "Email?"
User: "bobby@hotmail.com"
Agent: [Saves all data successfully]
```

## Files to Modify
1. `agents/voice/agent.py` lines 991-1222 - Strengthen checklist order instructions
2. `agents/voice/agent.py` lines 700-715 - Make tool responses more forceful
3. Consider adding a hard block in auto_save.py that REFUSES to extract contact fields if device details aren't complete