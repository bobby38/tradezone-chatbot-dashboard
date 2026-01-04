"""
Comprehensive end-to-end tests for TradeZone Voice Agent.
Each test is isolated and tests a complete user flow.

IMPORTANT: Trade-in tests should be run in isolation as they maintain session state.
Run individual tests: pytest test_comprehensive_flows.py::test_name -v
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
    """Extract text from assistant message."""
    event = msg.event() if callable(msg.event) else msg.event
    return event.item.text_content or ""


def _skip_tool_events(result) -> None:
    """Skip tool call events."""
    for _ in range(5):
        result.expect.skip_next_event_if(type="function_call")
        result.expect.skip_next_event_if(type="function_call_output")


async def _start_session(session: AgentSession) -> None:
    """Start agent session."""
    result = await session.start(agent=TradeZoneAgent(), capture_run=True)
    if result is not None:
        await result


async def _send_and_get(session: AgentSession, user_input: str) -> str:
    """Send message and get response text."""
    result = await session.run(user_input=user_input)
    _skip_tool_events(result)
    msg = result.expect.next_event().is_message(role="assistant")
    return _message_text(msg)


# ============================================================================
# PRODUCT SEARCH TESTS
# ============================================================================


@pytest.mark.asyncio
async def test_retro_handheld_game_search():
    """Test searching for retro/classic handheld games."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        content = await _send_and_get(session, "any classic game retro handheld device")

        lower = content.lower()
        # Should find game products
        assert any(word in lower for word in ["game", "classic", "found", "$"])
        # Should not say "couldn't find"
        assert "couldn't find" not in lower


@pytest.mark.asyncio
async def test_gaming_headset_search():
    """Test searching for gaming headsets."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        content = await _send_and_get(session, "gaming headset")

        lower = content.lower()
        # Should find headset products
        assert "headset" in lower
        assert "$" in lower
        # Should show multiple options
        assert any(word in lower for word in ["found", "have", "items"])


@pytest.mark.asyncio
async def test_gamepad_switch_search():
    """Test searching for Switch gamepad/controller."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        content = await _send_and_get(session, "gamepad for switch")

        lower = content.lower()
        # Should find controller products
        assert any(word in lower for word in ["controller", "switch", "pro controller"])
        assert "$" in lower


@pytest.mark.asyncio
async def test_fifa_football_game_search():
    """Test searching for FIFA/football games."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        content = await _send_and_get(session, "fifa game")

        lower = content.lower()
        # Should find FIFA or football games
        assert any(word in lower for word in ["fifa", "fc", "football", "ea sports"])
        assert "$" in lower


# ============================================================================
# POLICY & INFORMATION TESTS
# ============================================================================


@pytest.mark.asyncio
async def test_malaysia_location_rejected():
    """Test that Malaysia customers are politely rejected."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        content = await _send_and_get(session, "I'm from Malaysia, can I buy?")

        lower = content.lower()
        assert "singapore" in lower
        assert any(word in lower for word in ["only", "sorry"])


@pytest.mark.asyncio
async def test_opening_hours():
    """Test opening hours query."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        content = await _send_and_get(session, "What are your opening hours?")

        lower = content.lower()
        assert "12" in content  # 12 pm
        assert "8" in content  # 8 pm
        assert any(word in lower for word in ["daily", "open", "pm"])


@pytest.mark.asyncio
async def test_shipping_policy():
    """Test shipping policy query."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        content = await _send_and_get(session, "How much is shipping?")

        lower = content.lower()
        assert "$5" in content or "5" in content
        assert any(word in lower for word in ["business days", "1-3", "singapore"])


@pytest.mark.asyncio
async def test_weekend_shipping_not_available():
    """Test that weekend/same-day shipping is clarified."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        content = await _send_and_get(
            session, "Can I get same-day delivery on weekends?"
        )

        lower = content.lower()
        assert any(
            word in lower for word in ["no same-day", "weekend", "business days"]
        )


@pytest.mark.asyncio
async def test_crypto_rejected():
    """Test that crypto trading is rejected."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        content = await _send_and_get(session, "Can I trade Bitcoin here?")

        lower = content.lower()
        assert "crypto" in lower or "bitcoin" in lower
        assert any(word in lower for word in ["don't", "singapore", "electronics"])


@pytest.mark.asyncio
async def test_future_product_ps6():
    """Test that future/unavailable products suggest staff notification."""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        content = await _send_and_get(session, "Do you have PS6?")

        lower = content.lower()
        assert any(word in lower for word in ["not", "stock", "available"])
        assert any(word in lower for word in ["staff", "notify", "support"])


# ============================================================================
# STAFF SUPPORT FLOW TEST (COMPLETE END-TO-END)
# ============================================================================


@pytest.mark.asyncio
async def test_staff_support_warranty_complete_flow():
    """
    COMPLETE staff support flow for warranty inquiry.
    Tests: warranty question → location check → phone → email → reason → confirmation
    """
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)

        # Step 1: Initial warranty inquiry
        content = await _send_and_get(
            session, "I want to check if my computer warranty is still valid"
        )
        print(f"\n[Step 1] Agent: {content}")

        seen_steps = set()

        # Iterate through the flow
        for i in range(15):
            lower = content.lower()

            # Check if we reached final confirmation
            if any(
                word in lower for word in ["sent", "contact you", "get back", "done"]
            ):
                if any(
                    word in lower for word in ["sent", "will contact", "will get back"]
                ):
                    print(f"\n[Final] Agent confirmed: {content}")
                    break

            # Determine reply based on question
            reply = None
            step = None

            # Singapore location
            if "singapore" in lower and "?" in lower:
                reply = "yes"
                step = "location"
            # Phone number
            elif (
                "phone" in lower or "number" in lower or "contact number" in lower
            ) and "?" in lower:
                if "correct" in lower:
                    reply = "yes"
                    step = "phone_confirm"
                else:
                    reply = "6584489066"
                    step = "phone"
            # Email
            elif "email" in lower and "?" in lower:
                if "correct" in lower:
                    reply = "yes"
                    step = "email_confirm"
                else:
                    reply = "test@gmail.com"
                    step = "email"
            # Name
            elif "name" in lower and "?" in lower:
                reply = "John Doe"
                step = "name"
            # Reason/message
            elif "reason" in lower or "issue" in lower or "problem" in lower:
                reply = "I want to check if my warranty is still valid"
                step = "reason"
            # General confirmation
            elif "correct?" in lower or "right?" in lower:
                reply = "yes"
                step = "confirm"

            if reply is None:
                print(f"\n[Step {i}] NO MATCH for: {content}")
                print(f"Seen steps: {seen_steps}")
                break

            if step:
                seen_steps.add(step)

            print(f"\n[Step {i}] Agent asked: {content}")
            print(f"User replied: {reply} (Step: {step})")

            content = await _send_and_get(session, reply)

        print(f"\n[Final content] {content}")
        print(f"\n[Seen steps] {seen_steps}")

        # Verify we collected key information
        assert "location" in seen_steps, "Should check Singapore location"
        assert "phone" in seen_steps, "Should collect phone number"
        assert "email" in seen_steps, "Should collect email"

        # Verify final confirmation
        lower_final = content.lower()
        assert any(
            word in lower_final
            for word in ["sent", "contact", "get back", "reach out", "done"]
        ), f"Expected confirmation but got: {content}"


# ============================================================================
# TRADE-IN FLOW TEST (ISOLATED - RUN SEPARATELY)
# ============================================================================


@pytest.mark.asyncio
@pytest.mark.slow
async def test_tradein_ps4_complete_flow_isolated():
    """
    COMPLETE trade-in flow for PS4 Pro.
    MUST BE RUN IN ISOLATION - maintains session state.

    Tests: price check → proceed → variant → storage → condition →
           accessories → photos → name → phone → email → payout → recap → submit
    """
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)

        # Step 1: Initial trade-in request
        content = await _send_and_get(session, "I want to trade in my PS4 Pro")
        print(f"\n[Step 1] Agent: {content}")

        seen_steps = set()

        # Helper to determine next reply
        def get_reply(content_lower):
            # Variant selection
            if "which" in content_lower and "ps4" in content_lower:
                return "PS4 Pro 1TB", "variant"
            # Proceed confirmation
            if "proceed" in content_lower or "continue" in content_lower:
                return "yes", "proceed"
            # Storage
            if "storage" in content_lower or "capacity" in content_lower:
                return "1TB", "storage"
            # Condition
            if "condition" in content_lower:
                return "good", "condition"
            # Box/accessories
            if "box" in content_lower or "accessories" in content_lower:
                return "yes, I have the box and controller", "accessories"
            # Photos
            if "photo" in content_lower:
                return "no", "photos"
            # Name
            if (
                "name" in content_lower or "your name" in content_lower
            ) and "?" in content_lower:
                return "John Doe", "name"
            # Phone
            if (
                "phone" in content_lower or "contact number" in content_lower
            ) and "?" in content_lower:
                if "correct" in content_lower:
                    return "yes", "phone_confirm"
                return "6584489066", "phone"
            # Email
            if "email" in content_lower and "?" in content_lower:
                if "correct" in content_lower:
                    return "yes", "email_confirm"
                return "test@gmail.com", "email"
            # Payout method
            if any(
                word in content_lower
                for word in ["paynow", "cash", "bank", "installment"]
            ):
                return "cash", "payout"
            # Recap/confirmation
            if "correct?" in content_lower or "everything correct" in content_lower:
                return "yes", "recap"

            return None, None

        # Iterate through flow
        for i in range(25):
            lower = content.lower()

            # Check if submitted
            if any(
                word in lower for word in ["submitted", "contact", "we'll", "we will"]
            ):
                print(f"\n[SUBMITTED] {content}")
                break

            reply, step = get_reply(lower)

            if reply is None:
                print(f"\n[Step {i}] NO MATCH for: {content}")
                print(f"Seen steps: {seen_steps}")
                break

            if step:
                seen_steps.add(step)

            print(f"\n[Step {i}] Agent: {content}")
            print(f"User: {reply} (Step: {step})")

            content = await _send_and_get(session, reply)

        print(f"\n[Final] {content}")
        print(f"\n[All steps] {seen_steps}")

        # Verify critical steps
        assert "name" in seen_steps, "Should collect name"
        assert "phone" in seen_steps, "Should collect phone"
        assert "email" in seen_steps, "Should collect email"
        assert "condition" in seen_steps, "Should ask condition"

        # Verify submission
        final_lower = content.lower()
        assert any(
            word in final_lower for word in ["submitted", "contact", "we'll", "we will"]
        ), f"Expected submission confirmation but got: {content}"
