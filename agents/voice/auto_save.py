"""
Auto-save system for voice trade-in agent.
This Python code handles ALL data extraction and saving,
removing reliance on LLM tool calls.
"""

import json
import logging
import os
import re
import time
from typing import Any, Dict, Optional, List, Union

import httpx

logger = logging.getLogger("agent-amara")

# Price grid caching (fetched from API, cached for 5 minutes)
PRICE_GRID = None
PRICE_GRID_LAST_FETCH = 0
PRICE_GRID_CACHE_TTL = 300  # 5 minutes

# API endpoint for price grid (production app serves this)
API_BASE_URL = (
    os.getenv("API_BASE_URL")
    or os.getenv("NEXT_PUBLIC_API_URL")
    or "https://trade.rezult.co"
)
PRICE_GRID_API = f"{API_BASE_URL}/api/pricing/grid"


def load_price_grid():
    """
    Load the trade-in price grid from API with caching.
    Falls back to local JSON file if API is unavailable.
    Cache refreshes every 5 minutes to get latest prices.
    """
    global PRICE_GRID, PRICE_GRID_LAST_FETCH

    # Return cached version if still fresh
    now = time.time()
    if PRICE_GRID is not None and (now - PRICE_GRID_LAST_FETCH) < PRICE_GRID_CACHE_TTL:
        return PRICE_GRID

    # Try to fetch from API first (synchronous call)
    try:
        with httpx.Client() as client:
            response = client.get(PRICE_GRID_API, timeout=5.0)
            if response.status_code == 200:
                PRICE_GRID = response.json()
                PRICE_GRID_LAST_FETCH = now
                logger.info(
                    f"[PriceGrid] ✅ Fetched from API v{PRICE_GRID.get('version', 'unknown')}"
                )
                return PRICE_GRID
            else:
                logger.warning(
                    f"[PriceGrid] API returned {response.status_code}, falling back to local file"
                )
    except Exception as e:
        logger.warning(f"[PriceGrid] API fetch failed: {e}, falling back to local file")

    # Fallback: Load from local JSON file
    price_grid_path = os.path.join(
        os.path.dirname(__file__), "trade_in_prices_2025.json"
    )
    if not os.path.exists(price_grid_path):
        price_grid_path = os.path.join(
            os.path.dirname(__file__), "../../data/trade_in_prices_2025.json"
        )

    try:
        with open(price_grid_path, "r", encoding="utf-8") as f:
            PRICE_GRID = json.load(f)
            PRICE_GRID_LAST_FETCH = now
            logger.info(
                f"[PriceGrid] ✅ Loaded from file v{PRICE_GRID.get('version', 'unknown')}"
            )
            return PRICE_GRID
    except Exception as e:
        logger.error(f"[PriceGrid] ❌ Failed to load: {e}")
        return None


def lookup_price(device_name: str, price_type: str = "preowned") -> Optional[float]:
    """
    Look up exact price for a device.
    price_type: 'preowned' (trade-in) or 'brand_new' (retail)
    """
    grid = load_price_grid()
    if not grid:
        return None

    device_lower = device_name.lower()

    # Search all categories
    for category_data in grid.get("categories", {}).values():
        # Check trade-in prices
        if price_type == "preowned":
            prices = category_data.get("preowned_trade_in", {})
        else:
            prices = category_data.get("brand_new_retail", {})

        # Try exact match first (PRIORITY)
        for label, price in prices.items():
            if label.lower() == device_lower:
                # Handle range prices [min, max]
                if isinstance(price, list):
                    return price[0]  # Use minimum
                return float(price)

        # Try fuzzy match (all tokens present AND same token count)
        # This prevents "Switch 2" from matching "Switch Gen 2"
        device_tokens = set(device_lower.split())
        for label, price in prices.items():
            label_tokens = set(label.lower().split())
            label_words = label.lower().split()
            device_words = device_lower.split()

            # All device tokens must be in label AND token counts should be close
            if (
                device_tokens.issubset(label_tokens)
                and abs(len(device_words) - len(label_words)) <= 1
            ):
                if isinstance(price, list):
                    return price[0]
                return float(price)

    logger.warning(f"[PriceGrid] ⚠️ No match for: {device_name}")
    return None


def extract_data_from_message(message: str, checklist_state: Any) -> Dict[str, Any]:
    """
    Smart extraction: parse user messages for trade-in data.
    This runs on EVERY user message to auto-collect data without relying on LLM.
    """
    lower = message.lower()
    extracted = {}

    # Device brand/model detection - for when user mentions devices
    if "brand" not in checklist_state.collected_data or "model" not in checklist_state.collected_data:
        # Common device patterns - ORDER MATTERS! More specific first.
        device_patterns = {
            "asus rog ally": {"brand": "ASUS", "model": "ROG Ally"},
            "rog ally": {"brand": "ASUS", "model": "ROG Ally"},
            "steam deck": {"brand": "Valve", "model": "Steam Deck"},
            "playstation 5": {"brand": "Sony", "model": "PlayStation 5"},
            "ps5": {"brand": "Sony", "model": "PlayStation 5"},
            "playstation 4": {"brand": "Sony", "model": "PlayStation 4"},
            "ps4": {"brand": "Sony", "model": "PlayStation 4"},
            "xbox series x": {"brand": "Microsoft", "model": "Xbox Series X"},
            "xbox series s": {"brand": "Microsoft", "model": "Xbox Series S"},
            "nintendo switch": {"brand": "Nintendo", "model": "Nintendo Switch"},
            "switch 2": {"brand": "Nintendo", "model": "Nintendo Switch 2"},
        }
        
        for pattern, device_info in device_patterns.items():
            if pattern in lower:
                if "brand" not in checklist_state.collected_data:
                    extracted["brand"] = device_info["brand"]
                    logger.warning(f"[auto-extract] 🏷️ Found brand: {device_info['brand']}")
                if "model" not in checklist_state.collected_data:
                    extracted["model"] = device_info["model"]
                    logger.warning(f"[auto-extract] 🎮 Found model: {device_info['model']}")
                break

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

    # Email detection - improved to handle spelled out emails
    email_match = re.search(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", lower)
    if (
        email_match
        and "email" not in checklist_state.collected_data
        and checklist_state.get_current_step() == "email"
    ):
        extracted_email = email_match.group(0)
        extracted_email = extracted_email.replace(" ", "").replace("- ", "").replace("_", "_")
        extracted["contact_email"] = extracted_email
        logger.warning(f"[auto-extract] 📧 Found email: {extracted['contact_email']}")
    
    # Also handle spelled out emails like "bobby underscore denny at hotmail dot com"
    elif (
        checklist_state.get_current_step() == "email"
        and "email" not in checklist_state.collected_data
        and (("at" in lower and "hotmail" in lower) or ("at" in lower and "gmail" in lower))
    ):
        words = message.lower().split()
        email_parts = []
        for word in words:
            if "@" in word or ".com" in word:
                email_parts.append(word)
            elif word in ["underscore", "underscore"]:
                email_parts.append("_")
            elif word in ["at", "@"]:
                email_parts.append("@")
            elif word in ["dot", "."]:
                email_parts.append(".")
        
        if len(email_parts) >= 3:
            spoken_email = "".join(email_parts)
            extracted["contact_email"] = spoken_email
            logger.warning(f"[auto-extract] 📧 Found spoken email: {extracted['contact_email']}")

    # Phone detection (8+ digits) - improved to handle "848 9068" format
    digits_only = re.sub(r"[^\d]", "", message)
    if (
        len(digits_only) >= 8
        and len(digits_only) <= 15
        and "phone" not in checklist_state.collected_data
        and checklist_state.get_current_step() == "phone"
    ):
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

    # Payout method detection
    if "payout" not in checklist_state.collected_data and not checklist_state.is_trade_up:
        payout_keywords = {
            "cash": "cash",
            "paynow": "paynow", 
            "pay now": "paynow",
            "bank": "bank",
            "transfer": "bank",
            "installment": "installment",
            "instalment": "installment",
            "payment plan": "installment",
        }
        
        for keyword, payout in payout_keywords.items():
            if keyword in lower:
                extracted["payout"] = payout
                logger.warning(f"[auto-extract] 💰 Found payout: {payout}")
                break

    # Name detection - only when we're explicitly on the name step
    if (
        "name" not in checklist_state.collected_data
        and checklist_state.get_current_step() == "name"
    ):
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
            "hotmail",
            "gmail",
            "yahoo",
            ".com",
            ".sg",
        ]
        has_skip = any(keyword in lower for keyword in skip_keywords)

        # Skip if it's mostly numbers (likely phone/storage)
        digit_ratio = len(re.sub(r"[^\d]", "", message)) / max(len(message), 1)

        if not has_skip and digit_ratio < 0.3:
            words = message.split()

            # Pattern 1: "First Name" + "Family name" + "Last Name"
            if "family name" in lower or "last name" in lower:
                name_parts = []
                for i, word in enumerate(words):
                    if word.lower() in ["family", "last"] and i + 1 < len(words):
                        if i > 0:
                            first_name = " ".join(words[:i]).strip()
                            last_name = words[i + 1].strip().rstrip(".,!?")
                            if first_name and last_name:
                                name_parts = [first_name, last_name]
                                break

                if name_parts:
                    full_name = " ".join(name_parts)
                    extracted["contact_name"] = full_name
                    logger.warning(
                        f"[auto-extract] 👤 Found name (bulk): {extracted['contact_name']}"
                    )

            # Pattern 2: Simple name extraction for direct responses
            elif len(words) <= 4:
                name = re.sub(r"[.!?]+$", "", message.strip())
                name = re.sub(r"\s*-\s*", "", name)
                if len(name) >= 2:
                    extracted["contact_name"] = name
                    logger.warning(
                        f"[auto-extract] 👤 Found name (direct): {extracted['contact_name']}"
                    )

            # Pattern 3: Skip confirmations like "Yes", "Correct", etc.
            elif lower in [
                "yes",
                "correct",
                "ok",
                "okay",
                "yep",
                "yeah",
                "sure",
                "that's right",
            ]:
                logger.info(f"[auto-extract] ⏭️ Skipping confirmation: {message}")

            # Pattern 4: Extract potential name from mixed input
            elif 2 <= len(words) <= 6:
                name_words = []
                for word in words:
                    word_clean = word.strip(".,!?")
                    if (
                        len(word_clean) >= 2
                        and not word_clean.isdigit()
                        and "@" not in word_clean
                        and not any(char.isdigit() for char in word_clean)
                    ):
                        name_words.append(word_clean)

                if name_words:
                    potential_name = " ".join(name_words[:3])
                    extracted["contact_name"] = potential_name
                    logger.warning(
                        f"[auto-extract] 👤 Found name (mixed): {extracted['contact_name']}"
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
    if "target_device_name" in checklist_state.collected_data:
        data["target_device_name"] = checklist_state.collected_data["target_device_name"]
    for price_field in ["source_price_quoted", "target_price_quoted", "top_up_amount"]:
        if price_field in checklist_state.collected_data:
            data[price_field] = checklist_state.collected_data[price_field]
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


def _alias_candidates(device_name: str) -> list:
    """Generate alias variants to improve matching (Quest 3 / Quest 3S / spacing)."""
    base = device_name.lower().strip()
    aliases = {base}
    aliases.add(base.replace("3s", "3 s"))
    aliases.add(base.replace("3 s", "3s"))
    aliases.add(base.replace("quest 3s", "quest 3"))
    aliases.add(base.replace("quest 3", "quest 3s"))
    return [a for a in aliases if a]


def find_all_variants(device_name: str) -> list:
    """
    Find all variants of a device (different storage, editions, etc.)
    Returns list of {label, trade_in, retail, variant_info}

    IMPORTANT:
    - If exact match exists, return ONLY that match.
    - If user specified storage and exactly one variant matches, return that directly.
    - If multiple variants remain, return them (caller can show options).
    """
    grid = load_price_grid()
    if not grid:
        return []

    # Extract storage token, e.g., 128GB / 256GB / 512GB
    storage_token = None
    m = re.search(r"(\\d+\\s*(gb|tb))", device_name.lower())
    if m:
        storage_token = m.group(1).replace(" ", "")

    variants = []
    exact_match = None

    for candidate in _alias_candidates(device_name):
        device_lower = candidate.lower()

        # Search all categories
        for category_data in grid.get("categories", {}).values():
            preowned = category_data.get("preowned_trade_in", {})
            brand_new = category_data.get("brand_new_retail", {})

            # Find matching devices
            for label, trade_price in preowned.items():
                label_lower = label.lower()

                # Exact match
                if label_lower == device_lower:
                    retail_price = brand_new.get(label)
                    exact_match = {
                        "label": label,
                        "trade_in": trade_price[0]
                        if isinstance(trade_price, list)
                        else trade_price,
                        "retail": retail_price[0]
                        if isinstance(retail_price, list)
                        else retail_price
                        if retail_price
                        else None,
                        "variant_info": "",
                    }
                    continue

                # Fuzzy variant: all tokens of device are in label
                device_tokens = set(device_lower.split())
                label_tokens = set(label_lower.split())
                if device_tokens.issubset(label_tokens):
                    retail_price = brand_new.get(label)
                    variant_info = label_tokens - device_tokens
                    variants.append(
                        {
                            "label": label,
                            "trade_in": trade_price[0]
                            if isinstance(trade_price, list)
                            else trade_price,
                            "retail": retail_price[0]
                            if isinstance(retail_price, list)
                            else retail_price
                            if retail_price
                            else None,
                            "variant_info": " ".join(sorted(variant_info)),
                        }
                    )

    # If exact match found, return ONLY that (no clarification needed)
    if exact_match:
        return [exact_match]

    # If storage was specified and uniquely identifies one variant, return it
    if storage_token and variants:
        storage_filtered = [v for v in variants if storage_token in v["label"].lower()]
        if len(storage_filtered) == 1:
            return storage_filtered
        if storage_filtered:
            variants = storage_filtered

    return variants


def needs_clarification(device_name: str):
    """
    Check if device needs clarification (multiple variants exist).
    Returns clarification question or None.
    """
    variants = find_all_variants(device_name)

    if len(variants) <= 1:
        return None

    logger.warning("=" * 80)
    logger.warning(f"[PythonPricing] ⚠️ MULTIPLE VARIANTS FOUND for: {device_name}")
    for v in variants:
        logger.warning(
            f"  - {v['label']}: Trade ${v['trade_in']}, Retail ${v['retail']}"
        )
    logger.warning("=" * 80)

    # Build smart clarification question based on price range
    prices = [v["trade_in"] for v in variants if v["trade_in"]]
    min_price = min(prices) if prices else 0
    max_price = max(prices) if prices else 0

    # List top 3 most common variants by name
    variant_names = [v["label"] for v in variants[:3]]

    if len(variant_names) == 2:
        options = f"{variant_names[0]} or {variant_names[1]}"
    elif len(variant_names) == 3:
        options = f"{variant_names[0]}, {variant_names[1]}, or {variant_names[2]}"
    else:
        options = ", ".join(variant_names[:2]) + f", or {len(variants) - 2} others"

    # Emphasize price difference if significant
    if max_price - min_price >= 100:
        return f"Which {device_name}? {options}. Price ranges ${int(min_price)}-${int(max_price)}."
    else:
        return f"Which {device_name}? {options}."


def detect_and_fix_trade_up_prices(
    source_device: str, target_device: str
) -> Optional[Dict]:
    """
    Detect trade-up intent and return CORRECT prices from price grid.
    Returns: {trade_value, retail_price, top_up, needs_clarification, clarification_question} or None
    """
    logger.warning("=" * 80)
    logger.warning("[PythonPricing] 🐍 PYTHON TAKING OVER PRICING!")
    logger.warning(f"[PythonPricing] Source: {source_device}")
    logger.warning(f"[PythonPricing] Target: {target_device}")

    # Check if either device needs clarification
    source_clarification = needs_clarification(source_device)
    target_clarification = needs_clarification(target_device)

    if source_clarification or target_clarification:
        logger.warning("[PythonPricing] ⚠️ NEEDS CLARIFICATION!")
        return {
            "needs_clarification": True,
            "source_question": source_clarification,
            "target_question": target_clarification,
        }

    # Look up trade-in value for source device
    trade_value = lookup_price(source_device, "preowned")

    # Look up retail price for target device
    retail_price = lookup_price(target_device, "brand_new")

    if trade_value and retail_price:
        top_up = retail_price - trade_value
        logger.warning(f"[PythonPricing] ✅ Trade-in: ${trade_value}")
        logger.warning(f"[PythonPricing] ✅ Retail: ${retail_price}")
        logger.warning(f"[PythonPricing] ✅ Top-up: ${top_up}")
        logger.warning("=" * 80)

        return {
            "needs_clarification": False,
            "trade_value": trade_value,
            "retail_price": retail_price,
            "top_up": top_up,
        }
    else:
        if not trade_value:
            logger.error(f"[PythonPricing] ❌ No trade-in price for: {source_device}")
        if not retail_price:
            logger.error(f"[PythonPricing] ❌ No retail price for: {target_device}")
        logger.warning("=" * 80)
        return None


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

    applied_fields: List[str] = []

    # Update checklist state only for the fields we're ready to accept
    for field, value in extracted.items():
        if field == "contact_name":
            if checklist_state.can_collect_contact("name"):
                checklist_state.mark_field_collected("name", value)
                applied_fields.append("name")
            else:
                logger.info(
                    "[auto-save] ⏭️ Skipping name until device details complete"
                )
        elif field == "contact_phone":
            if checklist_state.can_collect_contact("phone"):
                checklist_state.mark_field_collected("phone", value)
                applied_fields.append("phone")
            else:
                logger.info(
                    "[auto-save] ⏭️ Skipping phone until name captured"
                )
        elif field == "contact_email":
            if checklist_state.can_collect_contact("email"):
                checklist_state.mark_field_collected("email", value)
                applied_fields.append("email")
            else:
                logger.info(
                    "[auto-save] ⏭️ Skipping email until phone captured"
                )
        elif field == "accessories":
            checklist_state.mark_field_collected("accessories", value)
            applied_fields.append("accessories")
        elif field == "photos_acknowledged":
            checklist_state.mark_field_collected("photos", value)
            applied_fields.append("photos")
        else:
            checklist_state.mark_field_collected(field, value)
            applied_fields.append(field)

    if not applied_fields:
        logger.info("[auto-save] Extracted data not applicable for current step")
        return

    logger.warning(f"[auto-save] 💾 Saving {len(applied_fields)} fields...")
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


def build_smart_acknowledgment(extracted: Dict[str, Any], checklist_state: Any) -> list:
    """
    Build smart acknowledgment messages for extracted data.
    This prevents the agent from asking for already-provided information.
    """
    acknowledgments = []
    
    # Name acknowledgment
    if "contact_name" in extracted:
        name = extracted["contact_name"]
        if name.lower() not in ["yes", "correct", "ok", "okay", "yep", "yeah", "sure"]:
            acknowledgments.append(f"Got your name: {name}")
    
    # Email acknowledgment  
    if "contact_email" in extracted:
        email = extracted["contact_email"]
        if "@" in email:  # Valid email format
            acknowledgments.append(f"Got your email: {email}")
    
    # Phone acknowledgment
    if "contact_phone" in extracted:
        phone = extracted["contact_phone"]
        if len(phone) >= 8:  # Valid phone length
            acknowledgments.append(f"Got your phone: {phone}")
    
    # Device acknowledgment
    if "brand" in extracted or "model" in extracted:
        brand = extracted.get("brand", "")
        model = extracted.get("model", "")
        if brand and model:
            acknowledgments.append(f"Got your device: {brand} {model}")
        elif model:
            acknowledgments.append(f"Got your device: {model}")
    
    # Storage acknowledgment
    if "storage" in extracted:
        storage = extracted["storage"]
        acknowledgments.append(f"Got storage: {storage}")
    
    # Condition acknowledgment
    if "condition" in extracted:
        condition = extracted["condition"]
        acknowledgments.append(f"Got condition: {condition}")
    
    # Payout acknowledgment
    if "payout" in extracted:
        payout = extracted["payout"]
        acknowledgments.append(f"Got payout preference: {payout}")
    
    return acknowledgments
