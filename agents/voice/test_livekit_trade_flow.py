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
    for _ in range(3):
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
    if (
        "paynow" in lower
        or "installment" in lower
        or "bank" in lower
        or "cash" in lower
    ):
        return "cash", "payout"
    if (
        "everything correct" in lower
        or "is this correct" in lower
        or "reply yes" in lower
        or "correct?" in lower
    ):
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
        for i in range(20):
            lower = content.lower()
            if "submitted" in lower or "contact" in lower:
                break
            reply, step = _next_reply_for_prompt(content)
            if reply is None:
                print(f"\n[DEBUG] Iteration {i}: No reply matched for: {content}")
                print(f"[DEBUG] Seen steps so far: {seen_steps}")
                break
            if step:
                seen_steps.add(step)
            print(f"\n[DEBUG] Iteration {i}: Question: {content}")
            print(f"[DEBUG] Reply: {reply} (Step: {step})")
            content = await _send_and_get(session, reply)

        print(f"\n[DEBUG] Final content: {content}")
        print(f"[DEBUG] Final seen_steps: {seen_steps}")

        assert any(
            token in content.lower()
            for token in ["submitted", "contact", "we'll", "we will"]
        )
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


@pytest.mark.asyncio
async def test_staff_support_complete_flow():
    """Test complete staff support flow with warranty inquiry - collects name, email, phone"""
    async with (
        openai.LLM(model=LLM_MODEL) as llm,
        AgentSession(llm=llm) as session,
    ):
        await _start_session(session)
        content = await _send_and_get(
            session, "I want to know if my warranty is still okay for my computer"
        )
        seen_steps = set()

        # Iterate through prompts until email sent confirmation
        for i in range(15):
            lower = content.lower()

            # Check if we reached the final confirmation
            if any(
                word in lower
                for word in ["sent", "staff", "contact you", "get back", "reach out"]
            ):
                # Make sure it's actually a confirmation, not just asking if we want staff
                if any(
                    word in lower
                    for word in ["sent", "will contact", "will get back", "will reach"]
                ):
                    break

            # Determine reply based on question
            reply = None
            step = None

            # Singapore location check
            if "singapore" in lower and "?" in lower:
                reply = "yes"
                step = "location"
            # Name
            elif "name" in lower and "?" in lower:
                reply = "John Doe"
                step = "name"
            # Email
            elif "email" in lower and "?" in lower:
                if "correct" in lower:
                    reply = "yes"
                    step = "email_confirm"
                else:
                    reply = "test@gmail.com"
                    step = "email"
            # Phone
            elif "phone" in lower or "contact number" in lower or "number" in lower:
                if "correct" in lower:
                    reply = "yes"
                    step = "phone_confirm"
                else:
                    reply = "6584489066"
                    step = "phone"
            # Any confirmation
            elif "correct?" in lower or "right?" in lower:
                reply = "yes"
                step = "confirm"

            if reply is None:
                print(f"\n[DEBUG] Iteration {i}: No reply matched for: {content}")
                print(f"[DEBUG] Seen steps so far: {seen_steps}")
                break

            if step:
                seen_steps.add(step)

            print(f"\n[DEBUG] Iteration {i}: Question: {content}")
            print(f"[DEBUG] Reply: {reply} (Step: {step})")
            content = await _send_and_get(session, reply)

        print(f"\n[DEBUG] Final content: {content}")
        print(f"[DEBUG] Final seen_steps: {seen_steps}")

        # Verify we collected all contact information
        assert "name" in seen_steps, "Should have collected name"
        assert "email" in seen_steps, "Should have collected email"
        assert "phone" in seen_steps, "Should have collected phone number"

        # Verify final message indicates email was sent
        lower_final = content.lower()
        assert any(
            word in lower_final
            for word in [
                "sent",
                "staff will contact",
                "will get back",
                "will reach out",
            ]
        ), f"Expected confirmation message but got: {content}"
