"""
Auto-save system for voice trade-in agent.
This Python code handles ALL data extraction and saving,
removing reliance on LLM tool calls.
"""

import logging
import re
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger("agent-amara")


def extract_data_from_message(message: str, checklist_state: Any) -> Dict[str, Any]:
    """
    Smart extraction: parse user messages for trade-in data.
    This runs on EVERY user message to auto-collect data without relying on LLM.
    """
    lower = message.lower()
    extracted = {}

    # Storage detection (512GB, 1TB, etc.)
    storage_match = re.search(r"\b(\d+\s*(gb|tb|mb))\b", lower)
    if storage_match and "storage" not in checklist_state.collected_data:
        extracted["storage"] = storage_match.group(1).upper().replace(" ", "")
        logger.warning(f"[auto-extract] 💾 Found storage: {extracted['storage']}")

    # Condition detection
    condition_keywords = {
        "mint": "mint",
        "good": "good",
        "fair": "fair",
        "faulty": "faulty",
        "broken": "faulty",
    }
    for keyword, condition in condition_keywords.items():
        if keyword in lower and "condition" not in checklist_state.collected_data:
            extracted["condition"] = condition
            logger.warning(f"[auto-extract] ✨ Found condition: {condition}")
            break

    # Email detection
    email_match = re.search(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", lower)
    if email_match and "email" not in checklist_state.collected_data:
        extracted["contact_email"] = email_match.group(0)
        logger.warning(f"[auto-extract] 📧 Found email: {extracted['contact_email']}")

    # Phone detection (8+ digits) - improved to handle "848 9068" format
    # Check if message is primarily numbers (with optional spaces/dashes)
    digits_only = re.sub(r"[^\d]", "", message)
    if (
        len(digits_only) >= 8
        and len(digits_only) <= 15
        and "phone" not in checklist_state.collected_data
    ):
        # If message is mostly digits (at least 50% of chars), it's likely a phone
        if len(digits_only) / max(len(message), 1) >= 0.5:
            extracted["contact_phone"] = digits_only
            logger.warning(
                f"[auto-extract] 📞 Found phone: {extracted['contact_phone']}"
            )

    # Box/accessories
    if (
        "box" in lower or "accessor" in lower
    ) and "accessories" not in checklist_state.collected_data:
        has_box = "yes" in lower or "have" in lower or "got" in lower
        extracted["accessories"] = has_box
        logger.warning(f"[auto-extract] 📦 Box/accessories: {has_box}")

    # Photos acknowledgment
    if (
        "photo" in lower or "picture" in lower or "image" in lower
    ) and "photos" not in checklist_state.collected_data:
        wants_photos = not any(word in lower for word in ["no", "don't", "not", "none"])
        extracted["photos_acknowledged"] = wants_photos
        logger.warning(f"[auto-extract] 📸 Photos: {wants_photos}")

    # Name detection - improved to handle various name formats
    if "name" not in checklist_state.collected_data:
        # Skip if it's clearly not a name (has email, phone, storage, condition keywords)
        skip_keywords = [
            "@",
            "gb",
            "tb",
            "mint",
            "good",
            "fair",
            "faulty",
            "box",
            "accessor",
            "photo",
        ]
        has_skip = any(keyword in lower for keyword in skip_keywords)

        # Skip if it's mostly numbers (likely phone/storage)
        digit_ratio = len(re.sub(r"[^\d]", "", message)) / max(len(message), 1)

        if not has_skip and digit_ratio < 0.3 and len(message.split()) <= 4:
            # If current step is "name" OR if it's after a name question, extract it
            if checklist_state.get_current_step() == "name":
                # Clean up the name (remove extra punctuation)
                name = re.sub(r"[.!?]+$", "", message.strip())
                if len(name) >= 2:  # At least 2 chars
                    extracted["contact_name"] = name
                    logger.warning(
                        f"[auto-extract] 👤 Found name: {extracted['contact_name']}"
                    )

    return extracted


async def force_save_to_db(
    session_id: str, checklist_state: Any, api_base_url: str, headers: Dict[str, str]
) -> bool:
    """
    FORCE save all collected data to database.
    Returns True if successful.
    """
    logger.warning("=" * 80)
    logger.warning("[auto-save] 🔥 PYTHON FORCING SAVE TO DATABASE")
    logger.warning(f"[auto-save] session_id={session_id}")
    logger.warning(f"[auto-save] collected_data={checklist_state.collected_data}")
    logger.warning("=" * 80)

    if not headers:
        logger.error("[auto-save] ❌ No API key")
        return False

    # Build payload from checklist state
    data = {"sessionId": session_id}

    # Add all collected fields
    if "brand" in checklist_state.collected_data:
        data["brand"] = checklist_state.collected_data["brand"]
    if "model" in checklist_state.collected_data:
        data["model"] = checklist_state.collected_data["model"]
    if "storage" in checklist_state.collected_data:
        data["storage"] = checklist_state.collected_data["storage"]
    if "condition" in checklist_state.collected_data:
        data["condition"] = checklist_state.collected_data["condition"]
    if "accessories" in checklist_state.collected_data:
        data["notes"] = (
            "Has box and accessories"
            if checklist_state.collected_data["accessories"]
            else "No box/accessories"
        )
    if "photos" in checklist_state.collected_data:
        data["notes"] = (
            data.get("notes", "")
            + " | Photos: "
            + (
                "Provided"
                if checklist_state.collected_data["photos"]
                else "Not provided"
            )
        ).strip()
    if "name" in checklist_state.collected_data:
        data["contact_name"] = checklist_state.collected_data["name"]
    if "phone" in checklist_state.collected_data:
        data["contact_phone"] = checklist_state.collected_data["phone"]
    if "email" in checklist_state.collected_data:
        data["contact_email"] = checklist_state.collected_data["email"]
    if "payout" in checklist_state.collected_data and not checklist_state.is_trade_up:
        data["preferred_payout"] = checklist_state.collected_data["payout"]

    logger.warning(f"[auto-save] 💾 Payload: {data}")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{api_base_url}/api/tradein/update",
                json=data,
                headers=headers,
                timeout=10.0,
            )

            if response.status_code >= 400:
                logger.error(
                    f"[auto-save] ❌ Failed: {response.status_code} - {response.text}"
                )
                return False

            result = response.json()
            logger.warning(f"[auto-save] ✅ SUCCESS: {result}")
            return True

    except Exception as e:
        logger.error(f"[auto-save] ❌ Exception: {e}")
        return False


async def auto_save_after_message(
    session_id: str,
    user_message: str,
    checklist_state: Any,
    api_base_url: str,
    headers: Dict[str, str],
):
    """
    Automatically extract and save data after EVERY user message.
    This is the key to not relying on LLM tool calls.
    """
    logger.warning(f"[auto-save] 🤖 Processing: {user_message[:80]}")

    # Extract any data from the message
    extracted = extract_data_from_message(user_message, checklist_state)

    if not extracted:
        logger.info("[auto-save] No new data extracted")
        return

    # Update checklist state
    for field, value in extracted.items():
        if field == "contact_name":
            checklist_state.mark_field_collected("name", value)
        elif field == "contact_phone":
            checklist_state.mark_field_collected("phone", value)
        elif field == "contact_email":
            checklist_state.mark_field_collected("email", value)
        elif field == "accessories":
            checklist_state.mark_field_collected("accessories", value)
        elif field == "photos_acknowledged":
            checklist_state.mark_field_collected("photos", value)
        else:
            checklist_state.mark_field_collected(field, value)

    # FORCE save to database
    logger.warning(f"[auto-save] 💾 Saving {len(extracted)} fields...")
    success = await force_save_to_db(session_id, checklist_state, api_base_url, headers)

    if success:
        logger.warning("[auto-save] ✅ Save successful!")
    else:
        logger.error("[auto-save] ❌ Save failed!")


async def check_for_confirmation_and_submit(
    session_id: str,
    user_message: str,
    bot_response: str,
    checklist_state: Any,
    api_base_url: str,
    headers: Dict[str, str],
):
    """
    Check if user is confirming details and auto-submit if ready.
    """
    lower_user = user_message.lower()
    lower_bot = bot_response.lower()

    # Check if bot asked for confirmation
    confirmation_phrases = [
        "everything correct",
        "all set",
        "confirm",
        "is that right",
        "sound good",
    ]

    # Check if user confirmed
    user_confirmed = any(
        word in lower_user
        for word in ["yes", "correct", "ok", "okay", "yep", "yeah", "sure"]
    )
    bot_asked_confirmation = any(phrase in lower_bot for phrase in confirmation_phrases)

    if bot_asked_confirmation and user_confirmed:
        logger.warning("=" * 80)
        logger.warning("[auto-submit] 🎯 CONFIRMATION DETECTED!")
        logger.warning(f"[auto-submit] Bot: {bot_response[:80]}")
        logger.warning(f"[auto-submit] User: {user_message}")
        logger.warning("=" * 80)

        # Check if we have all required data
        required = ["brand", "model", "condition", "name", "phone", "email"]
        has_all = all(f in checklist_state.collected_data for f in required)

        if has_all or checklist_state.is_complete():
            logger.warning("[auto-submit] 🚀 SUBMITTING NOW!")

            try:
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        f"{api_base_url}/api/tradein/submit",
                        json={"sessionId": session_id, "notify": True},
                        headers=headers,
                        timeout=10.0,
                    )

                    if response.status_code >= 400:
                        logger.error(
                            f"[auto-submit] ❌ Failed: {response.status_code} - {response.text}"
                        )
                    else:
                        result = response.json()
                        logger.warning(f"[auto-submit] ✅ SUCCESS: {result}")
                        logger.warning(
                            f"[auto-submit] Email sent: {result.get('emailSent', False)}"
                        )

            except Exception as e:
                logger.error(f"[auto-submit] ❌ Exception: {e}")
        else:
            missing = [f for f in required if f not in checklist_state.collected_data]
            logger.warning(f"[auto-submit] ⚠️ Missing: {missing}")
