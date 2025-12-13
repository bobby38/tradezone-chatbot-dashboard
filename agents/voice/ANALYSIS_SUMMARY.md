# Voice Agent Contact Data Loss - Complete Analysis

## Executive Summary

**Status**: 🔴 CRITICAL BUG IDENTIFIED  
**Impact**: Contact information (name, phone, email) silently discarded when collected out of order  
**Result**: Trade-in submissions fail with "I'm having trouble saving the details"  
**Root Cause**: Commit `79aa3b86` added strict gating that blocks contact field saving until device details complete, but LLM still asks for contact info early

---

## The Problem

### User Experience
```
User: "I want to trade my Steam Deck for PS5 Pro"
Agent: "What's your name?"  ← ASKS TOO EARLY
User: "Bobby 84489068 bobby_dennie@hotmail.com"  ← GIVES ALL THREE
Agent: "Got the box and accessories?"  ← MOVES ON
User: "Yes, I got the box and all accessories"
Agent: "I'm having trouble saving the details" ❌ FAILS
```

### What Actually Happened
1. ✅ Auto-extraction correctly parsed: name="Bobby", phone="84489068", email="bobby_dennie@hotmail.com"
2. ❌ `can_collect_contact("name")` returned FALSE (accessories/photos not saved yet)
3. ❌ All contact data SILENTLY SKIPPED (logged but not saved to checklist state)
4. ✅ Agent asked "Got the box and accessories?" and user said "Yes"
5. ❌ Auto-save tried to save accessories but API call had NO contact info
6. ❌ API validation failed → "I'm having trouble saving the details"

---

## Root Cause Analysis

### The Gating Logic (Commit `79aa3b86`)

**File**: `agents/voice/auto_save.py` lines 668-691

```python
# Contact fields are GATED
if field == "contact_name":
    if checklist_state.can_collect_contact("name"):
        checklist_state.mark_field_collected("name", value)
        applied_fields.append("name")
    else:
        logger.info("[auto-save] ⏭️ Skipping name until device details complete")
        # ❌ DATA IS LOST HERE - extracted but not saved!
```

**File**: `agents/voice/agent.py` lines 889-897

```python
def can_collect_contact(self, field_name: str) -> bool:
    """Return True only when we're ready to collect the specified contact field."""
    if field_name == "name":
        return self.ready_for_contact()  # Requires storage, condition, accessories, photos
    if field_name == "phone":
        return self.ready_for_contact() and "name" in self.collected_data
    if field_name == "email":
        return self.ready_for_contact() and "phone" in self.collected_data
    return True
```

**File**: `agents/voice/agent.py` lines 858-873

```python
def ready_for_contact(self) -> bool:
    """Check if we're ready to collect contact info (device details must be complete)"""
    ready = (
        "storage" in self.collected_data or self.storage_not_applicable
    ) and (
        "condition" in self.collected_data
    ) and (
        "accessories" in self.collected_data  # ❌ BLOCKS contact collection
    ) and (
        "photos" in self.collected_data      # ❌ BLOCKS contact collection
    )
    return ready
```

### The LLM Problem

**File**: `agents/voice/agent.py` lines 991-1222 (Trade-up instructions)

The instructions say:
```python
# Line 1145-1150
"""
5. **Collect Device Details BEFORE contact info**:
   - Storage (if applicable)
   - Condition
   - Accessories/box
   - Photos (optional but encouraged)
   - THEN name, phone, email
"""
```

**BUT**: The LLM ignores this and asks for contact info early because:
1. It has too much freedom in question ordering
2. The instructions are not forceful enough
3. There's no hard block preventing early contact questions
4. The "🚨 SYSTEM RULE" messages from tools are not strong enough

---

## Why This is Critical

### Data Loss Flow
```
User provides: "Bobby 84489068 bobby_dennie@hotmail.com"
    ↓
auto_save.py extracts all 3 fields ✅
    ↓
can_collect_contact("name") → FALSE ❌
    ↓
Data logged but NOT saved to checklist ❌
    ↓
Later: Agent tries to submit with NO contact info ❌
    ↓
API validation fails → Error message ❌
```

### Impact
- ❌ Trade-in submissions fail silently
- ❌ Customer frustration (provided info but system "lost" it)
- ❌ Staff doesn't receive leads
- ❌ Lost sales opportunities

---

## The Solution

### Three-Pronged Approach

#### 1. Strengthen Agent Instructions (CRITICAL)
**File**: `agents/voice/agent.py` lines 991-1222

Add forceful warnings at the TOP of trade-up instructions:

```python
"""
🔴 CRITICAL - DATA LOSS PREVENTION:

If you ask for contact information (name, phone, email) BEFORE completing 
device details (storage, condition, accessories, photos), the system will 
SILENTLY DISCARD the contact data and the submission will FAIL.

YOU MUST FOLLOW THIS EXACT ORDER:
1. Storage (or confirm not applicable)
2. Condition
3. Accessories/box
4. Photos (optional but ask once)
5. ONLY THEN: Name
6. ONLY THEN: Phone
7. ONLY THEN: Email

❌ WRONG ORDER (causes data loss):
User: "I want to trade Steam Deck"
Agent: "What's your name?" ← TOO EARLY! Will lose data!

✅ CORRECT ORDER:
User: "I want to trade Steam Deck"
Agent: "What's the storage - 512GB or 1TB?"
Agent: "What's the condition?"
Agent: "Got the box and accessories?"
Agent: "Photos help - want to send one?"
Agent: "What's your name?" ← NOW it's safe!
"""
```

#### 2. Strengthen Tool Responses (CRITICAL)
**File**: `agents/voice/agent.py` lines 700-715

Make tool responses BLOCK out-of-order questions:

```python
# Current (weak):
return f"✅ Saved. 🚨 SYSTEM RULE: You MUST ask ONLY '{next_question}' next..."

# New (forceful):
if next_step == "accessories" and any(f in extracted for f in ["contact_name", "contact_phone", "contact_email"]):
    return f"""
🚨 STOP! You asked for contact info too early!

The system will DISCARD contact data if you collect it before device details.

You MUST ask about accessories NOW. DO NOT ask for name/phone/email yet!

Next question: "Got the box and accessories?"
"""
```

#### 3. Update Documentation
**File**: `agent.md` lines 3-14

Add to change log:
```markdown
## Change Log — Dec 13, 2025 (Voice Agent - CRITICAL BUG FIX)
- **FIXED**: Contact data loss when LLM asks for name/phone/email before device details complete
- **FIXED**: Strengthened agent instructions with DATA LOSS warnings
- **FIXED**: Tool responses now BLOCK out-of-order contact collection
- **IMPROVED**: Checklist gating now prevents silent data discard
```

---

## Testing Checklist

After implementing fixes, test these scenarios:

### Scenario 1: Correct Order (Should Work)
```
✓ Agent asks storage
✓ Agent asks condition
✓ Agent asks "Got the box and accessories?"
✓ Agent asks "Photos help—want to send one?"
✓ Agent asks "Your name?"
✓ Agent asks phone and email
✓ All data saves successfully
```

### Scenario 2: User Provides Contact Early (Should Be Blocked)
```
User: "Bobby 84489068 bobby@email.com" (before accessories asked)
✓ Agent says "I need device details first"
✓ Agent asks "Got the box and accessories?"
✓ Agent does NOT ask for contact again (already has it)
✓ All data saves successfully
```

### Scenario 3: Bulk Input (Should Handle Gracefully)
```
User: "Bobby 84489068 bobby@email.com" (after accessories confirmed)
✓ Agent acknowledges all three fields
✓ Agent moves to next step (payout or recap)
✓ All data saves successfully
```

---

## Deployment Instructions

### 1. Update Agent Code
```bash
cd /Users/bobbymini/Documents/tradezone-chatbot-dashboard
git checkout feature/livekit-voice-agent
# Apply fixes to agents/voice/agent.py
git add agents/voice/agent.py
git commit -m "fix: prevent contact data loss with forceful order enforcement"
git push
```

### 2. Rebuild Voice Agent Container
```bash
# In Coolify dashboard:
1. Go to voice agent service
2. Click "Redeploy"
3. Enable "Disable cache" and "Skip build cache"
4. Wait for deployment to complete
```

### 3. Verify Deployment
```bash
# Check container logs for:
echo $CHATKIT_API_KEY | cut -c1-8   # expect tzck_mfu
echo $NEXT_PUBLIC_API_URL           # expect https://trade.rezult.co

# Test voice flow:
1. Start voice chat
2. Say "I want to trade Steam Deck for PS5 Pro"
3. Verify agent asks storage → condition → accessories → photos → name
4. Provide contact info
5. Verify submission succeeds
```

---

## Files Modified

1. `agents/voice/agent.py` - Strengthen instructions + tool responses
2. `agent.md` - Update change log
3. `agents/voice/ANALYSIS_SUMMARY.md` - This document

---

## Related Documents

- `agents/voice/CHECKLIST_ORDER_BUG.md` - Initial bug analysis
- `agent.md` lines 3-148 - Voice agent documentation
- `agents/voice/auto_save.py` lines 668-691 - Gating logic
- `agents/voice/agent.py` lines 858-897 - Checklist state machine

---

## Commit History

- `a352a7e8` - docs: note enforced voice checklist order
- `79aa3b86` - fix: harden voice checklist gating ← INTRODUCED BUG
- `8480fe9c` - fix: enforce device-first checklist before contact
- `aa62ae2f` - voice-agent: normalize payout inputs and enforce device-first flow

---

**Status**: Ready for implementation  
**Priority**: CRITICAL  
**Estimated Time**: 2-3 hours (code + test + deploy)