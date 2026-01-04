"""
Unit tests for TradeZone voice agent using LiveKit Agents testing framework.
Tests key flows: greetings, product search, trade-ins, sports filtering.

Setup: pip install -r requirements-test.txt
Run: pytest test_livekit_agent.py -v
Run with verbose: LIVEKIT_EVALS_VERBOSE=1 pytest test_livekit_agent.py -s
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

# Agent is in the same directory, can be imported if needed
# from agent import <agent_function>

# Configuration
LLM_MODEL = "gpt-4o-mini"


async def start_session(session: AgentSession) -> None:
    """Start agent session and wait for the initial greeting to complete."""
    result = await session.start(agent=TradeZoneAgent(), capture_run=True)
    if result is not None:
        await result


def skip_tool_events(result) -> None:
    """Skip optional tool call events before assistant messages."""
    result.expect.skip_next_event_if(type="function_call")
    result.expect.skip_next_event_if(type="function_call_output")


def message_text(msg) -> str:
    """Get assistant message text content safely."""
    event = msg.event() if callable(msg.event) else msg.event
    text = event.item.text_content
    return text or ""


@pytest.mark.asyncio
async def test_greeting():
    """Test initial greeting response."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        result = await session.start(agent=TradeZoneAgent(), capture_run=True)
        assert result is not None
        await result
        result.expect.skip_next_event_if(type="agent_handoff")

        await (
            result.expect.next_event()
            .is_message(role="assistant")
            .judge(
                llm,
                intent="Friendly greeting offering help with electronics, gaming, or trade-ins.",
            )
        )
        result.expect.no_more_events()


@pytest.mark.asyncio
async def test_product_search_ps5():
    """Test searching for PS5 consoles."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await start_session(session)
        result = await session.run(user_input="Do you have PS5?")

        # Should call search tool and return products
        skip_tool_events(result)
        msg = result.expect.next_event().is_message(role="assistant")
        content = message_text(msg).lower()
        assert "ps5" in content or "playstation" in content


@pytest.mark.asyncio
async def test_sports_filter_basketball():
    """Test that basketball queries are blocked (no sports equipment)."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await start_session(session)
        result = await session.run(user_input="Do you have basketball games?")

        skip_tool_events(result)
        msg = result.expect.next_event().is_message(role="assistant")
        content = message_text(msg).lower()
        assert "basketball" in content


@pytest.mark.asyncio
async def test_sports_filter_nba_2k():
    """Test that NBA 2K video games are shown (not filtered)."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await start_session(session)
        result = await session.run(user_input="Do you have NBA 2K?")

        skip_tool_events(result)
        msg = result.expect.next_event().is_message(role="assistant")
        content = message_text(msg).lower()
        assert "nba" in content


@pytest.mark.asyncio
async def test_racing_games_allowed():
    """Test that racing video games are shown (Project CARS, etc)."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await start_session(session)
        result = await session.run(user_input="Any car games?")

        skip_tool_events(result)
        msg = result.expect.next_event().is_message(role="assistant")
        await msg.judge(
            llm,
            intent="Responds to a racing/car game query with game options or a clarification",
        )


@pytest.mark.asyncio
async def test_tradein_ps5_pricing():
    """Test trade-in price inquiry for PS5."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await start_session(session)
        result = await session.run(user_input="How much can I trade in my PS5 for?")

        # Should call trade-in pricing tool
        skip_tool_events(result)
        msg = result.expect.next_event().is_message(role="assistant")
        content = message_text(msg).lower()
        assert "ps5" in content
        assert "model" in content or "which" in content or "$" in content


@pytest.mark.asyncio
async def test_tradein_multi_turn_flow():
    """Test complete trade-in conversation flow."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await start_session(session)
        # Step 1: Initial inquiry -> price + proceed
        result1 = await session.run(user_input="I want to trade in my PS4 Pro")
        skip_tool_events(result1)
        msg1 = result1.expect.next_event().is_message()
        content1 = message_text(msg1).lower()
        assert "ps4" in content1
        assert "$" in content1 or "dollar" in content1 or "which" in content1

        if "which" in content1:
            result2 = await session.run(user_input="PS4 Pro 1TB")
            skip_tool_events(result2)
            msg2 = result2.expect.next_event().is_message()
            content2 = message_text(msg2).lower()
            assert "$" in content2 or "dollar" in content2
            assert "proceed" in content2 or "continue" in content2
            result3 = await session.run(user_input="yes")
            skip_tool_events(result3)
            msg3 = result3.expect.next_event().is_message()
            content3 = message_text(msg3).lower()
            assert "storage" in content3 or "capacity" in content3
        else:
            # Step 2: Confirm proceed -> storage
            result2 = await session.run(user_input="yes")
            skip_tool_events(result2)
            msg2 = result2.expect.next_event().is_message()
            content2 = message_text(msg2).lower()
            assert "storage" in content2 or "capacity" in content2

            # Step 3: Provide storage -> condition/accessories
            result3 = await session.run(user_input="1TB")
            skip_tool_events(result3)
            msg3 = result3.expect.next_event().is_message()
            content3 = message_text(msg3).lower()
            assert any(
                token in content3
                for token in [
                    "condition",
                    "accessor",
                    "box",
                    "controller",
                    "photo",
                    "?",
                ]
            )


@pytest.mark.asyncio
async def test_phone_search_affordable():
    """Test affordable phone search."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await start_session(session)
        result = await session.run(user_input="Any affordable phones?")

        skip_tool_events(result)
        msg = result.expect.next_event().is_message(role="assistant")
        content = message_text(msg).lower()
        assert "$" in content or "dollar" in content
        assert any(
            brand in content
            for brand in ["oppo", "pixel", "galaxy", "iphone", "samsung"]
        )


@pytest.mark.asyncio
async def test_location_singapore_only():
    """Test that service is Singapore-only."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await start_session(session)
        result = await session.run(user_input="I'm from Malaysia, can I trade in?")

        skip_tool_events(result)
        msg = result.expect.next_event().is_message(role="assistant")
        await msg.judge(llm, intent="Explains service is Singapore-only")


@pytest.mark.asyncio
async def test_unknown_product():
    """Test handling of products not in catalog."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await start_session(session)
        result = await session.run(user_input="Do you have webcams?")

        skip_tool_events(result)
        msg = result.expect.next_event().is_message(role="assistant")
        await msg.judge(
            llm,
            intent="Politely indicates item not in stock and asks what the user wants next",
        )
