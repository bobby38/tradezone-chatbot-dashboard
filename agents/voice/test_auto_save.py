"""
Test the auto-save system with the conversation transcript from the logs.
This simulates the conversation without needing voice input.
"""

import asyncio
import sys

sys.path.insert(
    0, "/Users/bobbymini/Documents/tradezone-chatbot-dashboard/agents/voice"
)

from auto_save import (
    extract_data_from_message,
    auto_save_after_message,
    check_for_confirmation_and_submit,
)


class MockChecklistState:
    def __init__(self):
        self.collected_data = {}
        self.is_trade_up = True
        self.current_step_index = 0
        self.STEPS = [
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

    def mark_field_collected(self, field, value):
        self.collected_data[field] = value
        print(f"✅ Marked {field} = {value}")

    def get_current_step(self):
        if self.current_step_index >= len(self.STEPS):
            return "completed"
        return self.STEPS[self.current_step_index]

    def is_complete(self):
        required = ["brand", "model", "condition", "name", "phone", "email"]
        return all(f in self.collected_data for f in required)


def test_extraction():
    """Test extraction from real conversation"""
    print("\n" + "=" * 80)
    print("TESTING DATA EXTRACTION FROM CONVERSATION")
    print("=" * 80 + "\n")

    conversation = [
        (
            "I want to trade MSI Claw 1TB against PS5 Pro 2TB digital.",
            "Should extract: model=MSI Claw 1TB, storage=1TB",
        ),
        ("Babi bi obebi wɔ.", "Should extract: name (if current step is name)"),
        ("848 9068", "Should extract: phone=84489068"),
        ("bobby_denny@hotmail.com.", "Should extract: email=bobby_denny@hotmail.com"),
        ("Good", "Should extract: condition=good"),
        ("Yes.", "Should extract: accessories=yes (if context is box/accessories)"),
    ]

    checklist = MockChecklistState()

    for user_msg, expected in conversation:
        print(f"\n📝 User: {user_msg}")
        print(f"   Expected: {expected}")

        extracted = extract_data_from_message(user_msg, checklist)

        if extracted:
            print(f"   ✅ Extracted: {extracted}")
            for field, value in extracted.items():
                if field == "contact_name":
                    checklist.mark_field_collected("name", value)
                elif field == "contact_phone":
                    checklist.mark_field_collected("phone", value)
                elif field == "contact_email":
                    checklist.mark_field_collected("email", value)
                else:
                    checklist.mark_field_collected(field, value)
        else:
            print(f"   ⚠️  No extraction")

    print("\n" + "=" * 80)
    print("FINAL CHECKLIST STATE:")
    print("=" * 80)
    print(f"Collected data: {checklist.collected_data}")
    print(f"Is complete: {checklist.is_complete()}")

    # Check what's missing
    required = ["brand", "model", "condition", "name", "phone", "email"]
    missing = [f for f in required if f not in checklist.collected_data]
    if missing:
        print(f"❌ Missing: {missing}")
    else:
        print("✅ All required fields collected!")


def test_confirmation_detection():
    """Test confirmation detection"""
    print("\n" + "=" * 80)
    print("TESTING CONFIRMATION DETECTION")
    print("=" * 80 + "\n")

    test_cases = [
        (
            "Yes, ok. Bye bye.",
            "Here are your contact details: Name: Bobby, Phone: 84489068, Email: bobby_dennie@hotmail.com. Everything correct?",
            True,
        ),
        ("Yes.", "Condition of your MSI Claw? Mint, good, fair, or faulty?", False),
        (
            "Sure, that's right",
            "All set! We'll review and contact you to arrange. Anything else?",
            True,
        ),
        ("No, wrong email", "Everything correct?", False),
    ]

    for user_msg, bot_msg, should_trigger in test_cases:
        print(f"\n📝 User: {user_msg}")
        print(f"🤖 Bot: {bot_msg}")
        print(f"   Expected trigger: {should_trigger}")

        # Check logic
        lower_user = user_msg.lower()
        lower_bot = bot_msg.lower()

        confirmation_phrases = [
            "everything correct",
            "all set",
            "confirm",
            "is that right",
            "sound good",
        ]
        user_confirmed = any(
            word in lower_user
            for word in ["yes", "correct", "ok", "okay", "yep", "yeah", "sure"]
        )
        bot_asked = any(phrase in lower_bot for phrase in confirmation_phrases)

        triggered = bot_asked and user_confirmed

        if triggered == should_trigger:
            print(
                f"   ✅ Correct! {'Would submit' if triggered else 'Would not submit'}"
            )
        else:
            print(f"   ❌ Wrong! Got {triggered}, expected {should_trigger}")


if __name__ == "__main__":
    test_extraction()
    test_confirmation_detection()

    print("\n" + "=" * 80)
    print("TEST COMPLETE")
    print("=" * 80 + "\n")
    test_confirmation_detection()

    print("\n" + "="*80)
    print("TEST COMPLETE")
    print("="*80 + "\n")
