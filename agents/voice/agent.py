"""
TradeZone Voice Agent - LiveKit Integration
Calls existing Next.js APIs to keep logic in sync with text chat
"""

import asyncio
import json
import logging
import os
from typing import Dict, Optional

import httpx

# Import auto-save system
from auto_save import (
    auto_save_after_message,
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
We shouldn't have clear things, and what is the problem? Fix one by one, and after a bit, we're okay. It's like 10 hours, 15 hours, two days of crap. No, no, it's enough. Do it the right way. # Session → leadId cache to keep a single lead per call
_lead_ids: Dict[str, str] = {}


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

            if source_q and target_q:
                return f"{source_q} Also, {target_q}"
            elif source_q:
                return source_q
            elif target_q:
                return target_q

        # Return pricing if available
        trade_value = result.get("trade_value")
        retail_price = result.get("retail_price")
        top_up = result.get("top_up")

        if trade_value and retail_price and top_up:
            logger.info(
                f"[calculate_tradeup_pricing] ✅ Python pricing: Trade ${trade_value}, Retail ${retail_price}, Top-up ${top_up}"
            )
            return f"Your {source_device} trades for S${int(trade_value)}. The {target_device} is S${int(retail_price)}. Top-up: S${int(top_up)}."

        logger.error(f"[calculate_tradeup_pricing] ⚠️ Incomplete pricing data: {result}")
        return "Unable to calculate complete pricing. Please verify the device models."

    except Exception as e:
        logger.error(f"[calculate_tradeup_pricing] ❌ Exception: {e}")
        return "Pricing calculation unavailable. Please provide device details."


@function_tool
async def tradein_update_lead(
    context: RunContext,
    category: str = "",
    brand: str = "",
    model: Optional[str] = None,
    storage: str = "",
    condition: str = "",
    contact_name: Optional[str] = None,
    contact_phone: Optional[str] = None,
    contact_email: Optional[str] = None,
    preferred_payout: str = "",
    notes: str = "",
    target_device_name: Optional[str] = None,
    photos_acknowledged: bool = False,
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

        storage_pattern = r"\b(\d+\s*(gb|tb|mb))\b"
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
        "preferred_payout": "payout",
    }

    # Check if any field is being set that's not the current step
    fields_being_set = []
    if storage:
        fields_being_set.append("storage")
    if condition:
        fields_being_set.append("condition")
    if notes and ("box" in notes.lower() or "accessories" in notes.lower()):
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

    # Normalize empty strings to None to avoid sending blanks
    if category == "":
        category = None
    if brand == "":
        brand = None
    if storage == "":
        storage = None
    if condition == "":
        condition = None
    if preferred_payout == "":
        preferred_payout = None
    if notes == "":
        notes = None
    if photos_acknowledged is False:
        # Leave False as-is; but treat default False with no user confirmation as None
        photos_acknowledged = None

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

            # Return the next required question with STRICT enforcement
            next_question = state.get_next_question()
            current_step = state.get_current_step()
            logger.info(
                f"[tradein_update_lead] 📋 Current step: {current_step}, Next question: {next_question}"
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
    # API REQUIREMENT: name/phone/email MUST come BEFORE condition/accessories
    STEPS = [
        "storage",  # 0: Storage (if not already specified)
        "name",  # 1: Contact name (MUST be before condition per API)
        "phone",  # 2: Contact phone (MUST be before condition per API)
        "email",  # 3: Contact email (MUST be before condition per API)
        "condition",  # 4: Device condition (after contact info)
        "accessories",  # 5: Box/accessories
        "photos",  # 6: Photos acknowledgment
        "payout",  # 7: Payout preference (skip for trade-up)
        "recap",  # 8: Show summary
        "submit",  # 9: Final submission
    ]

    QUESTIONS = {
        "storage": "Storage size?",
        "condition": "Condition?",
        "accessories": "Got the box?",
        "photos": "Photos help—want to send one?",
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
            instructions="""🔴 CRITICAL: Always speak and respond in ENGLISH ONLY, regardless of customer's accent or language.

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

**Step 6: Collect Contact Info FIRST** (ONLY if user said YES to proceed!)
🔴 CRITICAL ORDER - API REQUIRES contact info BEFORE device details:
1. ✅ Ask storage (if not mentioned): "Storage size?"
2. ✅ Ask name: "Your name?"
3. ✅ Ask phone: "Contact number?" → repeat back for confirmation
4. ✅ Ask email: "Email address?" → repeat back for confirmation
5. ✅ NOW call tradein_update_lead with EXACT field names:
   ```
   tradein_update_lead(
     model="MSI Claw",              # Source device model (NOT brand+model, just model)
     storage="1TB",                  # Storage size
     target_device_name="PS5 Pro 2TB Digital",  # Full target device name
     contact_name="John",            # User's name
     contact_phone="84489068",       # Phone WITHOUT dashes/spaces
     contact_email="john@example.com",  # Email address
     source_price_quoted=300,        # Trade-in value from calculate_tradeup_pricing
     target_price_quoted=900,        # Retail price from calculate_tradeup_pricing
     top_up_amount=600               # Top-up from calculate_tradeup_pricing
   )
   ```
   🚨 If this call FAILS with "Invalid fields" error, DO NOT continue!
   Tell user: "I'm having trouble saving the details. Let me connect you with staff."
   Then call: sendemail(info_request="Trade-up submission failed - {SOURCE} for {TARGET}, contact {NAME} {PHONE}")

**Step 7: Collect Device Details** (After contact info saved)
6. ✅ Ask condition: "Condition of your {SOURCE}? Mint, good, fair, or faulty?"
7. ✅ Ask accessories: "Got the box and accessories?"
8. ✅ Call tradein_update_lead after EACH answer
9. ✅ Ask for photo: "Photos help—want to send one?"
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
Agent: [tradein_update_lead(model="Claw", storage="1TB", target_device_name="PS5 Pro 2TB Digital", contact_name="Bobby", contact_phone="84489068", contact_email="bobby@hotmail.com", source_price_quoted=300, target_price_quoted=900, top_up_amount=600)]
Agent: "Condition of your MSI Claw? Mint, good, fair, or faulty?" [WAIT]
User: "Good"
Agent: [tradein_update_lead(condition="good")]
Agent: "Got the box?" [WAIT]
User: "Yes"
Agent: [tradein_update_lead(has_box=true)]
Agent: "Photos help—want to send one?" [WAIT]
User: "No photos"
Agent: [tradein_update_lead({photos_provided:false})]
Agent: "Noted—final quote after inspection. Installments or cash top-up?"
User: "Installments"
Agent: [tradein_update_lead({preferred_payout:"installment"})]
Agent: "PS4 Pro good, box, 8448 9068, bobby@hotmail.com, installments. Change anything?" [WAIT]
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

    # Store conversation for dashboard logging
    conversation_buffer = {"user_message": "", "bot_response": ""}
    room_name = ctx.room.name
    participant_identity = None

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
                for participant in ctx.room.remote_participants.values():
                    if (
                        participant.kind
                        == rtc.ParticipantKind.PARTICIPANT_KIND_STANDARD
                    ):
                        participant_identity = participant.identity
                        break

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
