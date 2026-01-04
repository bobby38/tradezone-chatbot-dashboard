"""
Unit tests for TradeZone voice agent using LiveKit Agents testing framework.
Tests key flows: greetings, product search, trade-ins, sports filtering.

Setup: pip install -r requirements-test.txt
Run: pytest test_livekit_agent.py -v
Run with verbose: LIVEKIT_EVALS_VERBOSE=1 pytest test_livekit_agent.py -s
"""

import pytest
from livekit.agents import AgentSession
from livekit.plugins import openai

# Agent is in the same directory, can be imported if needed
# from agent import <agent_function>

# Configuration
LLM_MODEL = "gpt-4o-mini"


@pytest.mark.asyncio
async def test_greeting():
    """Test initial greeting response."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        # Note: Replace with your actual agent initialization
        # await session.start(TradeZoneAgent())

        result = await session.run(user_input="Hello")

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
        result = await session.run(user_input="Do you have PS5?")

        # Should call search tool and return products
        await result.expect.skip_next_event_if(lambda e: e.type == "function_call")
        msg = await result.expect.next_event().is_message(role="assistant")
        await msg.judge(llm, contains="PS5")
        await msg.judge(llm, intent="Lists PS5 products with prices")


@pytest.mark.asyncio
async def test_sports_filter_basketball():
    """Test that basketball queries are blocked (no sports equipment)."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        result = await session.run(user_input="Do you have basketball games?")

        msg = await result.expect.next_event().is_message(role="assistant")
        await msg.judge(
            llm, intent="Explains we don't stock basketball games or equipment"
        )
        await msg.judge(llm, contains="don't.*stock|focus on")


@pytest.mark.asyncio
async def test_sports_filter_nba_2k():
    """Test that NBA 2K video games are shown (not filtered)."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        result = await session.run(user_input="Do you have NBA 2K?")

        await result.expect.skip_next_event_if(lambda e: e.type == "function_call")
        msg = await result.expect.next_event().is_message(role="assistant")
        await msg.judge(llm, contains="NBA 2K")
        await msg.judge(llm, intent="Lists NBA 2K games with prices")


@pytest.mark.asyncio
async def test_racing_games_allowed():
    """Test that racing video games are shown (Project CARS, etc)."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        result = await session.run(user_input="Any car games?")

        await result.expect.skip_next_event_if(lambda e: e.type == "function_call")
        msg = await result.expect.next_event().is_message(role="assistant")
        # Should find Project CARS 3, Cars 3 games
        await msg.judge(llm, intent="Lists racing/car video games without blocking")


@pytest.mark.asyncio
async def test_tradein_ps5_pricing():
    """Test trade-in price inquiry for PS5."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        result = await session.run(user_input="How much can I trade in my PS5 for?")

        # Should call trade-in pricing tool
        await result.expect.skip_next_event_if(lambda e: e.type == "function_call")
        msg = await result.expect.next_event().is_message(role="assistant")
        await msg.judge(llm, contains="S$")
        await msg.judge(llm, intent="Quotes PS5 trade-in value range")


@pytest.mark.asyncio
async def test_tradein_multi_turn_flow():
    """Test complete trade-in conversation flow."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        # Step 1: Initial inquiry
        result1 = await session.run("I want to trade in my PS4 Pro")
        await result1.expect.skip_next_event_if(lambda e: e.type == "function_call")
        msg1 = await result1.expect.next_event().is_message()
        await msg1.judge(llm, contains="S$")

        # Step 2: Ask for condition
        result2 = await session.run("It's in good condition")
        msg2 = await result2.expect.next_event().is_message()
        await msg2.judge(
            llm,
            intent="Acknowledges condition and asks about accessories or next steps",
        )

        # Step 3: Provide details
        result3 = await session.run("I have the box and one controller")
        msg3 = await result3.expect.next_event().is_message()
        await msg3.judge(llm, intent="Confirms details and explains next steps")


@pytest.mark.asyncio
async def test_phone_search_affordable():
    """Test affordable phone search."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        result = await session.run(user_input="Any affordable phones?")

        await result.expect.skip_next_event_if(lambda e: e.type == "function_call")
        msg = await result.expect.next_event().is_message(role="assistant")
        await msg.judge(llm, contains="S$")
        await msg.judge(llm, intent="Lists affordable phone options with prices")


@pytest.mark.asyncio
async def test_location_singapore_only():
    """Test that service is Singapore-only."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        result = await session.run(user_input="I'm from Malaysia, can I trade in?")

        msg = await result.expect.next_event().is_message(role="assistant")
        await msg.judge(llm, contains="Singapore")
        await msg.judge(llm, intent="Explains service is Singapore-only")


@pytest.mark.asyncio
async def test_unknown_product():
    """Test handling of products not in catalog."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        result = await session.run(user_input="Do you have webcams?")

        msg = await result.expect.next_event().is_message(role="assistant")
        await msg.judge(
            llm,
            intent="Politely indicates item not available and suggests checking website",
        )
