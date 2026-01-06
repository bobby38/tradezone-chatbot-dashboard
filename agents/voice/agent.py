"""
TradeZone Voice Agent - LiveKit Integration
Calls existing Next.js APIs to keep logic in sync with text chat
"""

import asyncio
import json
import logging
import os
import random
import re
from datetime import datetime
from typing import Annotated, Any, Dict, Optional

import httpx

# Import auto-save system
from auto_save import (
    auto_save_after_message,
    build_smart_acknowledgment,
    check_for_confirmation_and_submit,
    detect_and_fix_trade_up_prices,
    extract_data_from_message,
    force_save_to_db,
    lookup_price,
    needs_clarification,
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
from livekit.plugins import openai

try:
    from livekit.plugins import silero

    SILERO_AVAILABLE = True
except ImportError:
    silero = None
    SILERO_AVAILABLE = False
from livekit.plugins.openai import realtime
from pydantic import Field

# Conditionally import noise cancellation only if enabled (Cloud-only feature)
VOICE_NOISE_CANCELLATION = (
    os.getenv("VOICE_NOISE_CANCELLATION", "false").lower() == "true"
)
if VOICE_NOISE_CANCELLATION:
    from livekit.plugins import noise_cancellation

logger = logging.getLogger("agent-amara")

_last_user_utterance: Dict[str, str] = {}
_awaiting_recap_confirmation: Dict[str, bool] = {}

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
# Session → waiting for photo upload (blocks further questions until photo received or user says done)
_waiting_for_photo: Dict[str, bool] = {}

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


def _normalize_voice_currency(text: str) -> str:
    """
    Convert currency for TTS pronunciation.
    S$200 → "200 dollars" (NOT "$200" which TTS says as "dollar sign 200")
    """
    if not text:
        return text

    # Replace currency symbols with spoken numbers
    # Pattern: S$200, $200, S$ 200 → "200 dollars"
    import re

    def replace_currency(match):
        amount = match.group(1).replace(",", "").strip()
        return f"{amount} dollars"

    # Match S$123, $123, S$ 123 (with optional comma separators)
    normalized = re.sub(r"[S\$]*\$\s*([\d,]+(?:\.\d{2})?)", replace_currency, text)

    # Cleanup other variations
    normalized = normalized.replace("Singapore dollars", "dollars")
    normalized = normalized.replace("S dollar", "dollar")
    normalized = normalized.replace("SGD", "dollars")

    return normalized


def _parse_price_value(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.replace("S$", "").replace("$", "")
        cleaned = cleaned.replace(",", "").strip()
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _get_product_price(product: Dict[str, Any]) -> Optional[float]:
    for key in ("price_sgd", "price", "price_sgd_float"):
        price = _parse_price_value(product.get(key))
        if price is not None:
            return price
    return None


def _is_budget_phone_query(query: str) -> bool:
    lower = query.lower()
    return ("phone" in lower or "phones" in lower) and any(
        token in lower for token in ["affordable", "cheap", "budget", "low"]
    )


def _is_game_query(query: str) -> bool:
    lower = query.lower()
    return any(
        token in lower
        for token in [
            "game",
            "games",
            "nba",
            "basketball",
            "racing",
            "horror",
            "silent",
            "madden",
            "war",
            "shooter",
            "dance",
            "skate",
            "skateboard",
            "tony",
        ]
    )


def _tokenize_query(query: str) -> list[str]:
    tokens = re.findall(r"[a-z0-9]+", query.lower())
    stop = {
        "any",
        "the",
        "a",
        "an",
        "do",
        "you",
        "have",
        "got",
        "game",
        "games",
        "video",
        "for",
        "on",
        "ps5",
        "ps4",
        "xbox",
        "switch",
        "nintendo",
        "playstation",
        "console",
        "consoles",
        "affordable",
        "cheap",
        "budget",
        "phone",
        "phones",
    }
    return [token for token in tokens if token not in stop]


def _name_matches_tokens(name: str, tokens: list[str]) -> bool:
    if not tokens:
        return True
    words = set(re.findall(r"[a-z0-9]+", name.lower()))
    for token in tokens:
        if token in words:
            continue
        if token + "s" in words or token + "es" in words:
            continue
        if token.endswith("s") and token[:-1] in words:
            continue
        if any(char.isdigit() for char in token):
            if any(word.startswith(token) for word in words):
                continue
        return False
    return True


def _is_game_product(product: Dict[str, Any]) -> bool:
    categories = product.get("categories") or []
    for category in categories:
        name = (category.get("name") or "").lower()
        slug = (category.get("slug") or "").lower()
        if "game" in name or "game" in slug:
            return True
    return False


def _format_price(price: Optional[float]) -> str:
    if price is None:
        return "$?"
    if abs(price - round(price)) < 0.01:
        return f"${int(round(price))}"
    return f"${price:.2f}"


def _shorten_name(name: str, max_words: int = 6) -> str:
    if not name:
        return "Item"
    words = name.split()
    if len(words) <= max_words:
        return name
    return " ".join(words[:max_words]) + "..."


def _build_voice_product_summary(
    products: list[Dict[str, Any]], query: str | None = None
) -> str:
    if not products:
        return ""
    top = products[:2]
    parts = []
    for product in top:
        name = _shorten_name(product.get("name", "Item"))
        price = _format_price(_get_product_price(product))
        parts.append(f"{name} {price}")
    joined = "; ".join(parts)
    prefix = ""
    if query and "ps5" in query.lower() and "ps5" not in joined.lower():
        prefix = "PS5 options. "
    return f"{prefix}Found {len(products)} items. {joined}. Want more details?"


def _proceed_prompt() -> str:
    options = [
        "Do you want to proceed?",
        "Shall I proceed?",
        "Proceed now?",
        "Continue with trade-in?",
    ]
    return random.choice(options)


def _greeting_prompt() -> str:
    options = [
        "Hi, Amara here. Electronics, gaming, trade-ins, or staff support?",
        "Hello—Amara here. Need electronics, gaming, or trade-ins?",
        "Hi! Amara here. Electronics, gaming, or trade-ins?",
        "Hey, Amara here. Gaming gear, electronics, or trade-ins?",
    ]
    return random.choice(options)


def _strip_device_name(raw: str) -> str:
    if not raw:
        return ""
    cleaned = raw.strip()
    cleaned = re.sub(r"[?.!,]+$", "", cleaned)
    cleaned = re.sub(r"^(my|the|a|an)\s+", "", cleaned, flags=re.I)
    return cleaned.strip()


def _extract_tradeup_devices(message: str) -> Optional[tuple[str, str]]:
    if not message:
        return None
    match = re.search(
        r"(trade|swap|upgrade|exchange)(?:\s+in)?(?:\s+my)?\s+(.+?)\s+for\s+(.+)",
        message,
        flags=re.I,
    )
    if not match:
        return None
    source = _strip_device_name(match.group(2))
    target = _strip_device_name(match.group(3))
    if not source or not target:
        return None
    if re.search(r"\b(cash|money|dollars?)\b", target, flags=re.I):
        return None
    return source, target


def _extract_tradein_device(message: str) -> Optional[str]:
    if not message:
        return None
    patterns = [
        r"trade(?:\s+in)?\s+my\s+(.+)",
        r"trade(?:\s+in)?\s+(.+)",
        r"how much can i trade(?:\s+in)?\s+my\s+(.+)",
        r"how much for my\s+(.+)",
        r"what'?s my\s+(.+?)\s+worth",
        r"trade[-\s]?in price for\s+(.+)",
        r"sell my\s+(.+)",
    ]
    stopwords = {"in", "for", "here", "there", "this", "that"}
    for pattern in patterns:
        match = re.search(pattern, message, flags=re.I)
        if match:
            device = _strip_device_name(match.group(1))
            device = re.sub(
                r"\bfor\s+(cash|money|dollars?)\b", "", device, flags=re.I
            ).strip()
            device = re.sub(r"\bfor\b$", "", device, flags=re.I).strip()
            if not device or device.lower() in stopwords:
                return None
            if device:
                return device
    return None


def _build_tradein_price_reply(device: str) -> str:
    clarification = needs_clarification(device)
    if clarification:
        return _normalize_voice_currency(clarification)
    price = lookup_price(device, "preowned")
    if price is not None:
        price_int = int(price)
        return _normalize_voice_currency(
            f"Your {device} is worth about ${price_int} for trade-in. {_proceed_prompt()}"
        )
    return (
        f"I couldn't find a trade-in price for {device}. Want staff support to check?"
    )


def _build_tradeup_price_reply(
    source_device: str, target_device: str, session_id: Optional[str] = None
) -> str:
    result = detect_and_fix_trade_up_prices(source_device, target_device)
    if not result:
        return (
            f"Sorry, I couldn't find pricing for {source_device} or {target_device}. "
            "Want staff support to check?"
        )

    if result.get("needs_clarification"):
        source_q = result.get("source_question")
        target_q = result.get("target_question")
        if session_id:
            _tradeup_context[session_id] = {
                "source_device": source_device,
                "target_device": target_device,
                "pending_clarification": True,
                "needs_source": bool(source_q),
                "needs_target": bool(target_q),
                "pending_confirmation": False,
            }
        if source_q and target_q:
            return f"{source_q} Also, {target_q}"
        if source_q:
            return str(source_q)
        if target_q:
            return str(target_q)

    trade_value = result.get("trade_value")
    retail_price = result.get("retail_price")
    top_up = result.get("top_up")
    if trade_value and retail_price and top_up:
        if session_id:
            _tradeup_context[session_id] = {
                "source_device": source_device,
                "target_device": target_device,
                "trade_value": trade_value,
                "retail_price": retail_price,
                "top_up": top_up,
                "pending_clarification": False,
                "pending_confirmation": False,
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
            lower_source = (source_device or "").lower()
            lower_target = (target_device or "").lower()
            if "switch" in lower_source or "switch" in lower_target:
                state.mark_no_storage()

        return (
            f"Your {source_device} trades for ${int(trade_value)}. "
            f"The {target_device} is ${int(retail_price)}. "
            f"Top-up: ${int(top_up)}. {_proceed_prompt()}"
        )

    return (
        f"Sorry, I couldn't find pricing for {source_device} or {target_device}. "
        "Want staff support to check?"
    )


def _maybe_force_reply(message: str) -> Optional[str]:
    if not message:
        return None
    lower = message.lower()

    if any(token in lower for token in ["crypto", "bitcoin", "ethereum", "usdt"]):
        return (
            "Sorry, we don't handle crypto. "
            "We only do electronics in Singapore. Need product help?"
        )

    if "gpu" in lower and any(
        token in lower for token in ["llm", "ai", "chatbot", "training"]
    ):
        return (
            "For local LLMs, best GPU is NVIDIA RTX 4090 24GB. "
            "RTX 4080 is a cheaper option. Want me to check stock?"
        )

    if "warranty" in lower or "covered" in lower or "coverage" in lower:
        return "Are you in Singapore?"

    # General support requests - ask location first
    if any(
        token in lower
        for token in [
            "speak to staff",
            "talk to staff",
            "contact staff",
            "reach support",
            "human support",
            "need help",
            "customer service",
        ]
    ):
        return "Are you in Singapore?"

    # Non-Singapore locations - reject immediately
    if any(
        token in lower
        for token in [
            "malaysia",
            "indonesia",
            "thailand",
            "philippines",
            "vietnam",
            "india",
            "china",
            "hong kong",
            "taiwan",
            "australia",
            "usa",
            "europe",
            "uk",
        ]
    ):
        return "Sorry, Singapore only. We don't ship internationally."

    if "opening hours" in lower or "open hours" in lower or "what time" in lower:
        return "Open daily, 12 to 8:30 pm at Hougang Green—team is on-site then."
    if "opening" in lower or "closing" in lower or "close" in lower:
        if "hour" in lower or "time" in lower:
            return "Open daily, 12 to 8:30 pm at Hougang Green—team is on-site then."

    if "refund" in lower or "return policy" in lower or "returns" in lower:
        return (
            "Refunds: 14-day window on unopened items, 7-day functional warranty on pre-owned. "
            "Full policy is on tradezone dot sg slash returns hyphen policy."
        )

    if "shipping" in lower or "delivery" in lower or "ship" in lower:
        if "same day" in lower or "sameday" in lower or "weekend" in lower:
            return (
                "Shipping is $5, 1-3 business days. No same-day; weekends don't count."
            )
        return "Shipping is $5, 1-3 business days in Singapore."

    if any(token in lower for token in ["ps6", "osmo pocket 4", "pocket 4"]):
        return "Not in stock yet. Want staff support to notify you when available?"

    tradeup = _extract_tradeup_devices(message)
    if tradeup:
        source_device, target_device = tradeup
        return _build_tradeup_price_reply(source_device, target_device)

    device = _extract_tradein_device(message)
    if device:
        return _build_tradein_price_reply(device)

    return None


def _get_last_user_message_from_session(session: Any) -> str:
    ctx = (
        getattr(session, "history", None)
        or getattr(session, "chat_ctx", None)
        or getattr(session, "_chat_ctx", None)
    )
    if not ctx:
        return ""
    items = getattr(ctx, "items", None)
    if items is None:
        items = getattr(ctx, "messages", None)
    if not items:
        return ""
    for msg in reversed(items):
        role = getattr(msg, "role", None)
        if role is None and isinstance(msg, dict):
            role = msg.get("role")
        if role != "user":
            continue
        content = getattr(msg, "text_content", None)
        if content is None:
            content = getattr(msg, "content", None)
        if content is None and isinstance(msg, dict):
            content = msg.get("content") or msg.get("text")
        if isinstance(content, list):
            content = " ".join(str(item) for item in content)
        return str(content) if content else ""
    return ""


def _get_last_user_message_from_chat_ctx(chat_ctx: Any) -> str:
    if not chat_ctx:
        return ""
    items = getattr(chat_ctx, "items", None)
    if items is None:
        items = getattr(chat_ctx, "messages", None)
    if not items:
        return ""
    for msg in reversed(items):
        role = getattr(msg, "role", None)
        if role is None and isinstance(msg, dict):
            role = msg.get("role")
        if role != "user":
            continue
        content = getattr(msg, "text_content", None)
        if content is None:
            content = getattr(msg, "content", None)
        if content is None and isinstance(msg, dict):
            content = msg.get("content") or msg.get("text")
        if isinstance(content, list):
            content = " ".join(str(item) for item in content)
        return str(content) if content else ""
    return ""


def _get_last_assistant_message_from_chat_ctx(chat_ctx: Any) -> str:
    if not chat_ctx:
        return ""
    items = getattr(chat_ctx, "items", None)
    if items is None:
        items = getattr(chat_ctx, "messages", None)
    if not items:
        return ""
    for msg in reversed(items):
        role = getattr(msg, "role", None)
        if role is None and isinstance(msg, dict):
            role = msg.get("role")
        if role != "assistant":
            continue
        content = getattr(msg, "text_content", None)
        if content is None:
            content = getattr(msg, "content", None)
        if content is None and isinstance(msg, dict):
            content = msg.get("content") or msg.get("text")
        if isinstance(content, list):
            content = " ".join(str(item) for item in content)
        return str(content) if content else ""
    return ""


def _chat_ctx_has_tradein_context(chat_ctx: Any) -> bool:
    if not chat_ctx:
        return False
    items = getattr(chat_ctx, "items", None)
    if items is None:
        items = getattr(chat_ctx, "messages", None)
    if not items:
        return False
    for msg in reversed(items):
        role = getattr(msg, "role", None)
        if role is None and isinstance(msg, dict):
            role = msg.get("role")
        if role != "assistant":
            continue
        content = getattr(msg, "text_content", None)
        if content is None:
            content = getattr(msg, "content", None)
        if content is None and isinstance(msg, dict):
            content = msg.get("content") or msg.get("text")
        if isinstance(content, list):
            content = " ".join(str(item) for item in content)
        text = str(content or "").lower()
        if any(
            token in text
            for token in [
                "trade-in",
                "trade in",
                "trades for",
                "top-up",
                "top up",
                "proceed",
            ]
        ):
            return True
    return False


def _chat_ctx_asked_phone(chat_ctx: Any) -> bool:
    if not chat_ctx:
        return False
    items = getattr(chat_ctx, "items", None)
    if items is None:
        items = getattr(chat_ctx, "messages", None)
    if not items:
        return False
    for msg in reversed(items):
        role = getattr(msg, "role", None)
        if role is None and isinstance(msg, dict):
            role = msg.get("role")
        if role != "assistant":
            continue
        content = getattr(msg, "text_content", None)
        if content is None:
            content = getattr(msg, "content", None)
        if content is None and isinstance(msg, dict):
            content = msg.get("content") or msg.get("text")
        if isinstance(content, list):
            content = " ".join(str(item) for item in content)
        text = str(content or "").lower()
        if "contact number" in text or "phone" in text:
            return True
    return False


def _looks_like_name(value: str) -> bool:
    if not value:
        return False
    text = value.strip()
    lower = text.lower()
    common_non_names = {
        "yes",
        "yeah",
        "yup",
        "yep",
        "ok",
        "okay",
        "no",
        "hello",
        "hi",
        "hey",
        "thanks",
        "thank you",
        "please",
        "sure",
        "alright",
    }
    if lower in common_non_names:
        return False
    if "@" in text or any(ch.isdigit() for ch in text):
        return False
    if len(text) < 2 or len(text) > 60:
        return False
    return bool(re.fullmatch(r"[A-Za-z][A-Za-z\\s'\\-\\.]{1,59}", text))


def _looks_like_affirmative(value: str) -> bool:
    if not value:
        return False
    lower = value.strip().lower()
    return lower in {"yes", "yeah", "yep", "yup", "ok", "okay", "sure", "correct"}


def _looks_like_email(value: str) -> bool:
    if not value:
        return False
    return bool(re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}", value))


def _looks_like_phone(value: str) -> bool:
    if not value:
        return False
    digits = re.sub(r"\\D", "", value)
    return len(digits) >= 7


def _chat_ctx_has_support_context(chat_ctx: Any) -> bool:
    if not chat_ctx:
        return False
    items = getattr(chat_ctx, "items", None)
    if items is None:
        items = getattr(chat_ctx, "messages", None)
    if not items:
        return False
    for msg in reversed(items):
        role = getattr(msg, "role", None)
        if role is None and isinstance(msg, dict):
            role = msg.get("role")
        content = getattr(msg, "text_content", None)
        if content is None:
            content = getattr(msg, "content", None)
        if content is None and isinstance(msg, dict):
            content = msg.get("content") or msg.get("text")
        if isinstance(content, list):
            content = " ".join(str(item) for item in content)
        text = str(content or "").lower()
        if "warranty" in text or "staff support" in text or "support" in text:
            return True
    return False


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
    lower_query = (query or "").lower()

    if "gpu" in lower_query and any(
        token in lower_query
        for token in ["llm", "ai", "chatbot", "training", "inference"]
    ):
        return (
            "Best GPU for local LLMs is NVIDIA RTX 4090 24GB. "
            "A cheaper option is RTX 4080 16GB. Want me to check stock?"
        )

    if (
        "basketball" in lower_query
        and "nba" not in lower_query
        and "2k" not in lower_query
    ):
        return (
            "We focus on gaming and electronics. "
            "Do you mean basketball video games like NBA 2K?"
        )

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

                filtered_products = products_data
                budget_query = _is_budget_phone_query(query)
                if products_data and _is_game_query(query):
                    tokens = _tokenize_query(query)
                    filtered_products = [
                        product
                        for product in products_data
                        if _is_game_product(product)
                        and _name_matches_tokens(product.get("name", ""), tokens)
                    ]
                    if not filtered_products:
                        # Return explicit "not found" to trigger Out-of-Stock Protocol (Suggest Alt/Waitlist)
                        return "I checked our catalog but couldn't find that game in stock right now."

                if products_data and budget_query:
                    budget_products = [
                        product
                        for product in products_data
                        if (_get_product_price(product) or 0) <= 300
                    ]
                    if budget_products:
                        filtered_products = budget_products
                    else:
                        prices = [
                            price
                            for price in (
                                _get_product_price(product) for product in products_data
                            )
                            if price is not None
                        ]
                        if prices:
                            cheapest = _format_price(min(prices))
                            return _normalize_voice_currency(
                                f"Cheapest phones start at {cheapest}. Want a higher budget?"
                            )

                summary_products = filtered_products or products_data
                summary = _build_voice_product_summary(summary_products, query=query)
                if summary:
                    logger.warning(
                        f"[searchProducts] ✅ Returning summary: {summary[:200]}"
                    )
                    return _normalize_voice_currency(summary)

                answer = _normalize_voice_currency(answer)
                if not products_data and answer:
                    lower_answer = answer.lower()
                    if "couldn't find" in lower_answer or "no products" in lower_answer:
                        return (
                            "Sorry, nothing in stock for that. "
                            "Want staff support or try something else?"
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
        # Voice-safe wording: "100 dollars" not "$100" (TTS-friendly)
        price_int = int(price)
        logger.info(f"[check_tradein_price] ✅ Found: ${price_int}")
        return f"Yes, we trade this. Price is {price_int} dollars. Want to proceed?"
    else:
        logger.warning(f"[check_tradein_price] ⚠️ No price found for: {device_name}")
        return (
            f"I couldn't find a trade-in price for {device_name}. "
            "Want staff support to check it?"
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
        if source_device:
            return f"Got it—trade-in {source_device}. Condition?"
        return "Which device do you want to trade in?"

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
                # Fallback for test environments
                session_id = "test-session-agent"

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

            suffix = " 🚨 SYSTEM RULE: After the user answers, you MUST call calculate_tradeup_pricing again with the clarified device name(s) BEFORE asking 'Do you want to proceed?'."

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
                # Fallback for test environments
                session_id = "test-session-agent"

            next_question = "Storage size?"
            if session_id:
                existing_ctx = _tradeup_context.get(session_id)
                if existing_ctx:
                    prev_source = (
                        (existing_ctx.get("source_device") or "").strip().lower()
                    )
                    prev_target = (
                        (existing_ctx.get("target_device") or "").strip().lower()
                    )
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
                f"Your {source_device} trades for ${int(trade_value)}. "
                f"The {target_device} is ${int(retail_price)}. "
                f"Top-up: ${int(top_up)}. {_proceed_prompt()} "
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
        # Fallback for test environments - use a consistent test session ID
        session_id = "test-session-agent"
        logger.warning(
            f"[tradein_update_lead] No room context (test mode?), using fallback session_id: {session_id}"
        )

    if not session_id:
        logger.error("[tradein_update_lead] ❌ No session_id available!")
        return "Failed to save details - session not found. Please try again."

    # Use per-session checklist state
    state = _get_checklist(session_id)

    if photos_acknowledged is not None:
        last_utterance = (_last_user_utterance.get(session_id) or "").strip().lower()
        if last_utterance not in (
            "yes",
            "yeah",
            "yep",
            "ok",
            "okay",
            "sure",
            "no",
            "nope",
            "nah",
        ):
            photos_acknowledged = None

    if contact_name and "name" in state.collected_data:
        existing_name = str(state.collected_data.get("name") or "").strip()
        existing_ok = _is_valid_contact_name(existing_name)
        incoming_ok = _is_valid_contact_name(contact_name)
        if (
            existing_ok
            and incoming_ok
            and existing_name.lower() != str(contact_name).strip().lower()
        ):
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
        if (
            existing_email
            and existing_email.lower() != str(contact_email).strip().lower()
        ):
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
                    if contact_name:
                        state.pending_contact["name"] = contact_name
                    contact_name = None
                elif field == "phone":
                    if contact_phone:
                        state.pending_contact["phone"] = contact_phone
                    contact_phone = None
                elif field == "email":
                    if contact_email:
                        state.pending_contact["email"] = contact_email
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

    # NEW FLOW: contact comes after storage + condition + accessories + photos.
    # 🚨 RELAXATION: If contact info is being provided, but photos weren't explicitly marked (e.g. agent skipped tool call),
    # assume photos are done/skipped to prevent blocking the entire save.
    if (contact_name or contact_phone or contact_email) and not (photos_in_payload or "photos" in state.collected_data):
        logger.warning("[tradein_update_lead] 📸 Contact info provided without photo step. Auto-resolving photos as acknowledged.")
        photos_acknowledged = True
        photos_in_payload = True

    will_have_storage = (
        storage_in_payload or "storage" in state.collected_data or state.skip_storage
    )
    will_have_condition = condition_in_payload or "condition" in state.collected_data
    will_have_accessories = (
        accessories_in_payload or "accessories" in state.collected_data
    )
    will_have_photos = photos_in_payload or "photos" in state.collected_data

    ready_after_payload = (
        will_have_storage
        and will_have_condition
        and will_have_accessories
        and will_have_photos
    )

    blocked_contact_fields = []

    def _contact_allowed(field_name: str) -> bool:
        return ready_after_payload or field_name in state.collected_data

    if contact_name and not _contact_allowed("name"):
        blocked_contact_fields.append("name")
        state.pending_contact["name"] = contact_name
        contact_name = None
    if contact_phone and not _contact_allowed("phone"):
        blocked_contact_fields.append("phone")
        state.pending_contact["phone"] = contact_phone
        contact_phone = None
    if contact_email and not _contact_allowed("email"):
        blocked_contact_fields.append("email")
        state.pending_contact["email"] = contact_email
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
        # Fallback for test environments
        session_id = "test-session-agent"
        logger.warning(
            f"[tradein_submit_lead] No room context (test mode?), using fallback session_id: {session_id}"
        )

    if session_id:
        try:
            state = _get_checklist(session_id)

            # 🔴 CRITICAL: Validate brand and model FIRST (blocks 400 errors)
            has_brand = (
                "brand" in state.collected_data and state.collected_data["brand"]
            )
            has_model = (
                "model" in state.collected_data and state.collected_data["model"]
            )

            if not has_brand or not has_model:
                logger.error(
                    "[tradein_submit_lead] 🚫 BLOCKED: Missing brand/model! "
                    f"brand={state.collected_data.get('brand')}, model={state.collected_data.get('model')}"
                )
                return (
                    "Cannot submit — device brand and model are missing. "
                    "This is a technical issue. Please ask the customer to contact staff directly."
                )

            # Validate required contact fields
            missing = [
                key
                for key in ("name", "phone", "email")
                if key not in state.collected_data
            ]
            if missing:
                next_question = state.get_next_question()
                logger.warning(
                    "[tradein_submit_lead] 🚫 Blocked submit: missing=%s progress=%s",
                    missing,
                    state.get_progress(),
                )
                if next_question:
                    return (
                        f"Cannot submit yet — missing {', '.join(missing)}. "
                        f"Ask the customer: {next_question}"
                    )
                return (
                    f"Cannot submit yet — missing {', '.join(missing)}. "
                    "Please collect the missing contact details first."
                )
        except Exception as e:
            logger.error(f"[tradein_submit_lead] ❌ Failed checklist guard: {e}")

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
            return "Submit failed — please retry"


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
        # Fallback for test environments
        session_id = "test-session-agent"
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

    # Exact questions to ask - NO deviation allowed
    QUESTIONS = {
        "storage": "Storage size?",
        "condition": "Condition? Mint, good, fair, or faulty?",
        "accessories": "Got the box?",
        "photos": "Photos help. Want to send one?",
        "name": "Your name?",
        "phone": "Phone number?",
        "email": "Email address?",
        "payout": "Cash, PayNow, bank, or installments?",
        "recap": "recap",  # Special: triggers summary
        "submit": "submit",  # Special: triggers submission
    }

    # Acknowledgments for each step (said BEFORE asking next question)
    ACKNOWLEDGMENTS = {
        "storage": "Got it.",
        "condition": "Noted.",
        "accessories": "Okay.",
        "photos": "Go ahead, send it.",  # Special: wait for upload
        "photos_no": "No problem.",  # If user says no to photos
        "name": "Thanks!",
        "phone": "Got it.",
        "email": "Noted.",
        "payout": "Okay.",
    }

    def __init__(self):
        self.current_step_index = 0
        self.collected_data = {}
        self.pending_contact = {}
        self.is_trade_up = False
        self.completed = False
        self.skip_storage = (
            False  # For devices without storage (cameras, accessories, etc.)
        )

    def _apply_pending_contact_for_current_step(self) -> bool:
        """Apply any pending contact data when we reach the contact steps.

        Returns True if we applied something (which can advance steps).
        """
        current_step = (
            self.STEPS[self.current_step_index]
            if self.current_step_index < len(self.STEPS)
            else None
        )
        if current_step not in ("name", "phone", "email"):
            return False

        if current_step == "name" and "name" not in self.collected_data:
            value = self.pending_contact.get("name")
            if value and self.can_collect_contact("name"):
                self.mark_field_collected("name", value)
                return True
        if current_step == "phone" and "phone" not in self.collected_data:
            value = self.pending_contact.get("phone")
            if value and self.can_collect_contact("phone"):
                self.mark_field_collected("phone", value)
                return True
        if current_step == "email" and "email" not in self.collected_data:
            value = self.pending_contact.get("email")
            if value and self.can_collect_contact("email"):
                self.mark_field_collected("email", value)
                return True

        return False

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

        # If we have pending contact info, auto-apply it when we reach contact steps
        try:
            if self._apply_pending_contact_for_current_step():
                return self.get_current_step()
        except Exception as e:
            logger.error(f"[ChecklistState] ❌ Failed applying pending contact: {e}")

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

    def get_forced_response(
        self, just_collected_step: str = None, user_said_no_photos: bool = False
    ) -> str:
        """
        Get the EXACT response the agent must say.
        This is the state machine - no LLM freedom allowed.
        Returns: "Acknowledgment. Next question?" or just "Next question?" if no ack needed.
        """
        current_step = self.get_current_step()

        if current_step == "completed":
            return None

        # Build response: acknowledgment (if we just collected something) + next question
        parts = []

        # Add acknowledgment for what was just collected
        if just_collected_step:
            if just_collected_step == "photos" and user_said_no_photos:
                ack = self.ACKNOWLEDGMENTS.get("photos_no", "Okay.")
            elif just_collected_step == "photos":
                # User said yes to photos - just acknowledge and WAIT (no next question yet)
                return self.ACKNOWLEDGMENTS.get("photos", "Go ahead, send it.")
            else:
                ack = self.ACKNOWLEDGMENTS.get(just_collected_step, "Got it.")
            parts.append(ack)

        # Add next question
        next_q = self.QUESTIONS.get(current_step)
        if next_q and next_q not in ("recap", "submit"):
            parts.append(next_q)

        return " ".join(parts) if parts else None

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
- 🔴 **ONE QUESTION PER TURN - CRITICAL**: Ask exactly ONE question, then STOP and WAIT for the answer. NEVER combine questions like "Send photo. Meanwhile, what's your name?" - this breaks the flow. After asking about photos, WAIT for user to respond before asking name. Each step must be completed before moving to the next.
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
    * Example - Text shows: "Xbox Series X - $699 [View Product](https://...) [image]" / Voice says: "Xbox Series X, $699"
  - Contact info: Write in text, but just say "Got it" (≤3 words)
  - Confirmations: Display all details in text chat, then ask "Everything correct?" - let user READ and confirm visually
  - This avoids annoying voice readback that users can't stop

- Start every call with a short greeting that mentions electronics, gaming, trade-ins, and staff support. Wait for a clear choice before running any tools.
- After that opening line, stay silent until the caller finishes. If they say "hold on" or "thanks", answer "Sure—take your time" and pause; never stack extra clarifying questions until they actually ask something.
- If user says "trade in my {device}" without a target device, treat as price-only: call check_tradein_price for that device, then ask if they want to proceed. Do NOT ask for condition or accessories before they confirm.
- If you detect trade/upgrade intent with a target device, FIRST confirm both devices: "Confirm: trade {their device} for {target}?" Wait for a clear yes. Only then fetch prices, compute top-up, and continue the checklist.
- 🔴 PRICE-ONLY REQUESTS (no target device): If caller says "trade in my {DEVICE}" / "what's my {DEVICE} worth" / "trade-in price for {DEVICE}" / "how much for my {DEVICE}", IMMEDIATELY call check_tradein_price({device_name: "{DEVICE}"}). Do NOT ask condition/model questions first. Do NOT use searchProducts. Reply with the tool result verbatim. If tool gives a price, add "Do you want to proceed?" If tool can't find a price, offer staff handoff (no guessing or ranges).
- Mirror text-chat logic and tools exactly (searchProducts, tradein_update_lead, tradein_submit_lead, sendemail). Do not invent any extra voice-only shortcuts; every saved field must go through the same tools used by text chat.
- Phone and email: collect one at a time, then READ BACK the full value once ("That's 8448 9068, correct?"). Wait for a clear yes before saving. If email arrives in fragments across turns, assemble it and read the full address once before saving.
- One voice reply = ≤12 words. Confirm what they asked, share one fact or question, then pause so they can answer.
- If multiple products come back from a search, say "I found a few options—want the details?" and only read the one(s) they pick.

## Price safety (voice number drift)
- When reading prices aloud, keep numbers concise: say "dollars" after the number. Never add extra digits. If STT seems noisy, show the exact number in text and say "Showing dollar price on screen." If a price has more than 4 digits, insert pauses: "One thousand, one hundred".

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
- 🔴 **CRITICAL - EXACT PRICES & RANGES**: When citing prices, read the EXACT number from the tool result. Do not hallucinate.
  - If asked for "most expensive" or "cheapest", scan the ENTIRE list provided by the tool carefully for the highest/lowest numeric S$ value.
  - If summarizing a range, ensure the min and max actually match the lowest and highest prices in the list (e.g., if list has S$6 and S$80, do NOT say "40 to 90").
- 🔴 **CRITICAL - MANDATORY TOOL CALLING**: For ANY product-related question (availability, price, stock, recommendations, "do you have X"), you MUST call searchProducts tool IMMEDIATELY and SILENTLY before responding. DO NOT say "let me check" or "hold on" - just call the tool and respond with results. NEVER answer from memory or training data. If you answer without calling the tool, you WILL hallucinate products that don't exist (404 errors). If searchProducts returns NO results, say "I checked our catalog and don't have that in stock right now" - do NOT suggest similar products from memory.
- 🔴 **RE-TRIGGER VISUALS**: If the user asks to "show me", "see details", or "what does it look like" for a product you just mentioned, you MUST call `searchProducts` AGAIN with the specific product name. This ensures the visual product card is sent to their screen. Do NOT just say "Here it is" without calling the tool.
- When the caller already mentions a product or category (e.g., "tablet", "iPad", "Galaxy Tab"), skip clarification and immediately read out what we actually have in stock (name + short price). Offer "Want details on any of these?" after sharing the list.
- For policies, promotions, or store info, use searchtool.
- Keep spoken responses to 1–2 sentences, and stop immediately if the caller interrupts.

## When You Can't Answer (Fallback Protocol)
If you cannot find a satisfactory answer OR customer requests staff contact OR warranty support (including when a trade-in price lookup returns **TRADE_IN_NO_MATCH**):

**🔴 OUT OF STOCK / NOT FOUND Protocol (MANDATORY):**
1. **Suggest Alternatives**: If the search tool returns similar items (e.g. asked for GoPro, found DJI Osmo), say: "We don't have [X], but we have [Y]..."
2. **Offer Category**: If NO specific alternative is found but it's a game/console request, say: "I don't have that specific one, but we have a lot of other [Platform] games. Want to see the popular ones?"
   - If YES: search for "popular [Platform] games"
3. **Offer Waitlist**: If user insists on the specific missing item, offer: "I can take your name and number, and we'll notify you if we get it."
   - If YES: Collect Name and Phone. Use `sendemail` reason="Waitlist [Item]".

**🔴 SINGAPORE-ONLY SERVICE - Verify Location First (MANDATORY for Support/Warranty):**
1. **ALWAYS ask location FIRST** unless user EXPLICITLY says "I'm in Singapore" or "from Singapore"
2. Ask ONCE: "Are you in Singapore?" (≤5 words)
   - If NO: "Sorry, Singapore only." → END conversation
   - If YES: Continue to collect contact info.

🔴 **CRITICAL:** Warranty questions, support requests, or "I can't find X" do NOT count as location confirmation. You MUST ask "Are you in Singapore?" before proceeding with a support ticket.

3. Collect info (one at a time):
   - Reason/issue (required)
   - Email (required)
   - Name (required)
   - Phone (optional but preferred)
   - If email sounds unclear, confirm: "So that's [email]?" then WAIT

4. Use sendemail tool IMMEDIATELY with reason + name + email (and phone if provided)
   - Message must include: "Reason: {reason}" plus any key details

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
1. ✅ Ask storage (if not mentioned): "Storage size?" → WAIT for answer
2. ✅ Ask condition: "Condition? Mint, good, fair, or faulty?" → WAIT for answer
3. ✅ Ask accessories: "Got the box?" → WAIT for answer
4. ✅ Ask for photo: "Photos help—want to send one?" → WAIT for answer
   - If YES: Say "Go ahead, send it." then WAIT silently for upload. Do NOT ask name yet!
   - If NO: Say "No problem." then call tradein_update_lead(photos_acknowledged=False)
5. ✅ Call tradein_update_lead after EACH answer - ONE step at a time!

🔴 **PHOTO STEP CRITICAL**: When user says "yes" to photos, ONLY say "Go ahead, send it." and WAIT. Do NOT say "Meanwhile, what's your name?" - that skips ahead and breaks the flow!

**Step 7: Collect Contact Info** (ONLY after photos step is complete!)
6. ✅ Ask name: "Your name?"
7. ✅ Ask phone: "Phone number?" → repeat back for confirmation
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
Agent: "MSI Claw trades $300. PS5 Pro $900. Top-up: $600. Do you want to proceed?" [WAIT]
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
Agent: "Phone number?" [WAIT]
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
- ALWAYS call tradein_update_lead after each detail collected

## 🔄 SIMPLE TRADE-IN FLOW (Price Quote → Proceed)

When user says "trade in my {DEVICE}" / "how much for my {DEVICE}" (NO target device):

**Step 1: Get Price** (≤8 words)
🔴 IMMEDIATELY call check_tradein_price({device_name: "{DEVICE}"})
- Tool returns price OR "TRADE_IN_NO_MATCH"

**Step 2: Announce Price** (≤12 words) 🔴 CRITICAL FORMAT
✅ CORRECT: "Yes, we trade this. Price is {amount} dollars. Want to proceed?"
❌ WRONG: "Trade-in value is S${amount}" (bad TTS)
❌ WRONG: Skipping price announcement
❌ WRONG: Not asking for confirmation

Example:
- User: "Trade in my PS4 Pro 1TB"
- Agent: [check_tradein_price("PS4 Pro 1TB")]
- Agent: "Yes, we trade this. Price is 100 dollars. Want to proceed?"

**Step 3: Wait for Confirmation**
- If NO: "No problem! Need anything else?"
- If YES: Continue to Step 4

**Step 4: Collect Device Details** (ONE question at a time - CRITICAL!)
🔴 FOLLOW EXACT ORDER - DO NOT SKIP OR COMBINE:

1. Storage (if not mentioned): "Storage size?" → WAIT
   - Call tradein_update_lead(storage="{answer}")

2. Condition: "Condition? Mint, good, fair, or faulty?" → WAIT
   - Call tradein_update_lead(condition="{answer}")

3. Accessories: "Got the box?" → WAIT
   - Call tradein_update_lead(accessories="{answer}" OR notes="Has box")

4. Photos: "Photos help. Want to send one?" → WAIT
   - If YES: "Go ahead, send it." → WAIT for upload (DO NOT ask next question yet!)
   - If NO: Call tradein_update_lead(photos_acknowledged=False) → Continue

🔴 **PHOTO STEP CRITICAL**:
- When user says YES to photos, ONLY say "Go ahead, send it."
- DO NOT say "Meanwhile, what's your name?" - this breaks the flow!
- WAIT silently for photo upload or user to say "done"/"skip"
- Then move to contact collection

**Step 5: Collect Contact Info** (ONLY after photos step complete!)

5. Email: "Email for the quote?" → WAIT
   - Repeat back: "So that's {email}, correct?" → WAIT for yes
   - Call tradein_update_lead(contact_email="{email}")

6. Phone: "Phone number?" → WAIT
   - Repeat back: "That's {phone}, correct?" → WAIT for yes
   - Call tradein_update_lead(contact_phone="{phone}")

7. Name: "Your name?" → WAIT
   - Call tradein_update_lead(contact_name="{name}")

8. Payout: "Cash, PayNow, bank, or installments?" → WAIT
   - Call tradein_update_lead(preferred_payout="{payout}")

**Step 6: Recap** (≤20 words for voice!)
"{DEVICE} {CONDITION}, {ACCESSORIES}. {NAME}, {PHONE}, email noted. {PAYOUT}. Correct?"

**Step 7: Submit**
- User confirms: Call tradein_submit_lead()
- Agent: "Done! We'll contact you soon. Anything else?"

**Example - CORRECT FLOW ✅:**
User: "Trade in my PS4 Pro 1TB"
Agent: [check_tradein_price("PS4 Pro 1TB")]
Agent: "Yes, we trade this. Price is 100 dollars. Want to proceed?" [WAIT]
User: "Yes"
Agent: "Condition? Mint, good, fair, or faulty?" [WAIT - storage already mentioned]
User: "Good"
Agent: [tradein_update_lead(condition="good")]
Agent: "Got the box?" [WAIT]
User: "Yes"
Agent: [tradein_update_lead(notes="Has box")]
Agent: "Photos help. Want to send one?" [WAIT]
User: "No"
Agent: [tradein_update_lead(photos_acknowledged=False)]
Agent: "Email for the quote?" [WAIT]
User: "bobby@hotmail.com"
Agent: "So that's bobby@hotmail.com, correct?" [WAIT]
User: "Yes"
Agent: [tradein_update_lead(contact_email="bobby@hotmail.com")]
Agent: "Phone number?" [WAIT]
User: "84489068"
Agent: "That's 84489068, correct?" [WAIT]
User: "Yes"
Agent: [tradein_update_lead(contact_phone="84489068")]
Agent: "Your name?" [WAIT]
User: "Bobby"
Agent: [tradein_update_lead(contact_name="Bobby")]
Agent: "Cash, PayNow, bank, or installments?" [WAIT]
User: "Cash"
Agent: [tradein_update_lead(preferred_payout="cash")]
Agent: "PS4 Pro good, with box. Bobby, 84489068, email noted. Cash. Correct?" [WAIT]
User: "Yes"
Agent: [tradein_submit_lead()]
Agent: "Done! We'll contact you soon. Anything else?"

**Example - WRONG ❌:**
Agent: "Condition? Also, got the box?" ← NO! One question at a time!
Agent: "Send photos. Meanwhile, what's your name?" ← NO! Wait for photos first!
Agent: [Submits without collecting all required fields] ← NO! Must validate first!

**🔴 CRITICAL RULES:**
- ONE question per response - NEVER combine multiple questions
- ALWAYS announce price in format: "Yes, we trade this. Price is X dollars. Want to proceed?"
- ALWAYS wait for user confirmation before starting detail collection
- ALWAYS collect fields in order: storage → condition → accessories → photos → email → phone → name → payout
- ALWAYS repeat back contact info for confirmation
- NEVER skip the photo prompt
- ALWAYS do recap before submission
- NEVER submit without brand/model validation (if missing, ask staff handoff)""",
        )

    def llm_node(self, chat_ctx, tools, model_settings):
        # Deterministic trade-in price-only response (no target device).
        last_user = _get_last_user_message_from_chat_ctx(chat_ctx)
        if last_user:
            forced = _maybe_force_reply(last_user)
            if forced:

                async def _forced():
                    yield forced

                return _forced()
            last_assistant = _get_last_assistant_message_from_chat_ctx(chat_ctx)
            if last_assistant:
                last_lower = last_assistant.lower()
                if _chat_ctx_has_support_context(chat_ctx):
                    if "in singapore" in last_lower and _looks_like_affirmative(
                        last_user
                    ):

                        async def _ask_support_name():
                            yield "Your name?"

                        return _ask_support_name()
                    if (
                        "your name" in last_lower or "name?" in last_lower
                    ) and _looks_like_name(last_user):

                        async def _ask_support_phone():
                            yield "Phone number?"

                        return _ask_support_phone()
                    if (
                        "contact number" in last_lower
                        or "phone" in last_lower
                        or ("contact" in last_lower and "number" in last_lower)
                    ) and _looks_like_phone(last_user):

                        async def _ask_support_email():
                            yield "Email address?"

                        return _ask_support_email()
                    if "email" in last_lower and _looks_like_email(last_user):

                        async def _confirm_support_email():
                            yield f"So that's {last_user.strip()}, correct?"

                        return _confirm_support_email()

                if (
                    "name" in last_lower
                    and "email" not in last_lower
                    and "phone" not in last_lower
                ):

                    async def _ask_phone():
                        yield "Thanks! Phone number?"

                    return _ask_phone()
                if (
                    "contact number" in last_lower
                    or "phone" in last_lower
                    or ("contact" in last_lower and "number" in last_lower)
                ):

                    async def _ask_email():
                        yield "Got it. Email address?"

                    return _ask_email()
            if (
                _looks_like_name(last_user)
                and _chat_ctx_has_tradein_context(chat_ctx)
                and not _chat_ctx_asked_phone(chat_ctx)
            ):

                async def _ask_phone_after_name():
                    yield "Thanks! Phone number?"

                return _ask_phone_after_name()
            tradeup = _extract_tradeup_devices(last_user)
            if not tradeup:
                tradein_device = _extract_tradein_device(last_user)
                if tradein_device:

                    async def _single():
                        yield _build_tradein_price_reply(tradein_device)

                    return _single()
                if last_assistant:
                    last_lower = last_assistant.lower()
                    if last_lower.startswith("which ") and "?" in last_lower:
                        device_reply = last_user.strip()
                        if device_reply:

                            async def _variant():
                                yield _build_tradein_price_reply(device_reply)

                            return _variant()
        return Agent.default.llm_node(self, chat_ctx, tools, model_settings)

    async def on_enter(self):
        await self.session.generate_reply(
            instructions=f"""Greet the user: "{_greeting_prompt()}" """,
            allow_interruptions=True,
        )


# ============================================================================
# SERVER SETUP
# ============================================================================

server = AgentServer()


def prewarm(proc: JobProcess):
    """Preload VAD model for better performance"""
    if not SILERO_AVAILABLE:
        logger.warning("[Voice Agent] Silero VAD not available; skipping prewarm")
        proc.userdata["vad"] = None
        return
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
        vad = ctx.proc.userdata.get("vad")
        session_kwargs = dict(
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
                # Increase speed for more dynamic feel (1.0 = normal, 1.1-1.2 = slightly faster)
                speed=float(os.getenv("VOICE_TTS_SPEED", "1.15")),
            ),
            turn_detection=MultilingualModel(),
            preemptive_generation=False,  # listen for full turn before speaking
        )
        if vad is not None:
            session_kwargs["vad"] = vad
        session = AgentSession(**session_kwargs)

    # Event handlers for dashboard logging
    @session.on("user_input_transcribed")
    def on_user_input(event):
        """Capture user's final transcribed message and auto-save data"""
        nonlocal conversation_buffer
        if event.is_final:  # Only capture final transcripts
            conversation_buffer["user_message"] = event.transcript
            conversation_buffer["order_failsafe_sent"] = False
            conversation_buffer["quote_failsafe_sent"] = False
            conversation_buffer["step_failsafe_sent"] = False
            _last_user_utterance[room_name] = event.transcript
            lower_user = (event.transcript or "").strip().lower()
            forced_reply = _maybe_force_reply(event.transcript or "")
            if forced_reply:
                conversation_buffer["forced_reply_override"] = forced_reply
            if lower_user in (
                "yes",
                "yeah",
                "yep",
                "ok",
                "okay",
                "sure",
                "no",
                "nope",
                "nah",
                "correct",
            ):
                _awaiting_recap_confirmation[room_name] = False
            logger.info(f"[Voice] User said: {event.transcript}")

            # 🔴 PROCEED CONFIRMATION: Detect when user confirms they want to proceed with trade-in
            checklist_for_proceed = _get_checklist(room_name)
            bot_prompt = (conversation_buffer.get("bot_response") or "").lower()
            is_proceed_prompt = any(
                phrase in bot_prompt
                for phrase in [
                    "want to proceed",
                    "proceed?",
                    "shall i proceed",
                    "proceed now",
                    "continue with trade-in",
                ]
            )
            user_said_yes = lower_user in (
                "yes",
                "yeah",
                "yep",
                "ok",
                "okay",
                "sure",
                "yes.",
                "let's do it",
                "lets do it",
            )
            user_said_no = lower_user in ("no", "nope", "nah", "no.", "skip", "later")

            # 🚨 CRITICAL FIX: Only activate trade-in flow AFTER user confirms "Want to proceed?"
            if is_proceed_prompt and not checklist_for_proceed.collected_data.get(
                "initial_quote_given"
            ):
                if user_said_yes:
                    # User confirmed! NOW activate the trade-in flow
                    checklist_for_proceed.collected_data["initial_quote_given"] = True
                    checklist_for_proceed.collected_data["quote_timestamp"] = (
                        datetime.utcnow().isoformat()
                    )
                    logger.warning(
                        f"[ProceedConfirm] ✅ User confirmed trade-in! Setting initial_quote_given=True. This activates auto-extraction."
                    )
                    # Persist to database
                    asyncio.create_task(
                        _persist_quote_flag(
                            room_name,
                            checklist_for_proceed.collected_data.get("quote_timestamp"),
                        )
                    )
                elif user_said_no:
                    logger.info(
                        f"[ProceedConfirm] ❌ User declined trade-in. Flow will not activate."
                    )

            # Trade-in only intent should NOT activate flow until user accepts price

            # 🔴 PHOTO WAIT STATE: Detect when user says yes to photos and enter waiting mode
            is_photo_prompt = "photo" in bot_prompt or "picture" in bot_prompt

            if is_photo_prompt and checklist_for_proceed.get_current_step() == "photos":
                if user_said_yes:
                    _waiting_for_photo[room_name] = True
                    logger.warning(
                        f"[PhotoWait] 📸 User said YES to photos - entering WAIT mode. Agent should NOT ask more questions!"
                    )
                elif user_said_no:
                    _waiting_for_photo[room_name] = False
                    logger.info(f"[PhotoWait] User said NO to photos - continuing flow")

            # Detect if user mentions uploading/sending photo - exit wait mode
            if (
                "upload" in lower_user
                or "sent" in lower_user
                or "sending" in lower_user
                or "done" in lower_user
            ):
                if _waiting_for_photo.get(room_name):
                    _waiting_for_photo[room_name] = False
                    logger.warning(
                        f"[PhotoWait] 📸 User mentioned upload/done - exiting WAIT mode"
                    )

            # AUTO-SAVE: Extract and save data from user message
            checklist = _get_checklist(room_name)
            logger.info(
                f"[AutoSave] Triggering auto-save for session {room_name}, message: {event.transcript[:100]}"
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
                    last_bot_prompt=conversation_buffer.get("bot_response"),
                )
            )

            # 🔥 STATE MACHINE: Force exact response based on what was extracted
            extracted = extract_data_from_message(
                event.transcript, checklist, conversation_buffer.get("bot_response")
            )

            # 🔴 STATE MACHINE ENFORCER: Generate forced response
            if extracted and checklist.collected_data.get("initial_quote_given"):
                # Determine what step was just collected
                just_collected = None
                user_said_no_photos = False

                if "condition" in extracted:
                    just_collected = "condition"
                elif "accessories" in extracted:
                    just_collected = "accessories"
                elif "photos_acknowledged" in extracted:
                    just_collected = "photos"
                    user_said_no_photos = not extracted.get("photos_acknowledged", True)
                elif "contact_name" in extracted or "name" in extracted:
                    just_collected = "name"
                elif "contact_phone" in extracted:
                    just_collected = "phone"
                elif "contact_email" in extracted:
                    just_collected = "email"
                elif "payout" in extracted:
                    just_collected = "payout"
                elif "storage" in extracted:
                    just_collected = "storage"

                if just_collected:
                    forced_response = checklist.get_forced_response(
                        just_collected, user_said_no_photos
                    )
                    if forced_response:
                        logger.warning(
                            f"[StateMachine] 🎯 FORCING response: '{forced_response}' (collected: {just_collected})"
                        )
                        conversation_buffer["forced_next_response"] = forced_response
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
        if hasattr(event.item, "role") and event.item.role == "user":
            content = ""
            if hasattr(event.item, "content") and event.item.content:
                content = event.item.content
                if isinstance(content, list):
                    content = " ".join(str(item) for item in content)
                else:
                    content = str(content)
            elif hasattr(event.item, "text_content"):
                content = event.item.text_content or ""
            if content:
                conversation_buffer["user_message"] = content
                _last_user_utterance[room_name] = content
                forced_reply = _maybe_force_reply(content)
                if forced_reply:
                    conversation_buffer["forced_reply_override"] = forced_reply
                tradeup = _extract_tradeup_devices(content)
                if tradeup:
                    source_device, target_device = tradeup
                    conversation_buffer["pending_tradeup"] = {
                        "source": source_device,
                        "target": target_device,
                    }
                    _tradeup_context[room_name] = {
                        "source_device": source_device,
                        "target_device": target_device,
                        "pending_confirmation": True,
                    }
            return
        # Check if this is an assistant message
        if hasattr(event.item, "role") and event.item.role == "assistant":
            if hasattr(event.item, "content") and event.item.content:
                # Convert content to string (it may be a list)
                content = event.item.content
                if isinstance(content, list):
                    content = " ".join(str(item) for item in content)
                last_user = conversation_buffer.get(
                    "user_message"
                ) or _last_user_utterance.get(room_name)
                if not last_user:
                    last_user = _get_last_user_message_from_session(session)
                if last_user:
                    conversation_buffer["user_message"] = last_user
                    _last_user_utterance[room_name] = last_user
                    last_user_lower = last_user.lower()
                    if not conversation_buffer.get("forced_reply_override"):
                        forced_reply = _maybe_force_reply(last_user)
                        if forced_reply:
                            conversation_buffer["forced_reply_override"] = forced_reply
                    if not conversation_buffer.get("forced_reply_override"):
                        tradeup = _extract_tradeup_devices(last_user)
                        if tradeup:
                            source_device, target_device = tradeup
                            forced_tradeup = _build_tradeup_price_reply(
                                source_device, target_device, room_name
                            )
                            if forced_tradeup:
                                conversation_buffer["forced_reply_override"] = (
                                    forced_tradeup
                                )
                        else:
                            tradein_device = _extract_tradein_device(last_user)
                            if tradein_device:
                                conversation_buffer["forced_reply_override"] = (
                                    _build_tradein_price_reply(tradein_device)
                                )
                    pending_tradeup = conversation_buffer.get("pending_tradeup") or {}
                    tradeup_ctx = _tradeup_context.get(room_name) or {}
                    if (
                        pending_tradeup
                        and tradeup_ctx.get("pending_confirmation")
                        and last_user_lower
                        in {"yes", "yep", "yeah", "sure", "ok", "okay"}
                    ):
                        forced_tradeup = _build_tradeup_price_reply(
                            pending_tradeup.get("source", ""),
                            pending_tradeup.get("target", ""),
                            room_name,
                        )
                        if forced_tradeup:
                            conversation_buffer["forced_reply_override"] = (
                                forced_tradeup
                            )
                            tradeup_ctx["pending_confirmation"] = False
                            _tradeup_context[room_name] = tradeup_ctx
                forced_reply = conversation_buffer.get("forced_reply_override")
                if forced_reply:
                    content = forced_reply
                    conversation_buffer["forced_reply_override"] = None
                content = _normalize_voice_currency(content)
                last_user_lower = (last_user or "").lower()
                # 🚨 REMOVED: Basketball check logic removed to allow synonym expansion to "NBA 2K"
                if "gpu" in last_user_lower and any(
                    token in last_user_lower
                    for token in ["llm", "ai", "chatbot", "training"]
                ):
                    if not any(
                        token in content.lower()
                        for token in ["4090", "rtx", "nvidia", "a100", "h100"]
                    ):
                        content = (
                            "For local LLMs, NVIDIA RTX 4090 24GB is best. "
                            "RTX 4080 is a cheaper option. Want me to check stock?"
                        )
                if (
                    ("couldn't find" in content.lower())
                    or ("could not find" in content.lower())
                    or ("not in stock" in content.lower())
                ) and "what do you want to do next" not in content.lower():
                    content = content.rstrip()
                    if not content.endswith("?"):
                        content = content.rstrip(".") + "."
                    content = f"{content} What do you want to do next?"
                try:
                    event.item.content = [content]
                    if hasattr(event.item, "text_content"):
                        event.item.text_content = content
                except Exception:
                    pass
                conversation_buffer["bot_response"] = content
                logger.info(f"[Voice] Agent said: {event.item.content}")

                try:
                    checklist = _get_checklist(room_name)
                    progress = checklist.get_progress()
                    has_quote = bool(
                        checklist.collected_data.get("initial_quote_given")
                    )
                    has_prices = all(
                        k in checklist.collected_data
                        for k in (
                            "source_price_quoted",
                            "target_price_quoted",
                            "top_up_amount",
                        )
                    )

                    current_step = checklist.get_current_step()
                    next_question = checklist.get_next_question()
                    lower = content.lower()

                    # 🔴 STATE MACHINE: Check if we have a forced response waiting
                    forced_response = conversation_buffer.get("forced_next_response")
                    if forced_response and has_quote:
                        # Check if agent said something different than what we want
                        agent_said_correct = (
                            forced_response.lower() in lower
                            or lower in forced_response.lower()
                        )

                        # Detect if agent is asking multiple questions or wrong question
                        has_multiple_questions = lower.count("?") > 1
                        mentions_name = (
                            "your name" in lower or "what's your name" in lower
                        )
                        mentions_phone = "contact number" in lower or "phone" in lower
                        mentions_email = "email" in lower

                        # If agent asked multiple questions or wrong question, force correct one
                        if has_multiple_questions or (
                            not agent_said_correct and "?" in content
                        ):
                            logger.warning(
                                f"[StateMachine] 🚨 Agent deviated! Said: '{content[:60]}...' Expected: '{forced_response}'"
                            )
                            if not conversation_buffer.get(
                                "state_machine_override_sent"
                            ):
                                conversation_buffer["state_machine_override_sent"] = (
                                    True
                                )
                                asyncio.create_task(
                                    _async_generate_reply(
                                        session,
                                        instructions=f"Say ONLY this, nothing else: {forced_response}",
                                        allow_interruptions=True,
                                    )
                                )
                        # Clear the forced response after use
                        conversation_buffer["forced_next_response"] = None
                        conversation_buffer["state_machine_override_sent"] = False

                    # 🔴 PHOTO WAIT: If waiting for photo, block any questions
                    if _waiting_for_photo.get(room_name) and "?" in content:
                        # Agent is asking a question while we should be waiting for photo
                        if not conversation_buffer.get("photo_wait_override_sent"):
                            conversation_buffer["photo_wait_override_sent"] = True
                            logger.warning(
                                f"[PhotoWait] 🚨 Agent asked question while waiting for photo! Blocking."
                            )
                            # Don't say anything - just wait silently

                    asked_step = None
                    if (
                        "everything correct" in lower
                        or "is that correct" in lower
                        or "correct?" in lower
                    ):
                        asked_step = "recap"
                    elif "storage size" in lower:
                        asked_step = "storage"
                    elif "condition" in lower and "?" in lower:
                        asked_step = "condition"
                    elif "box" in lower and "?" in lower:
                        asked_step = "accessories"
                    elif "photo" in lower and "?" in lower:
                        asked_step = "photos"
                    elif "your name" in lower or "what's your name" in lower:
                        asked_step = "name"
                    elif (
                        "contact number" in lower
                        or "phone number" in lower
                        or "phone?" in lower
                    ):
                        asked_step = "phone"
                    elif "email" in lower and "?" in lower:
                        asked_step = "email"
                    elif "payout" in lower:
                        asked_step = "payout"

                    if (
                        asked_step
                        and current_step
                        and next_question
                        and ("?" in content)
                        and not checklist.is_complete()
                        and asked_step != current_step
                        and not conversation_buffer.get("step_failsafe_sent")
                    ):
                        conversation_buffer["step_failsafe_sent"] = True
                        forced = next_question
                        if forced == "recap":
                            forced = "Everything correct? Please say yes or no."
                        logger.warning(
                            "[StepFailSafe] ⚠️ Wrong step asked (asked=%s current=%s). Forcing next question: %s progress=%s",
                            asked_step,
                            current_step,
                            forced,
                            progress,
                        )
                        asyncio.create_task(
                            _async_generate_reply(
                                session,
                                instructions=f"Say exactly: {forced}",
                                allow_interruptions=True,
                            )
                        )

                    if asked_step == "recap" and current_step == "recap":
                        _awaiting_recap_confirmation[room_name] = True

                    if _awaiting_recap_confirmation.get(room_name):
                        assistant_confirms = (
                            lower.strip().startswith("yes")
                            or "we'll proceed" in lower
                            or "we will proceed" in lower
                        )
                        if assistant_confirms:
                            asyncio.create_task(
                                _async_generate_reply(
                                    session,
                                    instructions="Say exactly: Please answer yes or no.",
                                    allow_interruptions=True,
                                )
                            )

                    lower_content = content.lower()
                    # 🚨 REMOVED: Don't set initial_quote_given when agent ASKS "Want to proceed?"
                    # Only set it when user CONFIRMS (see on_user_input_transcribed handler above)
                    if (
                        ("trades for" in lower_content)
                        and ("top-up" in lower_content or "top up" in lower_content)
                        and has_prices
                    ):
                        # Just log that quote was spoken - user must confirm before flow activates
                        logger.info(
                            "[QuoteState] 📢 Quote spoken to user. Waiting for confirmation before activating flow. progress=%s",
                            progress,
                        )

                    said_proceed = any(
                        phrase in content.lower()
                        for phrase in [
                            "want to proceed",
                            "proceed?",
                            "shall i proceed",
                            "proceed now",
                            "continue with trade-in",
                        ]
                    )
                    if said_proceed and not conversation_buffer.get(
                        "quote_failsafe_sent"
                    ):
                        conversation_buffer["quote_failsafe_sent"] = True

                        if (not has_quote) and has_prices:
                            src = checklist.collected_data.get("source_device_name")
                            tgt = checklist.collected_data.get("target_device_name")
                            trade_value = checklist.collected_data.get(
                                "source_price_quoted"
                            )
                            retail_price = checklist.collected_data.get(
                                "target_price_quoted"
                            )
                            top_up = checklist.collected_data.get("top_up_amount")
                            logger.warning(
                                "[QuoteFailSafe] ⚠️ Agent asked to proceed without quoting. Injecting quote. progress=%s",
                                progress,
                            )
                            asyncio.create_task(
                                _async_generate_reply(
                                    session,
                                    instructions=(
                                        f"Say exactly: Your {src} trades for ${int(trade_value)}. "
                                        f"The {tgt} is ${int(retail_price)}. "
                                        f"Top-up: ${int(top_up)}. {_proceed_prompt()}"
                                    ),
                                    allow_interruptions=True,
                                )
                            )
                            # 🚨 REMOVED: Don't set flag here - wait for user confirmation
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

                    lower = content.lower()
                    should_force_next = (
                        bool(checklist.get_next_question())
                        and not checklist.is_complete()
                        and not conversation_buffer.get("order_failsafe_sent")
                        and checklist.get_next_question().lower() not in lower
                    )
                    looks_like_close = any(
                        phrase in lower
                        for phrase in (
                            "all done",
                            "done",
                            "have a great day",
                            "we'll review",
                            "we will review",
                            "we'll contact you",
                            "we'll proceed",
                            "we will proceed",
                            "anything else",
                            "further assistance",
                            "let me know if you need",
                        )
                    )
                    next_question = checklist.get_next_question()
                    looks_like_drift = (
                        bool(next_question)
                        and ("?" not in content)
                        and ("please" in lower and "assist" in lower)
                    )
                    if (
                        should_force_next
                        and next_question
                        and (looks_like_close or looks_like_drift)
                    ):
                        conversation_buffer["order_failsafe_sent"] = True
                        forced = next_question
                        if forced == "recap":
                            forced = "Everything correct? Please say yes or no."
                        logger.warning(
                            "[OrderFailSafe] ⚠️ Model attempted to end early. Forcing next question: %s progress=%s",
                            forced,
                            progress,
                        )
                        asyncio.create_task(
                            _async_generate_reply(
                                session,
                                instructions=f"Say exactly: {forced}",
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
                    logger.error(
                        f"[Dashboard] ❌ Failed to read participant identity: {e}"
                    )

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

    # Build room options conditionally based on noise cancellation setting
    audio_input_options = {}
    if VOICE_NOISE_CANCELLATION:
        # Only enable noise cancellation if explicitly set to true (LiveKit Cloud feature)
        audio_input_options["noise_cancellation"] = lambda params: (
            noise_cancellation.BVCTelephony()
            if params.participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
            else noise_cancellation.BVC()
        )

    await session.start(
        agent=TradeZoneAgent(),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(**audio_input_options),
        ),
    )


if __name__ == "__main__":
    cli.run_app(server)
