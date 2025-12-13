"""
TradeZone Voice Agent - LiveKit Integration
Calls existing Next.js APIs to keep logic in sync with text chat
"""

import asyncio
import json
import logging
import os
import re
from datetime import datetime
from typing import Any, Dict, Optional, Annotated

import httpx
from pydantic import Field

# Import auto-save system
from auto_save import (
    auto_save_after_message,
    build_smart_acknowledgment,
    check_for_confirmation_and_submit,
    detect_and_fix_trade_up_prices,
    extract_data_from_message,
    force_save_to_db,
)
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    RunContext,
    cli,
    function_tool,
    get_job_context,
    inference,
    room_io,
)
from livekit.plugins import noise_cancellation, openai, silero
from livekit.plugins.openai import realtime

logger = logging.getLogger("agent-amara")

load_dotenv(".env.local")

# Next.js API base URL (default to production; override via env for local dev/tests)
API_BASE_URL = (
    os.getenv("NEXT_PUBLIC_API_URL")
    or os.getenv("API_BASE_URL")
    or "https://trade.rezult.co"
)
API_KEY = os.getenv("CHATKIT_API_KEY", "")

# LLM tuning (allow env overrides for latency/accuracy trade-offs)
LLM_MODEL = os.getenv("VOICE_LLM_MODEL", "openai/gpt-4.1-mini")
LLM_TEMPERATURE = float(os.getenv("VOICE_LLM_TEMPERATURE", "0.2"))

# Voice stack selector: "realtime" uses OpenAI Realtime API; "classic" uses STT+LLM+TTS stack
VOICE_STACK = os.getenv("VOICE_STACK", "classic").lower()

logger.info(f"[Voice Agent] API_BASE_URL = {API_BASE_URL}")
logger.info(
    f"[Voice Agent] 🔥 AUTO-SAVE SYSTEM ACTIVE - Data extraction and save happens automatically"
)

if not API_KEY:
    logger.warning(
        "[Voice Agent] CHATKIT_API_KEY is missing — API calls will be rejected"
    )
else:
    logger.info(f"[Voice Agent] CHATKIT_API_KEY prefix = {API_KEY[:8]}")

# Session-scoped checklist states (keyed by LiveKit room/session id)
_checklist_states: Dict[str, "TradeInChecklistState"] = {}
# Session → leadId cache to keep a single lead per call
_lead_ids: Dict[str, str] = {}
# Session → trade-up context (target device + pricing)
_tradeup_context: Dict[str, Dict[str, Any]] = {}

VALID_PAYOUT_VALUES = {"cash", "paynow", "bank", "installment"}
PAYOUT_NORMALIZATION_MAP = {
    "cash": "cash",
    "cash payout": "cash",
    "cash payment": "cash",
    "paynow": "paynow",
    "pay now": "paynow",
    "pay-now": "paynow",
    "bank": "bank",
    "bank transfer": "bank",
    "bank account": "bank",
    "wire transfer": "bank",
    "installment": "installment",
    "installments": "installment",
    "instalment": "installment",
    "instalments": "installment",
    "installment plan": "installment",
    "installment plans": "installment",
    "payment plan": "installment",
    "payment plans": "installment",
    "monthly plan": "installment",
    "monthly installment": "installment",
}
PAYOUT_KEYWORD_FALLBACKS = (
    ("cash", "cash"),
    ("pay now", "paynow"),
    ("paynow", "paynow"),
    ("bank transfer", "bank"),
    ("bank account", "bank"),
    ("wire transfer", "bank"),
    ("bank", "bank"),
    ("installment", "installment"),
    ("instalment", "installment"),
    ("payment plan", "installment"),
    ("monthly", "installment"),
)
UNSUPPORTED_PAYOUT_KEYWORDS = ("top up", "topup", "top-up")


def normalize_payout_value(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None

    normalized = raw.strip().lower()
    normalized = normalized.replace("-", " ")
    normalized = normalized.replace("_", " ")
    normalized = " ".join(normalized.split())

    mapped = PAYOUT_NORMALIZATION_MAP.get(normalized)
    if mapped:
        normalized = mapped
    else:
        for keyword, target in PAYOUT_KEYWORD_FALLBACKS:
            if keyword in normalized:
                normalized = target
                break

    for keyword in UNSUPPORTED_PAYOUT_KEYWORDS:
        if keyword in normalized:
            return None

    return normalized if normalized in VALID_PAYOUT_VALUES else None


def _infer_brand_from_device_name(device_name: Optional[str]) -> Optional[str]:
    if not device_name or not isinstance(device_name, str):
        return None
    lower = device_name.lower()
    if "iphone" in lower or "ipad" in lower or "macbook" in lower:
        return "Apple"
    if "switch" in lower:
        return "Nintendo"
    if "playstation" in lower or lower.startswith("ps"):
        return "Sony"
    if "xbox" in lower:
        return "Microsoft"
    return None


async def _persist_quote_flag(session_id: str, quote_timestamp: Optional[str]) -> None:
    try:
        await _ensure_tradein_lead_for_session(session_id)
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{API_BASE_URL}/api/tradein/update",
                json={
                    "sessionId": session_id,
                    "leadId": _lead_ids.get(session_id),
                    "initial_quote_given": True,
                    "quote_timestamp": quote_timestamp,
                },
                headers=build_auth_headers(),
                timeout=10.0,
            )
            if response.status_code >= 400:
                logger.error(
                    f"[QuoteState] ❌ Failed to persist quote flag: {response.status_code} {response.text}"
                )
    except Exception as e:
        logger.error(f"[QuoteState] ❌ Persist failed: {e}")


async def _async_generate_reply(
    session: AgentSession, instructions: str, allow_interruptions: bool = True
) -> None:
    try:
        await session.generate_reply(
            instructions=instructions,
            allow_interruptions=allow_interruptions,
        )
    except Exception as e:
        logger.error(f"[VoiceReply] ❌ Failed to generate reply: {e}")


def _get_checklist(session_id: str) -> "TradeInChecklistState":
    """Get or create checklist state for a specific session"""
    state = _checklist_states.get(session_id)
    if state is None:
        state = TradeInChecklistState()
        _checklist_states[session_id] = state
        logger.info(f"[checklist] 🆕 Initialized checklist for session {session_id}")
        logger.info(f"[checklist] 📊 Total active sessions: {len(_checklist_states)}")
    else:
        logger.debug(
            f"[checklist] ♻️ Reusing existing checklist for session {session_id}"
        )
    return state


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================


def build_auth_headers() -> Dict[str, str]:
    """
    Standard auth headers for all server-to-server calls.
    Use both X-API-Key and Bearer to stay compatible with dashboard handlers.
    """
    headers: Dict[str, str] = {}
    if API_KEY:
        headers["X-API-Key"] = API_KEY
        headers["Authorization"] = f"Bearer {API_KEY}"
    return headers


def _is_valid_contact_name(name: Optional[str]) -> bool:
    if not name or not isinstance(name, str):
        return False
    trimmed = name.strip()
    if len(trimmed) < 2 or len(trimmed) > 80:
        return False
    # Only allow basic ASCII name chars to avoid garbled STT tokens corrupting the lead
    allowed = re.fullmatch(r"[A-Za-z][A-Za-z\s'\-\.]{0,79}", trimmed)
    if not allowed:
        return False
    # Require at least 2 letters
    letters = re.sub(r"[^A-Za-z]", "", trimmed)
    return len(letters) >= 2


async def _ensure_tradein_lead_for_session(session_id: str) -> Optional[str]:
    if not session_id:
        return None
    if session_id in _lead_ids:
        return _lead_ids.get(session_id)

    headers = build_auth_headers()
    if not headers:
        logger.warning("[tradein_start] ⚠️ Missing auth headers; cannot ensure lead")
        return None

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{API_BASE_URL}/api/tradein/start",
                json={"sessionId": session_id},
                headers=headers,
                timeout=10.0,
            )
            if response.status_code >= 400:
                logger.error(
                    f"[tradein_start] ❌ {response.status_code}: {response.text}"
                )
                return None
            result = response.json() if response.content else {}
            lead_id = result.get("leadId") or result.get("lead", {}).get("id")
            if lead_id:
                _lead_ids[session_id] = lead_id
                logger.info(
                    f"[tradein_start] 📌 Cached leadId for session {session_id}: {lead_id}"
                )
            return lead_id
        except Exception as e:
            logger.error(f"[tradein_start] ❌ Exception: {e}")
            return None


async def log_to_dashboard(
    user_id: str, user_message: str, bot_response: str, session_id: str = None
):
    """Log voice conversation to dashboard via livekit chat-log endpoint"""
    try:
        headers = build_auth_headers()
        if not headers:
            logger.error("[Dashboard] ❌ CHATKIT_API_KEY missing — cannot log chat")
            return

        async with httpx.AsyncClient() as client:
            payload = {
                "session_id": session_id,
                "user_message": user_message,
                "agent_message": bot_response,
                "room_name": session_id,
                "participant_identity": user_id,
            }
            response = await client.post(
                f"{API_BASE_URL}/api/livekit/chat-log",
                json=payload,
                headers=headers,
                timeout=5.0,
            )
            if response.status_code >= 300:
                logger.error(
                    f"[Dashboard] ❌ Failed to log turn ({response.status_code}): {response.text}"
                )
            else:
                logger.info(
                    f"[Dashboard] ✅ Logged to chat_logs: {response.status_code}"
                )
    except Exception as e:
        logger.error(f"[Dashboard] ❌ Failed to log: {e}")


# ============================================================================
# TOOL FUNCTIONS (must have RunContext as first parameter)
# ============================================================================


@function_tool
async def searchProducts(context: RunContext, query: str) -> str:
    """Search TradeZone product catalog using vector database. Handles both regular products and trade-in pricing."""
    logger.warning(f"[searchProducts] ⚠️ CALLED with query: {query}")

    # 🔒 BLOCK product listings during trade-up pricing (only return price text)
    is_trade_pricing = any(
        keyword in query.lower()
        for keyword in ["trade-in", "trade in", "tradein", "buy price", "trade price"]
    )
    if is_trade_pricing:
        logger.info(
            f"[searchProducts] 🔒 Trade pricing query detected - will skip product cards"
        )
    headers = build_auth_headers()

    async with httpx.AsyncClient() as client:
        try:
            # Use /api/tools/search which now uses handleVectorSearch (same as text chat)
            response = await client.post(
                f"{API_BASE_URL}/api/tools/search",
                json={"query": query, "context": "catalog"},
                headers=headers,
                timeout=30.0,
            )
            result = response.json()
            logger.warning(f"[searchProducts] API response: {response.status_code}")

            if result.get("success"):
                answer = result.get("result", "")
                products_data = result.get("products", [])

                # Send structured product data to widget for visual display
                # 🔒 SKIP product cards during trade pricing (only show price text)
                if products_data and not is_trade_pricing:
                    try:
                        room = get_job_context().room
                        await room.local_participant.publish_data(
                            json.dumps(
                                {
                                    "type": "product_results",
                                    "tool": "searchProducts",
                                    "query": query,
                                    "products": products_data,
                                }
                            ).encode("utf-8"),
                            topic="tool-results",
                        )
                        logger.info(
                            f"[searchProducts] Sent {len(products_data)} products to widget"
                        )
                    except Exception as e:
                        logger.error(
                            f"[searchProducts] Failed to send visual data: {e}"
                        )
                elif is_trade_pricing:
                    logger.info(
                        f"[searchProducts] 🔒 Skipped sending {len(products_data) if products_data else 0} product cards (trade pricing mode)"
                    )

                logger.warning(f"[searchProducts] ✅ Returning: {answer[:200]}")
                return answer if answer else "No products found"
            else:
                logger.error(f"[searchProducts] ❌ API failed: {result}")
                return "No products found"
        except Exception as e:
            logger.error(f"[searchProducts] ❌ Exception: {e}")
            return "Sorry, I couldn't search products right now"


@function_tool
async def searchtool(context: RunContext, query: str) -> str:
    """Search TradeZone website for general information."""
    logger.info(f"[searchtool] CALLED with query: {query}")
    headers = build_auth_headers()
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{API_BASE_URL}/api/tools/search",
                json={"query": query, "context": "website"},
                headers=headers,
                timeout=30.0,
            )
            result = response.json()
            logger.info(f"[searchtool] API response: {result}")
            return result.get("result", "No information found")
        except Exception as e:
            logger.error(f"[searchtool] ❌ Exception: {e}")
            return "Sorry, I couldn't find that information"


@function_tool
async def check_tradein_price(
    context: RunContext,
    device_name: str,
) -> str:
    """
    Quick price check: Get trade-in value for a device WITHOUT starting the full workflow.
    Use this when customer asks "What can I get for my [device]?" or "How much is my [device] worth?"
    Returns ONLY the trade-in value - does NOT start data collection or trade-up flow.
    """
    logger.warning(f"[check_tradein_price] 🔍 PRICE CHECK for: {device_name}")

    from auto_save import lookup_price, needs_clarification

    # Check if we need clarification for variants
    clarification = needs_clarification(device_name)
    if clarification:
        return clarification

    # Get trade-in price
    price = lookup_price(device_name, "preowned")
    if price:
        # Voice-safe wording: avoid reading currency symbols awkwardly
        price_int = int(price)
        logger.info(f"[check_tradein_price] ✅ Found: ${price_int}")
        return (
            f"Your {device_name} is worth about {price_int} Singapore dollars for trade-in. "
            f"(Shown as S${price_int}.) Want to start a trade-in?"
        )
    else:
        logger.warning(f"[check_tradein_price] ⚠️ No price found for: {device_name}")
        return (
            f"I couldn't find a trade-in price for {device_name}. "
            f"Want me to connect you to staff to check it?"
        )


@function_tool
async def calculate_tradeup_pricing(
    context: RunContext,
    source_device: str,
    target_device: str,
) -> str:
    """
    Calculate trade-up pricing (trade Device A for Device B) and START the full workflow.
    Use this ONLY when customer explicitly wants to TRADE IN their device for another device.
    Returns: trade-in value, retail price, and top-up amount.
    Handles variant detection and clarification questions automatically.
    """
    logger.warning(
        f"[calculate_tradeup_pricing] 🐍 PYTHON PRICING with: source={source_device}, target={target_device}"
    )

    # Guard: both devices are required; avoid starting flow without confirmation
    if not source_device or not target_device:
        return f"To calculate trade-up, I need both devices. What are you trading your {source_device or 'device'} for?"

    try:
        # Use Python-based pricing system (bypasses text chat API)
        result = detect_and_fix_trade_up_prices(source_device, target_device)

        if not result:
            logger.error(
                f"[calculate_tradeup_pricing] ❌ No pricing found for: {source_device} → {target_device}"
            )
            return f"Sorry, I couldn't find pricing for {source_device} or {target_device}. Please provide the exact model."

        # Check if clarification is needed
        if result.get("needs_clarification"):
            source_q = result.get("source_question")
            target_q = result.get("target_question")

            try:
                room = get_job_context().room
                session_id = room.name
            except Exception:
                session_id = None

            if session_id:
                _tradeup_context[session_id] = {
                    "source_device": source_device,
                    "target_device": target_device,
                    "pending_clarification": True,
                    "needs_source": bool(source_q),
                    "needs_target": bool(target_q),
                }
                logger.warning(
                    "[calculate_tradeup_pricing] ⚠️ Pending clarification stored for session %s (needs_source=%s needs_target=%s)",
                    session_id,
                    bool(source_q),
                    bool(target_q),
                )

            suffix = " 🚨 SYSTEM RULE: After the user answers, you MUST call calculate_tradeup_pricing again with the clarified device name(s) BEFORE asking 'Want to proceed?'."

            if source_q and target_q:
                return f"{source_q} Also, {target_q}{suffix}"
            elif source_q:
                return f"{source_q}{suffix}"
            elif target_q:
                return f"{target_q}{suffix}"

        # Return pricing if available
        trade_value = result.get("trade_value")
        retail_price = result.get("retail_price")
        top_up = result.get("top_up")

        if trade_value and retail_price and top_up:
            logger.info(
                f"[calculate_tradeup_pricing] ✅ Python pricing: Trade ${trade_value}, Retail ${retail_price}, Top-up ${top_up}"
            )

            # Cache trade-up context so subsequent tool calls always include target info
            try:
                room = get_job_context().room
                session_id = room.name
            except Exception:
                session_id = None

            next_question = "Storage size?"
            if session_id:
                existing_ctx = _tradeup_context.get(session_id)
                if existing_ctx:
                    prev_source = (existing_ctx.get("source_device") or "").strip().lower()
                    prev_target = (existing_ctx.get("target_device") or "").strip().lower()
                    next_source = (source_device or "").strip().lower()
                    next_target = (target_device or "").strip().lower()
                    if prev_source != next_source or prev_target != next_target:
                        state = _get_checklist(session_id)
                        if state.current_step_index == 0 and not state.collected_data:
                            _checklist_states[session_id] = TradeInChecklistState()
                            _lead_ids.pop(session_id, None)
                            logger.info(
                                "[checklist] 🔄 New trade detected at start — reset checklist and lead cache"
                            )
                        else:
                            logger.warning(
                                "[checklist] 🚫 Trade change ignored mid-flow (session=%s step=%s). Keep same trade unless user cancels.",
                                session_id,
                                state.get_current_step(),
                            )

                _tradeup_context[session_id] = {
                    "source_device": source_device,
                    "target_device": target_device,
                    "trade_value": trade_value,
                    "retail_price": retail_price,
                    "top_up": top_up,
                    "pending_clarification": False,
                }
                state = _get_checklist(session_id)
                state.mark_trade_up()
                state.collected_data["source_device_name"] = source_device
                state.collected_data["target_device_name"] = target_device
                state.collected_data["source_price_quoted"] = trade_value
                state.collected_data["target_price_quoted"] = retail_price
                state.collected_data["top_up_amount"] = top_up

                inferred_brand = _infer_brand_from_device_name(source_device)
                if inferred_brand:
                    state.collected_data["brand"] = inferred_brand
                state.collected_data["model"] = source_device

                # Switch consoles do not have a meaningful storage choice in this flow
                lower_source = (source_device or "").lower()
                lower_target = (target_device or "").lower()
                if "switch" in lower_source or "switch" in lower_target:
                    state.mark_no_storage()

                next_question = state.get_next_question() or next_question

            return (
                f"Your {source_device} trades for S${int(trade_value)}. "
                f"The {target_device} is S${int(retail_price)}. "
                f"Top-up: S${int(top_up)}. Want to proceed? "
                f"🚨 SYSTEM RULE: If user says yes, ask ONLY '{next_question}' next."
            )

        logger.error(f"[calculate_tradeup_pricing] ⚠️ Incomplete pricing data: {result}")
        return "Unable to calculate complete pricing. Please verify the device models."

    except Exception as e:
        logger.error(f"[calculate_tradeup_pricing] ❌ Exception: {e}")
        return "Pricing calculation unavailable. Please provide device details."


async def _tradein_update_lead_impl(
    context: RunContext,
    category: Optional[str] = None,
    brand: Optional[str] = None,
    model: Optional[str] = None,
    storage: Optional[str] = None,
    condition: Optional[str] = None,
    contact_name: Optional[str] = None,
    contact_phone: Optional[str] = None,
    contact_email: Optional[str] = None,
    preferred_payout: Optional[str] = None,
    notes: Optional[str] = None,
    target_device_name: str = "",
    photos_acknowledged: Optional[bool] = None,
    source_price_quoted: Optional[float] = None,
    target_price_quoted: Optional[float] = None,
    top_up_amount: Optional[float] = None,
) -> str:
    """Update trade-in lead information. Call this IMMEDIATELY after user provides ANY trade-in details."""

    logger.warning(
        f"[tradein_update_lead] ⚠️ CALLED with: model={model}, storage={storage}, condition={condition}, name={contact_name}, phone={contact_phone}, email={contact_email}"
    )
    headers = build_auth_headers()

    # Get session ID from room name
    try:
        room = get_job_context().room
        session_id = room.name
        logger.info(f"[tradein_update_lead] Session ID from room: {session_id}")
    except Exception as e:
        logger.error(f"[tradein_update_lead] Failed to get room: {e}")
        session_id = None

    if not session_id:
        logger.error("[tradein_update_lead] ❌ No session_id available!")
        return "Failed to save details - session not found. Please try again."

    # Use per-session checklist state
    state = _get_checklist(session_id)

    if contact_name and "name" in state.collected_data:
        existing_name = str(state.collected_data.get("name") or "").strip()
        existing_ok = _is_valid_contact_name(existing_name)
        incoming_ok = _is_valid_contact_name(contact_name)
        if existing_ok and incoming_ok and existing_name.lower() != str(contact_name).strip().lower():
            logger.warning(
                "[tradein_update_lead] ⚠️ Ignoring new contact_name (already collected): existing=%s new=%s",
                existing_name,
                contact_name,
            )
            contact_name = None
        elif (not existing_ok) and incoming_ok:
            logger.warning(
                "[tradein_update_lead] ✅ Replacing invalid existing contact_name: existing=%s new=%s",
                existing_name,
                contact_name,
            )
    if contact_phone and "phone" in state.collected_data:
        existing_phone = str(state.collected_data.get("phone") or "").strip()
        if existing_phone and existing_phone != str(contact_phone).strip():
            logger.warning(
                "[tradein_update_lead] ⚠️ Ignoring new contact_phone (already collected): existing=%s new=%s",
                existing_phone,
                contact_phone,
            )
            contact_phone = None
    if contact_email and "email" in state.collected_data:
        existing_email = str(state.collected_data.get("email") or "").strip()
        if existing_email and existing_email.lower() != str(contact_email).strip().lower():
            logger.warning(
                "[tradein_update_lead] ⚠️ Ignoring new contact_email (already collected): existing=%s new=%s",
                existing_email,
                contact_email,
            )
            contact_email = None

    # Normalize empty string back to None so payload doesn't write empties
    if isinstance(target_device_name, str) and not target_device_name.strip():
        target_device_name = None

    # Enrich with cached trade-up context if available
    context_data = _tradeup_context.get(session_id)
    if context_data:
        if target_device_name is None:
            target_device_name = context_data.get("target_device")
        if source_price_quoted is None:
            source_price_quoted = context_data.get("trade_value")
        if target_price_quoted is None:
            target_price_quoted = context_data.get("retail_price")
        if top_up_amount is None:
            top_up_amount = context_data.get("top_up")
        state.mark_trade_up()
        if target_device_name:
            state.collected_data.setdefault("target_device_name", target_device_name)
        if source_price_quoted is not None:
            state.collected_data.setdefault("source_price_quoted", source_price_quoted)
        if target_price_quoted is not None:
            state.collected_data.setdefault("target_price_quoted", target_price_quoted)
        if top_up_amount is not None:
            state.collected_data.setdefault("top_up_amount", top_up_amount)

    # Auto-detect if device has no storage based on category
    if category:
        no_storage_categories = [
            "camera",
            "accessory",
            "accessories",
            "controller",
            "headset",
            "monitor",
            "tv",
            "watch",
        ]
        if category.lower() in no_storage_categories:
            state.mark_no_storage()

    # Also check model name for clues
    if model:
        model_lower = model.lower()

        # Check if it's a device type that doesn't have storage
        if not category:
            no_storage_keywords = [
                "camera",
                "controller",
                "headset",
                "headphone",
                "speaker",
                "monitor",
                "watch",
                "cable",
            ]
            if any(keyword in model_lower for keyword in no_storage_keywords):
                state.mark_no_storage()

        # Check if storage is already specified in the model name (e.g., "Steam Deck 512GB")
        import re

        storage_pattern = r"\\b(\\d+\\s*(gb|tb|mb))\\b"
        if re.search(storage_pattern, model_lower):
            logger.info(
                f"[tradein_update_lead] 💾 Storage detected in model name: {model}"
            )
            # Mark storage as already collected so we skip asking
            state.mark_field_collected("storage", "specified_in_model")

    # 🔒 ENFORCE state machine order - validate that we're collecting the right field
    current_step = state.get_current_step()

    # Map parameters to step names
    field_step_mapping = {
        "storage": "storage",
        "condition": "condition",
        "notes": "accessories",  # notes containing box/accessories info
        "photos_acknowledged": "photos",
        "contact_name": "name",
        "contact_phone": "phone",
        "contact_email": "email",
    }

    # Normalize common string inputs first so validation uses sanitized values
    def _strip(value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        return value or None

    category = _strip(category)
    brand = _strip(brand)
    model = _strip(model)
    storage = _strip(storage)
    condition = _strip(condition)
    notes = _strip(notes)

    raw_preferred_payout = _strip(preferred_payout)
    preferred_payout = normalize_payout_value(raw_preferred_payout)
    if raw_preferred_payout and not preferred_payout:
        logger.warning(
            f"[tradein_update_lead] ⚠️ Dropping unsupported payout value: {raw_preferred_payout}"
        )

    # Check if any field is being set that's not the current step
    fields_being_set = []
    if storage:
        fields_being_set.append("storage")
    if condition:
        fields_being_set.append("condition")
    notes_lower = notes.lower() if notes else ""
    if notes and ("box" in notes_lower or "accessories" in notes_lower):
        fields_being_set.append("accessories")
    if photos_acknowledged is not None:
        fields_being_set.append("photos")
    if contact_name:
        fields_being_set.append("name")
    if contact_phone:
        fields_being_set.append("phone")
    if contact_email:
        fields_being_set.append("email")
    if preferred_payout:
        fields_being_set.append("payout")

    # Allow setting multiple fields on first call (when model/brand/category are provided)
    # But after initialization, ONLY allow current step
    if state.current_step_index > 0:
        for field in fields_being_set:
            if field != current_step and field not in state.collected_data:
                logger.warning(
                    f"[tradein_update_lead] ⚠️ BLOCKED: Trying to set '{field}' but current step is '{current_step}'. Ignoring out-of-order field."
                )
                # Don't block the whole call, just skip the out-of-order field
                if field == "storage":
                    storage = None
                elif field == "condition":
                    condition = None
                elif field == "accessories":
                    notes = None
                elif field == "photos":
                    photos_acknowledged = None
                elif field == "name":
                    contact_name = None
                elif field == "phone":
                    contact_phone = None
                elif field == "email":
                    contact_email = None
                elif field == "payout":
                    preferred_payout = None

    # Work out whether contact info can be saved AFTER this payload
    storage_in_payload = bool(storage)
    condition_in_payload = bool(condition)
    accessories_in_payload = bool(
        notes and ("box" in notes.lower() or "accessories" in notes.lower())
    )
    photos_in_payload = photos_acknowledged is not None

    will_have_storage = (
        storage_in_payload or "storage" in state.collected_data or state.skip_storage
    )
    will_have_condition = condition_in_payload or "condition" in state.collected_data
    will_have_accessories = (
        accessories_in_payload or "accessories" in state.collected_data
    )
    will_have_photos = photos_in_payload or "photos" in state.collected_data

    # NEW FLOW: contact comes after storage + accessories (box).
    # Condition/payout can be asked later before recap/submit.
    ready_after_payload = will_have_storage and will_have_accessories

    blocked_contact_fields = []

    def _contact_allowed(field_name: str) -> bool:
        return ready_after_payload or field_name in state.collected_data

    if contact_name and not _contact_allowed("name"):
        blocked_contact_fields.append("name")
        contact_name = None
    if contact_phone and not _contact_allowed("phone"):
        blocked_contact_fields.append("phone")
        contact_phone = None
    if contact_email and not _contact_allowed("email"):
        blocked_contact_fields.append("email")
        contact_email = None

    # Detect trade-up (target device present) → do NOT send payout (enum mismatch in API)
    inferred_payout = preferred_payout
    if target_device_name:
        inferred_payout = None
        state.is_trade_up = True
        logger.info(
            "[tradein_update_lead] 🔄 Detected trade-up, skipping payout step (no payout field sent)"
        )

    async with httpx.AsyncClient() as client:
        try:
            data = {
                k: v
                for k, v in {
                    # API expects camelCase sessionId (not session_id)
                    "sessionId": session_id,
                    "leadId": _lead_ids.get(session_id),
                    "category": category,
                    "brand": brand,
                    "model": model,
                    "storage": storage,
                    "condition": condition,
                    "contact_name": contact_name,
                    "contact_phone": contact_phone,
                    "contact_email": contact_email,
                    "preferred_payout": inferred_payout,
                    "notes": notes,
                    "target_device_name": target_device_name,
                    "source_price_quoted": source_price_quoted,
                    "target_price_quoted": target_price_quoted,
                    "top_up_amount": top_up_amount,
                }.items()
                if v is not None
            }

            response = await client.post(
                f"{API_BASE_URL}/api/tradein/update",
                json=data,
                headers=headers,
                timeout=10.0,
            )
            if response.status_code >= 400:
                logger.error(
                    f"[tradein_update_lead] ❌ {response.status_code}: {response.text}"
                )
                return f"Failed to save info ({response.status_code})"
            result = response.json()
            logger.info(f"[tradein_update_lead] ✅ Response: {result}")

            # Cache leadId for this session so all subsequent saves/uploads use the same lead
            lead_id = result.get("lead", {}).get("id")
            if lead_id:
                _lead_ids[session_id] = lead_id
                logger.info(
                    f"[tradein_update_lead] 📌 Cached leadId for session {session_id}: {lead_id}"
                )

            # Track state: mark fields as collected
            if storage:
                state.mark_field_collected("storage", storage)
            if condition:
                state.mark_field_collected("condition", condition)
            if notes and ("accessories" in notes.lower() or "box" in notes.lower()):
                state.mark_field_collected("accessories", True)
            if photos_acknowledged is not None:
                state.mark_field_collected("photos", photos_acknowledged)
            if contact_name:
                state.mark_field_collected("name", contact_name)
            if contact_phone:
                state.mark_field_collected("phone", contact_phone)
            if contact_email:
                state.mark_field_collected("email", contact_email)
            if inferred_payout:
                state.mark_field_collected("payout", inferred_payout)
            if target_device_name:
                state.collected_data["target_device_name"] = target_device_name
            if source_price_quoted is not None:
                state.collected_data["source_price_quoted"] = source_price_quoted
            if target_price_quoted is not None:
                state.collected_data["target_price_quoted"] = target_price_quoted
            if top_up_amount is not None:
                state.collected_data["top_up_amount"] = top_up_amount

            # Return the next required question with STRICT enforcement
            next_question = state.get_next_question()
            current_step = state.get_current_step()
            logger.info(
                f"[tradein_update_lead] 📋 Current step: {current_step}, Next question: {next_question}"
            )

            if blocked_contact_fields:
                blocked_fields = ", ".join(blocked_contact_fields)
                missing_parts = []
                if "storage" not in state.collected_data and not state.skip_storage:
                    missing_parts.append("storage")
                if "condition" not in state.collected_data:
                    missing_parts.append("condition")
                if "accessories" not in state.collected_data:
                    missing_parts.append("accessories")
                if "photos" not in state.collected_data:
                    missing_parts.append("photos")

                missing_text = (
                    ", ".join(missing_parts) if missing_parts else "device details"
                )
                logger.warning(
                    f"[tradein_update_lead] 🚨 BLOCKED out-of-order contact collection: {blocked_fields}"
                )
                return (
                    f"⚠️ CRITICAL DATA LOSS WARNING: Contact information ({blocked_fields}) was NOT saved because {missing_text} are incomplete. "
                    f"You MUST finish those steps first. Current step: {current_step}. 🚨 SYSTEM RULE: Ask ONLY '{next_question}' next."
                )

            # 🔒 FORCE the exact next question - LLM MUST ask this and ONLY this
            if next_question == "recap":
                return "✅ Information saved. 🚨 SYSTEM RULE: You MUST now display the complete trade-in summary and ask for confirmation. DO NOT ask any other questions."
            elif next_question == "submit":
                return "✅ All information collected. 🚨 SYSTEM RULE: You MUST call tradein_submit_lead now. DO NOT ask any more questions."
            else:
                # List all fields we're still waiting for to prevent skipping
                remaining_steps = state.STEPS[state.current_step_index :]
                return f"✅ Saved. 🚨 SYSTEM RULE: You MUST ask ONLY '{next_question}' next. DO NOT skip to {remaining_steps[1] if len(remaining_steps) > 1 else 'submit'} or any other field. Current checklist step: {current_step}."
        except Exception as e:
            logger.error(f"[tradein_update_lead] ❌ Exception: {e}")
            return "Information saved"


@function_tool
async def tradein_update_lead(
    context: RunContext,
    category: Annotated[Optional[str], Field(default=None)] = None,
    brand: Annotated[Optional[str], Field(default=None)] = None,
    model: Annotated[Optional[str], Field(default=None)] = None,
    storage: Annotated[Optional[str], Field(default=None)] = None,
    condition: Annotated[Optional[str], Field(default=None)] = None,
    contact_name: Annotated[Optional[str], Field(default=None)] = None,
    contact_phone: Annotated[Optional[str], Field(default=None)] = None,
    contact_email: Annotated[Optional[str], Field(default=None)] = None,
    preferred_payout: Annotated[Optional[str], Field(default=None)] = None,
    notes: Annotated[Optional[str], Field(default=None)] = None,
    target_device_name: Annotated[Optional[str], Field(default=None)] = None,
    photos_acknowledged: Annotated[Optional[bool], Field(default=None)] = None,
    source_price_quoted: Annotated[Optional[float], Field(default=None)] = None,
    target_price_quoted: Annotated[Optional[float], Field(default=None)] = None,
    top_up_amount: Annotated[Optional[float], Field(default=None)] = None,
) -> str:
    return await _tradein_update_lead_impl(
        context=context,
        category=category,
        brand=brand,
        model=model,
        storage=storage,
        condition=condition,
        contact_name=contact_name,
        contact_phone=contact_phone,
        contact_email=contact_email,
        preferred_payout=preferred_payout,
        notes=notes,
        target_device_name=target_device_name or "",
        photos_acknowledged=photos_acknowledged,
        source_price_quoted=source_price_quoted,
        target_price_quoted=target_price_quoted,
        top_up_amount=top_up_amount,
    )


@function_tool
async def tradein_submit_lead(context: RunContext, summary: str = None) -> str:
    """Submit the complete trade-in lead. Only call when all required info is collected."""
    logger.warning(f"[tradein_submit_lead] ⚠️ CALLED with summary: {summary}")
    headers = build_auth_headers()

    # Get session ID from room name
    try:
        room = get_job_context().room
        session_id = room.name
    except Exception:
        session_id = None

    # Reuse cached leadId if we have one
    cached_lead = _lead_ids.get(session_id) if session_id else None

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{API_BASE_URL}/api/tradein/submit",
                # API expects camelCase sessionId
                json={
                    "sessionId": session_id,
                    "leadId": cached_lead,
                    "summary": summary,
                    "notify": True,
                },
                headers=headers,
                timeout=10.0,
            )
            if response.status_code >= 400:
                logger.error(
                    f"[tradein_submit_lead] ❌ {response.status_code}: {response.text}"
                )
                return f"Submit failed ({response.status_code}) — please retry"
            result = response.json()
            logger.info(f"[tradein_submit_lead] ✅ Response: {result}")
            return result.get("message", "Trade-in submitted successfully")
        except Exception as e:
            logger.error(f"[tradein_submit_lead] ❌ Exception: {e}")
            return "Trade-in submitted"


@function_tool
async def sendemail(
    context: RunContext,
    email_type: str,
    name: str,
    email: str,
    message: str,
    phone_number: str = None,
) -> str:
    """Send support escalation to TradeZone staff. Only use when customer explicitly requests human follow-up."""
    logger.info(f"[sendemail] CALLED: type={email_type}")

    # Never create support-form submissions during an active trade flow.
    # If user wants staff during a trade, they should cancel the trade flow first.
    try:
        room = get_job_context().room
        session_id = room.name
    except Exception:
        session_id = None
    if session_id:
        state = _get_checklist(session_id)
        in_trade_flow = bool(state.collected_data) or bool(state.is_trade_up)
        if in_trade_flow:
            logger.warning(
                "[sendemail] 🚫 Blocked support escalation during active trade flow (session=%s)",
                session_id,
            )
            return (
                "Trade-in is in progress. Finish the trade first. "
                "If you want a staff member instead, say: cancel trade and talk to staff."
            )
    headers = build_auth_headers()
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{API_BASE_URL}/api/tools/email",
                json={
                    "emailType": email_type,
                    "name": name,
                    "email": email,
                    "message": message,
                    "phone_number": phone_number,
                },
                headers=headers,
                timeout=10.0,
            )
            result = response.json()
            logger.info(f"[sendemail] ✅ Response: {result}")
            return result.get("message", "Email sent to staff")
        except Exception as e:
            logger.error(f"[sendemail] ❌ Exception: {e}")
            return "Message sent to staff"


# ============================================================================
# TRADE-IN CHECKLIST STATE MACHINE
# ============================================================================


class TradeInChecklistState:
    """
    Enforces deterministic trade-in checklist order.
    Prevents LLM from asking questions out of order or asking multiple fields at once.
    """

    # Fixed order that CANNOT be changed
    # Device details (including photos acknowledgement) must be locked before contact data
    STEPS = [
        "storage",
        "condition",
        "accessories",
        "photos",
        "name",
        "phone",
        "email",
        "payout",
        "recap",
        "submit",
    ]

    QUESTIONS = {
        "storage": "Storage size?",
        "condition": "Condition?",
        "accessories": "Got the box?",
        "photos": "Want to upload photos now?",
        "name": "Your name?",
        "phone": "Phone number?",
        "email": "Email?",
        "payout": "Cash, PayNow, bank, or installments?",
        "recap": "recap",  # Special: triggers summary
        "submit": "submit",  # Special: triggers submission
    }

    def __init__(self):
        self.current_step_index = 0
        self.collected_data = {}
        self.is_trade_up = False
        self.completed = False
        self.skip_storage = (
            False  # For devices without storage (cameras, accessories, etc.)
        )

    def mark_trade_up(self):
        """Trade-ups skip payout question"""
        self.is_trade_up = True

    def mark_no_storage(self):
        """Mark that this device doesn't have storage (cameras, accessories, etc.)"""
        self.skip_storage = True
        logger.info("[ChecklistState] Device has no storage, will skip storage step")

    def _storage_collected(self) -> bool:
        return self.skip_storage or "storage" in self.collected_data

    def ready_for_contact(self) -> bool:
        has_storage = self._storage_collected()
        has_condition = "condition" in self.collected_data
        has_accessories = "accessories" in self.collected_data
        has_photos = "photos" in self.collected_data
        ready = has_storage and has_condition and has_accessories and has_photos
        logger.debug(
            "[ChecklistState] Contact readiness — storage=%s condition=%s accessories=%s photos=%s => %s",
            has_storage,
            has_condition,
            has_accessories,
            has_photos,
            ready,
        )
        return ready

    def ready_for_payout(self) -> bool:
        if self.is_trade_up:
            return False
        contact_fields = all(
            f in self.collected_data for f in ("name", "phone", "email")
        )
        ready = self.ready_for_contact() and contact_fields
        logger.debug(
            "[ChecklistState] Payout readiness — contact_ready=%s contact_fields=%s => %s",
            self.ready_for_contact(),
            contact_fields,
            ready,
        )
        return ready

    def can_collect_contact(self, field_name: str) -> bool:
        """Return True only when we're ready to collect the specified contact field."""
        if field_name == "name":
            return self.ready_for_contact()
        if field_name == "phone":
            return self.ready_for_contact() and "name" in self.collected_data
        if field_name == "email":
            return self.ready_for_contact() and "phone" in self.collected_data
        return True

    def mark_field_collected(self, field_name: str, value: any = True):
        """Mark a field as collected and advance if it's the current step"""
        self.collected_data[field_name] = value
        logger.info(f"[ChecklistState] Marked '{field_name}' as collected")

        # If this is the current step, auto-advance
        current_step = self.get_current_step()
        if current_step == field_name:
            self.advance()

    def advance(self):
        """Move to next step"""
        if self.current_step_index < len(self.STEPS):
            self.current_step_index += 1
            logger.info(f"[ChecklistState] Advanced to step {self.current_step_index}")

    def get_current_step(self) -> str:
        """Get the current step name"""
        if self.current_step_index >= len(self.STEPS):
            self.completed = True
            return "completed"

        step = self.STEPS[self.current_step_index]

        # Skip steps that are already collected
        while step in self.collected_data and self.current_step_index < len(self.STEPS):
            logger.info(f"[ChecklistState] Skipping '{step}' (already collected)")
            self.current_step_index += 1
            if self.current_step_index >= len(self.STEPS):
                self.completed = True
                return "completed"
            step = self.STEPS[self.current_step_index]

        # Skip storage for devices that don't have storage (cameras, accessories, etc.)
        if step == "storage" and self.skip_storage:
            logger.info(f"[ChecklistState] Skipping 'storage' (device has no storage)")
            self.current_step_index += 1
            return self.get_current_step()

        # Skip payout for trade-ups
        if step == "payout" and self.is_trade_up:
            logger.info(f"[ChecklistState] Skipping 'payout' (trade-up mode)")
            self.current_step_index += 1
            return self.get_current_step()

        return step

    def get_next_question(self) -> str:
        """Get the exact question to ask for current step"""
        current_step = self.get_current_step()

        if current_step == "completed":
            return None

        return self.QUESTIONS.get(current_step, current_step)

    def is_complete(self) -> bool:
        """Check if all required fields are collected"""
        return self.completed or self.current_step_index >= len(self.STEPS)

    def get_progress(self) -> dict:
        """Get current progress for debugging"""
        return {
            "current_step": self.get_current_step(),
            "step_index": self.current_step_index,
            "collected": list(self.collected_data.keys()),
            "is_trade_up": self.is_trade_up,
            "completed": self.completed,
            "contact_ready": self.ready_for_contact(),
        }


# ============================================================================
# AGENT CLASS
# ============================================================================


class TradeZoneAgent(Agent):
    def __init__(self) -> None:
        # Initialize state machine for deterministic checklist flow
        self.checklist_state = TradeInChecklistState()

        super().__init__(
            tools=[
                searchProducts,
                searchtool,
                check_tradein_price,
                calculate_tradeup_pricing,
                tradein_update_lead,
                tradein_submit_lead,
                sendemail,
            ],
            instructions="""⚠️ CRITICAL DATA LOSS WARNING ⚠️
NEVER ask for contact information (name, phone, email) until ALL device details are complete:
- Storage capacity (MUST be saved first)
- Device condition (MUST be saved)
- Accessories included (MUST be saved)
- Photos uploaded/acknowledged (MUST be saved)

If you ask for contact info too early, it will be SILENTLY DISCARDED and cause submission failure.
The system BLOCKS saving contact data until device details are complete.

🔴 CRITICAL: Always speak and respond in ENGLISH ONLY, regardless of customer's accent or language.

**Language Policy:**
- ALWAYS respond in English (base language for all interactions)
- Voice transcription may mishear accented English - interpret the INTENT, stay in English
- If customer clearly speaks another language (full sentences in Chinese, French, Thai, etc.):
  * Politely respond in English: "Sorry, I can only assist in English. Can you try in English?"
  * Be understanding and helpful about the language limitation
- DO NOT mix languages or switch randomly because of accent/mispronounced words
- If transcription is unclear, ask in English: "Can you repeat that?"

You are Amara, TradeZone.sg's helpful AI assistant for gaming gear and electronics.

- Speak in ultra-concise phrases (aim 6–9 words, hard cap 12). Pause after each short answer and let the caller interrupt. If you have nothing new to add, stay silent.
- One question per turn. Never chain two questions in one response.
- Never read markdown, headings like "Quick Links", or the literal text between ---START PRODUCT LIST--- markers aloud. For voice, briefly mention how many products found (e.g., "Found 8 Final Fantasy games"), list the top 3-4 with prices, then ask if they want more details or the full list in chat.
- Before giving extra info or a longer list, ask if they actually want it. If they say no/unsure, stop and ask: "What do you want to do next?"
- 🔴 **CRITICAL - SHOW BUT DON'T SPEAK**:
  - URLs, phone numbers, emails, serial numbers → ALWAYS show in text, NEVER speak out loud
  - **Product listings**: ALWAYS display in text with COMPLETE structure (same as text chat):
    * Product name
    * Price
    * Clickable link: [View Product](https://tradezone.sg/...)
    * Product image (if available from search results)
    * Voice ONLY says: product name and price (≤8 words per item)
    * Example - Text shows: "Xbox Series X - S$699 [View Product](https://...) [image]" / Voice says: "Xbox Series X, S$699"
  - Contact info: Write in text, but just say "Got it" (≤3 words)
  - Confirmations: Display all details in text chat, then ask "Everything correct?" - let user READ and confirm visually
  - This avoids annoying voice readback that users can't stop

- Start every call with: "Hi, Amara here. Want product info, trade-in or upgrade help, or a staff member?" Wait for a clear choice before running any tools.
- After that opening line, stay silent until the caller finishes. If they say "hold on" or "thanks", answer "Sure—take your time" and pause; never stack extra clarifying questions until they actually ask something.
 - After that opening line, stay silent until the caller finishes. If they say "hold on" or "thanks", answer "Sure—take your time" and pause; never stack extra clarifying questions until they actually ask something.
 - If you detect trade/upgrade intent, FIRST confirm both devices: "Confirm: trade {their device} for {target}?" Wait for a clear yes. Only then fetch prices, compute top-up, and continue the checklist.
- 🔴 PRICE-ONLY REQUESTS (no target device): If caller says "what's my {DEVICE} worth" / "trade-in price for {DEVICE}" / "how much for my {DEVICE}", IMMEDIATELY call check_tradein_price({device_name: "{DEVICE}"}). Do NOT ask condition/model questions first. Do NOT use searchProducts. Reply with the tool result verbatim. If tool gives a price, add "Start a trade-in?" If tool can't find a price, offer staff handoff (no guessing or ranges).
- Mirror text-chat logic and tools exactly (searchProducts, tradein_update_lead, tradein_submit_lead, sendemail). Do not invent any extra voice-only shortcuts; every saved field must go through the same tools used by text chat.
- Phone and email: collect one at a time, then READ BACK the full value once ("That's 8448 9068, correct?"). Wait for a clear yes before saving. If email arrives in fragments across turns, assemble it and read the full address once before saving.
- One voice reply = ≤12 words. Confirm what they asked, share one fact or question, then pause so they can answer.
- If multiple products come back from a search, say "I found a few options—want the details?" and only read the one(s) they pick.

## Price safety (voice number drift)
- When reading prices aloud, keep numbers concise: say "S dollar" or "Singapore dollars" after the number. Never add extra digits. If STT seems noisy, show the exact number in text and say "Showing S dollar price on screen." If a price has more than 4 digits, insert pauses: "One thousand, one hundred".

## Quick Answers (Answer instantly - NO tool calls)
- What is TradeZone.sg? → TradeZone.sg buys and sells new and second-hand electronics, gaming gear, and gadgets in Singapore.
- Where are you located? → 21 Hougang St 51, #02-09, Hougang Green Shopping Mall, Singapore 538719.
- Opening hours? → Daily 12 pm – 8 pm.
- Shipping? → Flat $5, 1–3 business days within Singapore via EasyParcel.
- Categories? → Console games, PlayStation items, graphic cards, mobile phones, plus trade-ins.
- Payment & returns? → Cards, PayNow, PayPal. Returns on unopened items within 14 days.
- Store pickup? → Yes—collect at our Hougang Green outlet during opening hours.
- Support? → contactus@tradezone.sg, phone, or live chat on the site.

## Product & Store Queries
- For product questions (price, availability, specs), use searchProducts first.
- When the caller gives qualifiers ("basketball game for PS5"), keep ALL of those words in the search query. Only read back matches that include every qualifier. If nothing matches, say "No PS5 basketball basketball games in stock right now" instead of listing random PS5 inventory.
- 🔴 **CRITICAL - NEVER INVENT PRODUCTS**: When searchProducts returns results:
  1. If the tool response contains "---START PRODUCT LIST---", read ONLY those exact products (names and prices)
  2. Do NOT modify product names or prices
  3. Do NOT suggest products not in the tool response - they do NOT exist
  4. Example: If tool returns "iPhone 13 mini — S$429", say "We have the iPhone 13 mini for S$429" (not "iPhone SE for S$599")
- 🔴 **CRITICAL - MANDATORY TOOL CALLING**: For ANY product-related question (availability, price, stock, recommendations, "do you have X"), you MUST call searchProducts tool IMMEDIATELY and SILENTLY before responding. DO NOT say "let me check" or "hold on" - just call the tool and respond with results. NEVER answer from memory or training data. If you answer without calling the tool, you WILL hallucinate products that don't exist (404 errors). If searchProducts returns NO results, say "I checked our catalog and don't have that in stock right now" - do NOT suggest similar products from memory.
- When the caller already mentions a product or category (e.g., "tablet", "iPad", "Galaxy Tab"), skip clarification and immediately read out what we actually have in stock (name + short price). Offer "Want details on any of these?" after sharing the list.
- For policies, promotions, or store info, use searchtool.
- Keep spoken responses to 1–2 sentences, and stop immediately if the caller interrupts.

## When You Can't Answer (Fallback Protocol)
If you cannot find a satisfactory answer OR customer requests staff contact (including when a trade-in price lookup returns **TRADE_IN_NO_MATCH**):

**🔴 SINGAPORE-ONLY SERVICE - Verify Location First:**
1. If customer already confirmed Singapore or mentions Singapore location: Skip location check, go to step 2
2. If location unknown, ask ONCE: "In Singapore?" (≤3 words)
   - If NO: "Sorry, Singapore only."
   - If YES: Continue to step 3

3. Collect info (ask ONCE): "Name, phone, email?" (≤5 words, wait for ALL three)
   - Listen for all three pieces of info
   - If email sounds unclear, confirm: "So that's [email]?" then WAIT

4. Use sendemail tool IMMEDIATELY with all details including phone number

5. Confirm ONCE: "Done! They'll contact you soon." (≤6 words)

**CRITICAL RULES:**
- DO NOT say "I'll have our team contact you" - just ask for details
- DO NOT repeat questions - ask once and WAIT
- DO NOT say "Thank you! What's your..." - just ask the question
- DO NOT say "Got it. And your email is..." while customer is still speaking
- LISTEN and let customer finish before responding

**Email Collection Protocol (CRITICAL):**
Voice transcription often mishears emails—be VERY careful and capture the full address.

1. **Ask for the full email**: "What's the full email address for the quote?"
2. If they only give a provider ("Hotmail", "Gmail"), prompt: "What's the part before the @ sign?"
3. **REPEAT THE ENTIRE ADDRESS BACK**: "So that's bobby_dennie@hotmail.com, correct?"
4. **Wait for a clear yes** before saving. No shaky answers.
5. **If unsure**: "Please spell the part before the @ sign, letter by letter."
6. If the name or domain sounds unusual, ask them to repeat it slowly and note what you heard.

**Common Mishearings to Watch:**
- "hotmail" transcribes as: "oatmeal", "artmail", "utmail"
- "gmail" transcribes as: "g-mail", "gee mail"
- Numbers/underscores get lost
- Use note field to add: "Customer said: [what they actually said]" for staff reference

**DO NOT SEND EMAIL unless:**
✓ You have a valid format: something@domain.com
✓ User confirmed it's correct when you read it back
✓ Domain makes sense (gmail.com, hotmail.com, outlook.com, yahoo.com, etc.)

Example:
User: "My email is hotmail"
You: "What's the part before @hotmail.com?"
User: "bobby underscore dennie"
You: "Let me confirm - is that bobby_dennie@hotmail.com?"
User: "Yes, that's correct"
You: → Use sendemail with email="bobby_dennie@hotmail.com" and note="Customer confirmed via voice spelling"

**BAD Example (what NOT to do):**
User: "bubby underscore D-E-N-N-I-E at utmail.com" (voice mishearing)
You: → DON'T send yet! Say: "I heard U-T-mail dot com - did you mean Hotmail?"

## 🔄 TRADE-UP / UPGRADE FLOW (Trading Device X FOR Device Y)

🔴 **DETECT**: When customer says "trade/upgrade/swap/exchange X for Y" → This is a TRADE-UP!

**Examples:**
- "Trade my PS4 for Xbox Series X"
- "Upgrade PS5 to PS5 Pro"
- "Swap Switch for Steam Deck"

**🔴 MANDATORY FLOW - DO NOT SKIP STEPS:**

**Step 1: Confirm Both Devices** (≤8 words)
"Confirm: trade {SOURCE} for {TARGET}?"
WAIT for "yes/correct/yep" before continuing.

**Step 2: Calculate Trade-Up Pricing** (CRITICAL - Use the pricing tool!)
🔴 NO SPEECH NEEDED - typing indicator shows automatically while tool runs
🔴 MANDATORY: Call calculate_tradeup_pricing({source_device: "{SOURCE}", target_device: "{TARGET}"})
- This returns ACCURATE pricing using the same logic as text chat
- Returns: trade-in value, retail price (from price hints, NOT catalog), and top-up amount
- DO NOT use searchProducts for pricing - it returns wrong catalog prices!

**Step 4: Show Pricing Breakdown** (≤20 words)
"Your {SOURCE} trades for S$[TRADE]. The {TARGET} is S$[BUY]. Top-up: S$[DIFFERENCE]."
Example: "MSI Claw trades S$300. PS5 Pro S$900. Top-up: S$600."

**Step 5: Ask to Proceed** (≤5 words)
"Want to proceed?"
WAIT for "yes/okay/sure/let's do it" before continuing.
If NO: "No problem! Need help with anything else?"

**Step 6: Collect Device Details** (ONLY if user said YES to proceed!)
1. ✅ Ask storage (if not mentioned): "Storage size?"
2. ✅ Ask condition: "Condition of your {SOURCE}? Mint, good, fair, or faulty?"
3. ✅ Ask accessories: "Got the box and accessories?"
4. ✅ Ask for photo: "Photos help—want to send one?"
5. ✅ Call tradein_update_lead after EACH answer

**Step 7: Collect Contact Info** (After device details saved)
6. ✅ Ask name: "Your name?"
7. ✅ Ask phone: "Contact number?" → repeat back for confirmation
8. ✅ Ask email: "Email address?" → repeat back for confirmation
9. ✅ NOW call tradein_update_lead with contact info:
   ```
   tradein_update_lead(
     contact_name="John",
     contact_phone="84489068",
     contact_email="john@example.com"
   )
   ```
10. ✅ Mini recap: "{SOURCE} {CONDITION}, {ACCESSORIES}, {NAME} {PHONE}, email noted. Correct?"
11. ✅ Submit: Call tradein_submit_lead
12. ✅ Confirm: "Trade-up submitted! We'll contact you to arrange. Anything else?"

**Example - CORRECT FLOW ✅:**
User: "Trade my MSI Claw 1TB for PS5 Pro 2TB Digital"
Agent: "Confirm: trade MSI Claw 1TB for PS5 Pro 2TB Digital?" [WAIT]
User: "Yes"
Agent: [calculate_tradeup_pricing(source_device="MSI Claw 1TB", target_device="PS5 Pro 2TB Digital")] [typing indicator shows]
Agent: "MSI Claw trades S$300. PS5 Pro S$900. Top-up: S$600. Want to proceed?" [WAIT]
User: "Yes"
Agent: "Storage size?" [WAIT]
User: "1TB"
Agent: [tradein_update_lead(storage="1TB")]
Agent: "Condition of your MSI Claw? Mint, good, fair, or faulty?" [WAIT]
User: "Good"
Agent: [tradein_update_lead(condition="good")]
Agent: "Got the box and accessories?" [WAIT]
User: "Yes"
Agent: [tradein_update_lead(notes="Has box and accessories")]
Agent: "Photos help—want to send one?" [WAIT]
User: "No photos"
Agent: [tradein_update_lead(photos_acknowledged=False)]
Agent: "Your name?" [WAIT]
User: "Bobby"
Agent: "Contact number?" [WAIT]
User: "8448 9068"
Agent: "That's 84489068, correct?" [WAIT]
User: "Yes"
Agent: "Email?" [WAIT]
User: "bobby@hotmail.com"
Agent: "bobby@hotmail.com, right?" [WAIT]
User: "Yes"
Agent: [tradein_update_lead(contact_name="Bobby", contact_phone="84489068", contact_email="bobby@hotmail.com")]
Agent: "Noted—final quote after inspection. Installments or cash top-up?"
User: "Installments"
Agent: [tradein_update_lead(preferred_payout="installment")]
Agent: "MSI Claw 1TB, good condition, with box and accessories. Contact: Bobby, 84489068, bobby@hotmail.com. Payout via installments. Change anything?" [WAIT]
User: "No"
Agent: [tradein_submit_lead()]
Agent: "Done! We'll review and contact you. Anything else?"

**Example - WRONG ❌:**
User: "Trade PS4 for Xbox"
Agent: "Xbox trade-in is S$350" ← NO! Customer is BUYING Xbox, not trading it in!
Agent: [Skips to submission without collecting condition/contact] ← NO! Must follow full flow!

**🔴 CRITICAL RULES:**
- NEVER say "{TARGET} trade-in is..." when customer is BUYING that device
- ALWAYS complete full flow: prices → details → contact → photo → payout → recap → submit
- ALWAYS use "buy price {TARGET}" query to get retail price
- NEVER skip contact collection, photo prompt, or recap
- ALWAYS call tradein_update_lead after each detail collected""",
        )

    async def on_enter(self):
        await self.session.generate_reply(
            instructions="""Greet the user: "Hi, Amara here. Want product info, trade-in or upgrade help, or a staff member?" """,
            allow_interruptions=True,
        )


# ============================================================================
# SERVER SETUP
# ============================================================================

server = AgentServer()


def prewarm(proc: JobProcess):
    """Preload VAD model for better performance"""
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


@server.rtc_session()
async def entrypoint(ctx: JobContext):
    """Main entry point for LiveKit voice sessions"""

    job_ctx = ctx

    # Store conversation for dashboard logging
    conversation_buffer = {"user_message": "", "bot_response": ""}
    room_name = ctx.room.name
    participant_identity = None

    asyncio.create_task(_ensure_tradein_lead_for_session(room_name))

    # Choose stack: classic (AssemblyAI + GPT + Cartesia) or OpenAI Realtime
    if VOICE_STACK == "realtime":
        session = AgentSession(
            llm=realtime.RealtimeModel(
                model=os.getenv(
                    "VOICE_LLM_MODEL",
                    "gpt-4o-mini-realtime-preview-2024-12-17",
                ),
                voice=os.getenv("VOICE_LLM_VOICE", "alloy"),
                temperature=float(os.getenv("VOICE_LLM_TEMPERATURE", "0.2")),
                # ServerVAD settings - using default turn detection
            ),
        )
    else:
        session = AgentSession(
            stt=inference.STT(
                model="assemblyai/universal-streaming",
                language="en",
            ),
            llm=inference.LLM(
                model=LLM_MODEL,
                temperature=LLM_TEMPERATURE,
            ),
            tts=inference.TTS(
                model="cartesia/sonic-3",
                voice="9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
                language="en",
            ),
            turn_detection=MultilingualModel(),
            vad=ctx.proc.userdata["vad"],
            preemptive_generation=False,  # listen for full turn before speaking
        )

    # Event handlers for dashboard logging
    @session.on("user_input_transcribed")
    def on_user_input(event):
        """Capture user's final transcribed message and auto-save data"""
        nonlocal conversation_buffer
        if event.is_final:  # Only capture final transcripts
            conversation_buffer["user_message"] = event.transcript
            logger.info(f"[Voice] User said: {event.transcript}")

            # 🔥 AUTO-SAVE: Extract and save data from user message
            checklist = _get_checklist(room_name)
            logger.info(
                f"[AutoSave] 🔍 Triggering auto-save for session {room_name}, message: {event.transcript[:100]}"
            )
            logger.info(
                f"[AutoSave] 📋 Current checklist state: {checklist.get_progress()}"
            )
            asyncio.create_task(
                auto_save_after_message(
                    session_id=room_name,
                    user_message=event.transcript,
                    checklist_state=checklist,
                    api_base_url=API_BASE_URL,
                    headers=build_auth_headers(),
                )
            )

            # 🔥 SMART ACKNOWLEDGMENT: Check what was extracted and acknowledge
            extracted = extract_data_from_message(event.transcript, checklist)
            if extracted:
                acknowledgment = build_smart_acknowledgment(extracted, checklist)
                if acknowledgment:
                    # Log acknowledgment for debugging
                    logger.info(
                        f"[SmartAck] 📝 Prepared acknowledgment: {acknowledgment}"
                    )
                    # Store in conversation buffer for next response
                    conversation_buffer["pending_acknowledgment"] = " | ".join(
                        acknowledgment
                    )

    @session.on("conversation_item_added")
    def on_conversation_item(event):
        """Capture agent's response and log to dashboard"""
        nonlocal conversation_buffer, participant_identity
        # Check if this is an assistant message
        if hasattr(event.item, "role") and event.item.role == "assistant":
            if hasattr(event.item, "content") and event.item.content:
                # Convert content to string (it may be a list)
                content = event.item.content
                if isinstance(content, list):
                    content = " ".join(str(item) for item in content)
                conversation_buffer["bot_response"] = content
                logger.info(f"[Voice] Agent said: {event.item.content}")

                try:
                    checklist = _get_checklist(room_name)
                    progress = checklist.get_progress()
                    has_quote = bool(checklist.collected_data.get("initial_quote_given"))
                    has_prices = all(
                        k in checklist.collected_data
                        for k in ("source_price_quoted", "target_price_quoted", "top_up_amount")
                    )

                    lower_content = content.lower()
                    if (
                        ("trades for" in lower_content)
                        and ("top-up" in lower_content or "top up" in lower_content)
                        and has_prices
                    ):
                        checklist.collected_data["initial_quote_given"] = True
                        checklist.collected_data["quote_timestamp"] = datetime.utcnow().isoformat()
                        logger.info(
                            "[QuoteState] ✅ Marked initial_quote_given=True after quote spoken. progress=%s",
                            progress,
                        )

                        asyncio.create_task(
                            _persist_quote_flag(
                                room_name,
                                checklist.collected_data.get("quote_timestamp"),
                            )
                        )

                    said_proceed = "want to proceed" in content.lower()
                    if said_proceed and not conversation_buffer.get("quote_failsafe_sent"):
                        conversation_buffer["quote_failsafe_sent"] = True

                        if (not has_quote) and has_prices:
                            src = checklist.collected_data.get("source_device_name")
                            tgt = checklist.collected_data.get("target_device_name")
                            trade_value = checklist.collected_data.get("source_price_quoted")
                            retail_price = checklist.collected_data.get("target_price_quoted")
                            top_up = checklist.collected_data.get("top_up_amount")
                            logger.warning(
                                "[QuoteFailSafe] ⚠️ Agent asked to proceed without quoting. Injecting quote. progress=%s",
                                progress,
                            )
                            asyncio.create_task(
                                _async_generate_reply(
                                    session,
                                    instructions=(
                                        f"Say exactly: Your {src} trades for S${int(trade_value)}. "
                                        f"The {tgt} is S${int(retail_price)}. "
                                        f"Top-up: S${int(top_up)}. Want to proceed?"
                                    ),
                                    allow_interruptions=True,
                                )
                            )
                            checklist.collected_data["initial_quote_given"] = True
                        else:
                            trade_ctx = _tradeup_context.get(room_name) or {}
                            if trade_ctx.get("pending_clarification"):
                                logger.warning(
                                    "[QuoteFailSafe] ⚠️ Proceed asked while pricing pending clarification. ctx=%s progress=%s",
                                    trade_ctx,
                                    progress,
                                )
                                needs_source = bool(trade_ctx.get("needs_source"))
                                needs_target = bool(trade_ctx.get("needs_target"))
                                if needs_source or needs_target:
                                    prompt = (
                                        "I still need one detail to price this. "
                                        "Please repeat the exact model name." 
                                        ""
                                    )
                                    asyncio.create_task(
                                        _async_generate_reply(
                                            session,
                                            instructions=f"Say exactly: {prompt}",
                                            allow_interruptions=True,
                                        )
                                    )

                    # Guardrail: if the model tries to close the call early, force the next checklist question.
                    # Keeps the flow seamless and prevents missing-field dead ends.
                    lower = content.lower()
                    looks_like_close = any(
                        phrase in lower
                        for phrase in (
                            "all done",
                            "done",
                            "have a great day",
                            "we'll review",
                            "we will review",
                            "we'll contact you",
                            "anything else",
                        )
                    )
                    next_question = checklist.get_next_question()
                    if (
                        looks_like_close
                        and next_question
                        and not checklist.is_complete()
                        and not conversation_buffer.get("order_failsafe_sent")
                        and next_question.lower() not in lower
                    ):
                        conversation_buffer["order_failsafe_sent"] = True
                        logger.warning(
                            "[OrderFailSafe] ⚠️ Model attempted to end early. Forcing next question: %s progress=%s",
                            next_question,
                            progress,
                        )
                        asyncio.create_task(
                            _async_generate_reply(
                                session,
                                instructions=f"Say exactly: {next_question}",
                                allow_interruptions=True,
                            )
                        )
                except Exception as e:
                    logger.error(f"[QuoteFailSafe] ❌ Failed: {e}")

                # 🔥 AUTO-SUBMIT: Check if user confirmed and auto-submit
                if conversation_buffer.get("user_message"):
                    checklist = _get_checklist(room_name)
                    logger.info(
                        f"[AutoSubmit] 🔍 Checking for confirmation - User: '{conversation_buffer['user_message'][:50]}', Bot: '{content[:50]}'"
                    )
                    logger.info(
                        f"[AutoSubmit] 📋 Checklist progress: {checklist.get_progress()}"
                    )
                    asyncio.create_task(
                        check_for_confirmation_and_submit(
                            session_id=room_name,
                            user_message=conversation_buffer["user_message"],
                            bot_response=content,
                            checklist_state=checklist,
                            api_base_url=API_BASE_URL,
                            headers=build_auth_headers(),
                        )
                    )

        # Log complete turn to dashboard
        if conversation_buffer["user_message"] and conversation_buffer["bot_response"]:
            # Get participant identity from room
            if not participant_identity:
                try:
                    for participant in job_ctx.room.remote_participants.values():
                        if (
                            participant.kind
                            == rtc.ParticipantKind.PARTICIPANT_KIND_STANDARD
                        ):
                            participant_identity = participant.identity
                            break
                except Exception as e:
                    logger.error(f"[Dashboard] ❌ Failed to read participant identity: {e}")

            user_id = participant_identity or room_name

            # Log to dashboard asynchronously
            asyncio.create_task(
                log_to_dashboard(
                    user_id=user_id,
                    user_message=conversation_buffer["user_message"],
                    bot_response=conversation_buffer["bot_response"],
                    session_id=room_name,
                )
            )

            # Clear buffer for next turn
            conversation_buffer = {"user_message": "", "bot_response": ""}

    await session.start(
        agent=TradeZoneAgent(),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=lambda params: (
                    noise_cancellation.BVCTelephony()
                    if params.participant.kind
                    == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                    else noise_cancellation.BVC()
                ),
            ),
        ),
    )


if __name__ == "__main__":
    cli.run_app(server)
