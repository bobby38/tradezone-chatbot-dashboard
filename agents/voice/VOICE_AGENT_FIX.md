# Voice Agent Fix - Accessories Step Failure

## Issue
User conversation failed at accessories step with error: "I'm having trouble saving the details"

## Conversation Flow
```
User: "Yes, I got the box and all accessories."
Agent: "I'm having trouble saving the details. Let me connect you with our staff."
```

## Root Cause
In `agent.py` line 577-579, when detecting accessories from notes:
```python
notes_lower = notes.lower() if notes else ""
if notes and ("box" in notes_lower or "accessories" in notes_lower):
    fields_being_set.append("accessories")
```

The code detects that accessories info is present, but then passes the raw `notes` parameter to the API. However, the API expects a specific format.

## The Problem
1. User says: "Yes, I got the box and all accessories"
2. Agent calls `tradein_update_lead(notes="Yes, I got the box and all accessories")`
3. API receives raw user message as notes
4. The `notes` field should contain formatted text like "Has box and accessories" (see auto_save.py:403-407)
5. API validation may be rejecting the unformatted notes

## Solution

### Option 1: Format notes in tradein_update_lead (RECOMMENDED)
In `agent.py` around line 577, convert user response to proper format:

```python
# Before passing to API, format notes properly
if notes and ("box" in notes_lower or "accessories" in notes_lower):
    # Detect if user has accessories
    has_accessories = any(word in notes_lower for word in ["yes", "have", "got", "all"])
    # Format as expected by API
    notes = "Has box and accessories" if has_accessories else "No box/accessories"
    fields_being_set.append("accessories")
```

### Option 2: Use auto_save.py extraction (BETTER)
The auto_save.py already has proper extraction logic at line 238-243:

```python
# Box/accessories
if (
    "box" in lower or "accessor" in lower
) and "accessories" not in checklist_state.collected_data:
    has_box = "yes" in lower or "have" in lower or "got" in lower
    extracted["accessories"] = has_box
```

**The auto_save system should be handling this!** The issue is that `tradein_update_lead` is being called BEFORE auto_save can process the message.

## Recommended Fix

**In `agent.py` line 577-605**, remove the manual notes handling and let auto_save handle it:

```python
# REMOVE THIS BLOCK (lines 577-605):
notes_lower = notes.lower() if notes else ""
if notes and ("box" in notes_lower or "accessories" in notes_lower):
    fields_being_set.append("accessories")
```

**Instead, rely on auto_save.py** which already extracts accessories correctly and formats them properly before calling the API.

The flow should be:
1. User says "Yes, I got the box"
2. auto_save.py extracts: `{"accessories": True}`
3. auto_save.py calls force_save_to_db with formatted notes: "Has box and accessories"
4. API accepts the properly formatted data

## Testing
After fix, test this flow:
```
Agent: "Got the box and accessories?"
User: "Yes, I got the box and all accessories"
Expected: ✅ Data saved successfully, moves to next step (photos)
```

## Files to Modify
- `agents/voice/agent.py` lines 577-605 (remove manual notes handling)
- Let auto_save.py handle all data extraction and formatting