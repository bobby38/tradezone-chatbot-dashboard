"""
End-to-end deterministic trade flow tests for LiveKit voice agent.
"""

import os

import pytest
from agent import TradeZoneAgent
from livekit.agents import AgentSession
from livekit.plugins import openai

if not os.environ.get("OPENAI_API_KEY"):
    pytest.skip(
        "OPENAI_API_KEY not set; skipping LiveKit LLM tests.",
        allow_module_level=True,
    )

LLM_MODEL = "gpt-4o-mini"


def _message_text(msg) -> str:
    event = msg.event() if callable(msg.event) else msg.event
    return event.item.text_content or ""


def _skip_tool_events(result) -> None:
    result.expect.skip_next_event_if(type="function_call")
    result.expect.skip_next_event_if(type="function_call_output")


async def _start_session(session: AgentSession) -> None:
    result = await session.start(agent=TradeZoneAgent(), capture_run=True)
    if result is not None:
        await result


async def _send_and_get(session: AgentSession, user_input: str) -> str:
    result = await session.run(user_input=user_input)
    _skip_tool_events(result)
    msg = result.expect.next_event().is_message(role="assistant")
    return _message_text(msg)


def _next_reply_for_prompt(content: str) -> tuple[str | None, str | None]:
    lower = content.lower()
    if "which" in lower and "ps4" in lower:
        return "PS4 Pro 1TB", "variant"
    if "proceed" in lower or "continue" in lower:
        return "yes", "proceed"
    if "storage" in lower or "capacity" in lower:
        return "1TB", "storage"
    if "condition" in lower:
        return "good", "condition"
    if "box" in lower or "accessories" in lower or "controller" in lower:
        return "box and controller", "accessories"
    if "photo" in lower:
        return "no", "photos"
    if "your name" in lower or "name?" in lower:
        return "John Doe", "name"
    if "contact number" in lower or "phone" in lower:
        if "correct" in lower:
            return "yes", "phone_confirm"
        return "658449669", "phone"
    if "email" in lower:
        if "correct" in lower:
            return "yes", "email_confirm"
        return "test@gmail.com", "email"
    if "paynow" in lower or "installment" in lower or "bank" in lower or "cash" in lower:
        return "cash", "payout"
    if "everything correct" in lower or "is this correct" in lower or "reply yes" in lower:
        return "yes", "recap"
    if "singapore" in lower and "?" in lower:
        return "yes", "location"
    return None, None


@pytest.mark.asyncio
async def test_tradein_full_flow_submits():
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        content = await _send_and_get(session, "trade in my PS4 Pro")
        seen_steps = set()

        # Iterate through prompts until submission confirmation
        for _ in range(20):
            lower = content.lower()
            if "submitted" in lower or "contact" in lower:
                break
            reply, step = _next_reply_for_prompt(content)
            if reply is None:
                break
            if step:
                seen_steps.add(step)
            content = await _send_and_get(session, reply)

        assert any(token in content.lower() for token in ["submitted", "contact", "we'll", "we will"])
        # Ensure we reached contact capture steps
        assert "name" in seen_steps
        assert "phone" in seen_steps
        assert "email" in seen_steps


@pytest.mark.asyncio
async def test_tradeup_quote_flow():
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        content = await _send_and_get(
            session, "Trade my PS4 Pro 1TB for PS5 Pro 2TB Digital"
        )
        if "confirm" in content.lower():
            content = await _send_and_get(session, "yes")
        lower = content.lower()
        assert "ps4" in lower
        assert "ps5" in lower or "playstation" in lower
        assert "$" in lower or "top-up" in lower or "top up" in lower


@pytest.mark.asyncio
async def test_staff_support_warranty_flow():
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        content = await _send_and_get(
            session,
            "I have a warranty issue with my computer and want staff support",
        )
        lower = content.lower()
        assert "staff" in lower or "name" in lower or "phone" in lower
