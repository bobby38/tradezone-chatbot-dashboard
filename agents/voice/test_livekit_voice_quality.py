"""
Voice quality and intent tests for TradeZone LiveKit agent.
Focus: short responses, $ currency, helpful follow-ups.
"""

import os
import re

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


def _extract_prices(text: str) -> list[float]:
    prices: list[float] = []
    for match in re.findall(r"\$\s*(\d+(?:\.\d+)?)", text):
        try:
            prices.append(float(match))
        except ValueError:
            continue
    return prices


async def _start_session(session: AgentSession) -> None:
    result = await session.start(agent=TradeZoneAgent(), capture_run=True)
    if result is not None:
        await result


def _skip_tool_events(result) -> None:
    for _ in range(3):
        result.expect.skip_next_event_if(type="function_call")
        result.expect.skip_next_event_if(type="function_call_output")


def _message_text(msg) -> str:
    event = msg.event() if callable(msg.event) else msg.event
    return event.item.text_content or ""


@pytest.mark.asyncio
async def test_voice_currency_format_uses_dollar_sign():
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        result = await session.run(user_input="Do you have PS5?")
        _skip_tool_events(result)
        msg = result.expect.next_event().is_message(role="assistant")
        content = _message_text(msg)
        assert "S$" not in content
        assert "$" in content or "dollar" in content.lower()


@pytest.mark.asyncio
async def test_voice_short_reply_and_followup_question():
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        result = await session.run(user_input="car games")
        _skip_tool_events(result)
        msg = result.expect.next_event().is_message(role="assistant")
        content = _message_text(msg)
        assert len(content) <= 350
        assert "?" in content or "want" in content.lower() or "need" in content.lower()


@pytest.mark.asyncio
async def test_voice_basketball_clarifies_scope():
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        result = await session.run(user_input="basketball")
        _skip_tool_events(result)
        msg = result.expect.next_event().is_message(role="assistant")
        content = _message_text(msg).lower()
        assert "basketball" in content
        assert "gaming" in content or "electronics" in content


@pytest.mark.asyncio
async def test_voice_affordable_phones_are_budget_only():
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        result = await session.run(user_input="any affordable phones")
        _skip_tool_events(result)
        msg = result.expect.next_event().is_message(role="assistant")
        content = _message_text(msg)
        prices = _extract_prices(content)
        if prices:
            assert max(prices) <= 300
        else:
            assert "budget" in content.lower() or "price" in content.lower()


@pytest.mark.asyncio
async def test_voice_gpu_llm_recommendation():
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        result = await session.run(
            user_input="good gpu for running a local LLM chatbot"
        )
        _skip_tool_events(result)
        msg = result.expect.next_event().is_message(role="assistant")
        content = _message_text(msg).lower()
        assert "gpu" in content
        assert any(
            token in content for token in ["4090", "rtx", "nvidia", "a100", "h100"]
        )
        assert "trade only" not in content


@pytest.mark.asyncio
async def test_voice_tradein_price_then_proceed_flow():
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        result1 = await session.run(user_input="trade in my PS4 Pro")
        _skip_tool_events(result1)
        msg1 = result1.expect.next_event().is_message(role="assistant")
        content1 = _message_text(msg1).lower()
        assert "ps4" in content1
        assert "$" in content1 or "dollar" in content1 or "which" in content1
        if "which" in content1:
            result2 = await session.run(user_input="PS4 Pro 1TB")
            _skip_tool_events(result2)
            msg2 = result2.expect.next_event().is_message(role="assistant")
            content2 = _message_text(msg2).lower()
            assert "$" in content2 or "dollar" in content2
            assert "proceed" in content2 or "continue" in content2
        else:
            result2 = await session.run(user_input="yes")
            _skip_tool_events(result2)
            msg2 = result2.expect.next_event().is_message(role="assistant")
            content2 = _message_text(msg2).lower()
            assert "storage" in content2 or "capacity" in content2


@pytest.mark.asyncio
async def test_voice_silent_hill_filters_non_game_results():
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        result = await session.run(user_input="silent hill")
        _skip_tool_events(result)
        msg = result.expect.next_event().is_message(role="assistant")
        content = _message_text(msg).lower()
        assert "silent" in content
        assert "loop" not in content


@pytest.mark.asyncio
async def test_voice_car_games_excludes_cartridge_matches():
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        result = await session.run(user_input="car games")
        _skip_tool_events(result)
        msg = result.expect.next_event().is_message(role="assistant")
        content = _message_text(msg).lower()
        assert "car" in content or "cars" in content or "racing" in content
        assert "pokemon" not in content


@pytest.mark.asyncio
async def test_voice_opening_hours():
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        result = await session.run(user_input="What are your opening hours?")
        _skip_tool_events(result)
        msg = result.expect.next_event().is_message(role="assistant")
        content = _message_text(msg).lower()
        assert "12" in content or "12 pm" in content
        assert "8" in content


@pytest.mark.asyncio
async def test_voice_shipping_policy_weekend():
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        result = await session.run(
            user_input="Is same-day shipping available on weekends?"
        )
        _skip_tool_events(result)
        msg = result.expect.next_event().is_message(role="assistant")
        content = _message_text(msg).lower()
        assert "shipping" in content or "delivery" in content
        assert "business" in content or "1-3" in content


@pytest.mark.asyncio
async def test_voice_crypto_rejected_sg_only():
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        result = await session.run(user_input="Can I trade crypto here?")
        _skip_tool_events(result)
        msg = result.expect.next_event().is_message(role="assistant")
        content = _message_text(msg).lower()
        assert "crypto" in content
        assert "singapore" in content


@pytest.mark.asyncio
async def test_voice_warranty_staff_support():
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        result = await session.run(
            user_input="I have a warranty issue with my computer, can you check?"
        )
        _skip_tool_events(result)
        msg = result.expect.next_event().is_message(role="assistant")
        content = _message_text(msg).lower()
        assert "staff" in content or "name" in content or "phone" in content


@pytest.mark.asyncio
async def test_voice_future_product_notify():
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        result = await session.run(user_input="Do you have PS6?")
        _skip_tool_events(result)
        msg = result.expect.next_event().is_message(role="assistant")
        content = _message_text(msg).lower()
        assert "not" in content or "stock" in content
        assert "notify" in content or "staff" in content


@pytest.mark.asyncio
async def test_voice_tradein_cash_price_switch2():
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        result = await session.run(user_input="trade my Switch 2 for money")
        _skip_tool_events(result)
        msg = result.expect.next_event().is_message(role="assistant")
        content = _message_text(msg).lower()
        assert "switch 2" in content
        assert "$" in content or "dollar" in content
        assert "350" in content


@pytest.mark.asyncio
async def test_voice_tradeup_ps4_to_ps5():
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        result = await session.run(
            user_input="Trade my PS4 Pro 1TB for PS5 Pro 2TB Digital"
        )
        _skip_tool_events(result)
        msg = result.expect.next_event().is_message(role="assistant")
        content = _message_text(msg).lower()
        assert "ps4" in content
        assert "ps5" in content or "playstation" in content
        assert "$" in content or "top-up" in content or "top up" in content
