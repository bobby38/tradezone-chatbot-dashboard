"""
Test suite for voice agent fixes applied on 2026-01-05

Tests all critical fixes:
1. PS4 Pro/Slim device pattern extraction
2. Price announcement format ("Yes, we trade this. Price is X dollars. Want to proceed?")
3. Location check for warranty/support (Singapore-only)
4. TTS currency normalization (S$200 → "200 dollars")
5. Brand/model validation before submission
6. ONE question per response rule

Run with:
    export OPENAI_API_KEY=your-openai-api-key
    pytest agents/voice/test_latest_fixes.py -v
"""

import pytest
from auto_save import TradeInChecklistState, extract_data_from_message


class TestPS4DevicePatterns:
    """Test Fix #1: PS4 Pro/Slim device pattern extraction"""

    def test_ps4_pro_extraction(self):
        """Test PS4 Pro is correctly extracted"""
        message = "I want to trade in my PS4 Pro 1TB"
        state = TradeInChecklistState()
        state.collected_data["initial_quote_given"] = True

        extracted = extract_data_from_message(message, state)

        assert extracted.get("brand") == "Sony", (
            f"Expected brand 'Sony', got {extracted.get('brand')}"
        )
        assert extracted.get("model") == "PlayStation 4 Pro", (
            f"Expected model 'PlayStation 4 Pro', got {extracted.get('model')}"
        )

    def test_ps4_slim_extraction(self):
        """Test PS4 Slim is correctly extracted"""
        message = "Trade my PS4 Slim"
        state = TradeInChecklistState()
        state.collected_data["initial_quote_given"] = True

        extracted = extract_data_from_message(message, state)

        assert extracted.get("brand") == "Sony"
        assert extracted.get("model") == "PlayStation 4 Slim"

    def test_ps5_pro_extraction(self):
        """Test PS5 Pro is correctly extracted"""
        message = "What can I get for my PS5 Pro 2TB"
        state = TradeInChecklistState()
        state.collected_data["initial_quote_given"] = True

        extracted = extract_data_from_message(message, state)

        assert extracted.get("brand") == "Sony"
        assert extracted.get("model") == "PlayStation 5 Pro"

    def test_ps5_digital_extraction(self):
        """Test PS5 Digital is correctly extracted"""
        message = "PS5 Digital Edition trade-in"
        state = TradeInChecklistState()
        state.collected_data["initial_quote_given"] = True

        extracted = extract_data_from_message(message, state)

        assert extracted.get("brand") == "Sony"
        assert extracted.get("model") == "PlayStation 5 Digital"


class TestPriceAnnouncementFormat:
    """Test Fix #2: Price announcement format"""

    def test_check_tradein_price_format(self):
        """Test price announcement uses correct voice-friendly format"""
        import asyncio

        from agent import check_tradein_price

        class MockContext:
            pass

        async def run_test():
            result = await check_tradein_price(MockContext(), "PS4 Pro 1TB")

            # Should contain voice-friendly format
            assert "Yes, we trade this" in result, (
                f"Price announcement missing 'Yes, we trade this'"
            )
            assert "dollars" in result, f"Should use 'dollars' not '$' symbol"
            assert "Want to proceed?" in result, f"Missing 'Want to proceed?'"

            # Should NOT contain old format
            assert "is worth about" not in result, (
                f"Should not use old 'is worth about' format"
            )
            assert "$" not in result or "dollars" in result, (
                f"Should convert $ to 'dollars'"
            )

        asyncio.run(run_test())


class TestTTSCurrencyNormalization:
    """Test Fix #3: TTS currency normalization"""

    def test_currency_conversion(self):
        """Test S$200 → '200 dollars' conversion"""
        from agent import _normalize_voice_currency

        test_cases = [
            ("S$200", "200 dollars"),
            ("$150", "150 dollars"),
            ("S$ 99", "99 dollars"),
            ("Trade-in value is S$350", "Trade-in value is 350 dollars"),
            ("Price: $1,500", "Price: 1500 dollars"),
        ]

        for input_text, expected_output in test_cases:
            result = _normalize_voice_currency(input_text)
            assert expected_output in result, (
                f"Input '{input_text}' should contain '{expected_output}', got '{result}'"
            )

    def test_no_s_dollar_in_output(self):
        """Ensure 'S dollar' or 'S$' is not in TTS output"""
        from agent import _normalize_voice_currency

        inputs = ["S$100", "S$ 200", "S$1,500"]

        for input_text in inputs:
            result = _normalize_voice_currency(input_text)
            assert "S$" not in result, f"Should not contain 'S$' in output: {result}"
            assert "S dollar" not in result, (
                f"Should not contain 'S dollar' in output: {result}"
            )


class TestLocationCheckMandatory:
    """Test Fix #4: Singapore location check for warranty/support"""

    def test_warranty_triggers_location_check(self):
        """Test warranty request triggers 'Are you in Singapore?'"""
        from agent import _maybe_force_reply

        warranty_queries = [
            "I want to check my warranty",
            "Is my device covered under warranty?",
            "Warranty check for my laptop",
        ]

        for query in warranty_queries:
            response = _maybe_force_reply(query)
            assert response == "Are you in Singapore?", (
                f"Warranty query '{query}' should ask location first"
            )

    def test_support_triggers_location_check(self):
        """Test support request triggers location check"""
        from agent import _maybe_force_reply

        support_queries = [
            "Can I speak to staff?",
            "I need help",
            "Contact customer service",
        ]

        for query in support_queries:
            response = _maybe_force_reply(query)
            assert response == "Are you in Singapore?", (
                f"Support query '{query}' should ask location first"
            )

    def test_international_location_rejection(self):
        """Test non-Singapore locations are rejected"""
        from agent import _maybe_force_reply

        international_queries = [
            "I'm from Malaysia",
            "Ship to Indonesia",
            "I'm in Thailand",
            "Based in USA",
        ]

        for query in international_queries:
            response = _maybe_force_reply(query)
            assert response is not None, f"Query '{query}' should trigger rejection"
            assert "Singapore only" in response, f"Should mention 'Singapore only'"


class TestBrandModelValidation:
    """Test Fix #5: Brand/model validation before submission"""

    def test_submission_blocked_without_brand(self):
        """Test submission is blocked if brand is missing"""
        import asyncio

        from agent import TradeInChecklistState, _checklist_states, tradein_submit_lead

        class MockContext:
            pass

        async def run_test():
            # Create a checklist state without brand/model
            session_id = "test-session-validation"
            state = TradeInChecklistState()
            state.collected_data = {
                "name": "Test User",
                "phone": "12345678",
                "email": "test@example.com",
                # Missing brand and model!
            }
            _checklist_states[session_id] = state

            # Mock get_job_context to return our session
            from unittest.mock import Mock, patch

            mock_room = Mock()
            mock_room.name = session_id
            mock_context = Mock()
            mock_context.room = mock_room

            with patch("agent.get_job_context", return_value=mock_context):
                result = await tradein_submit_lead(MockContext(), summary="Test")

            # Should be blocked
            assert "Cannot submit" in result, (
                f"Should block submission without brand/model"
            )
            assert "brand and model are missing" in result, (
                f"Should mention missing brand/model"
            )

        asyncio.run(run_test())


class TestOneQuestionRule:
    """Test Fix #6: ONE question per response enforcement"""

    def test_instructions_enforce_one_question(self):
        """Verify instructions contain ONE question rule"""
        from agent import VoiceAssistant

        assistant = VoiceAssistant()
        instructions = assistant.instructions

        # Check for ONE question enforcement
        assert "ONE QUESTION" in instructions, (
            "Instructions should emphasize ONE question rule"
        )
        assert "one at a time" in instructions.lower(), "Should say 'one at a time'"

        # Check for anti-patterns
        assert "NEVER combine" in instructions or "DO NOT combine" in instructions, (
            "Should warn against combining questions"
        )


class TestDeterministicFlow:
    """Test deterministic trade-in flow order"""

    def test_flow_order_in_instructions(self):
        """Verify deterministic flow order is documented"""
        from agent import VoiceAssistant

        assistant = VoiceAssistant()
        instructions = assistant.instructions

        # Check flow is documented
        expected_steps = [
            "storage",
            "condition",
            "accessories",
            "photos",
            "email",
            "phone",
            "name",
            "payout",
        ]

        # Find the section with the flow
        for step in expected_steps:
            assert step in instructions.lower(), f"Flow should mention '{step}' step"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
