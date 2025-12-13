"""
Test Python pricing system for voice agent
"""

import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(__file__))

from auto_save import detect_and_fix_trade_up_prices, lookup_price, needs_clarification

print("=" * 80)
print("TESTING PYTHON PRICING SYSTEM")
print("=" * 80)

# Test 1: Nintendo Switch pricing
print("\n1. Testing Nintendo Switch Lite → Nintendo Switch 2")
result = detect_and_fix_trade_up_prices("Nintendo Switch Lite", "Nintendo Switch 2")
if result:
    if result.get("needs_clarification"):
        print(f"   ⚠️  NEEDS CLARIFICATION:")
        if result.get("source_question"):
            print(f"   Source: {result['source_question']}")
        if result.get("target_question"):
            print(f"   Target: {result['target_question']}")
    else:
        print(f"   ✅ Trade-in: ${result['trade_value']}")
        print(f"   ✅ Retail: ${result['retail_price']}")
        print(f"   ✅ Top-up: ${result['top_up']}")

        # Verify correctness
        if result["trade_value"] == 60 and result["retail_price"] == 500:
            print("   🎉 CORRECT PRICES!")
        else:
            print(f"   ❌ WRONG! Should be: Trade $60, Retail $500")
else:
    print("   ❌ FAILED - No result")

# Test 2: Ambiguous query - just "PS5"
print("\n2. Testing ambiguous 'PS5' query")
clarification = needs_clarification("PS5")
if clarification:
    print(f"   ✅ Smart question: {clarification}")
else:
    print("   ❌ Should ask for clarification!")

# Test 3: Specific PS5 model
print("\n3. Testing specific: PS5 Slim 1TB Digital → PS5 Pro 2TB Digital")
result = detect_and_fix_trade_up_prices("PS5 Slim 1TB Digital", "PS5 Pro 2TB Digital")
if result and not result.get("needs_clarification"):
    print(f"   ✅ Trade-in: ${result['trade_value']}")
    print(f"   ✅ Retail: ${result['retail_price']}")
    print(f"   ✅ Top-up: ${result['top_up']}")

    # Verify correctness
    if result["trade_value"] == 350 and result["retail_price"] == 900:
        print("   🎉 CORRECT PRICES!")
    else:
        print(f"   ❌ WRONG! Should be: Trade $350, Retail $900")
else:
    print("   ❌ FAILED")

# Test 4: Steam Deck with variants
print("\n4. Testing ambiguous 'Steam Deck' query")
clarification = needs_clarification("Steam Deck")
if clarification:
    print(f"   ✅ Smart question: {clarification}")
else:
    print("   ❌ Should ask for clarification!")

# Test 5: Specific Steam Deck
print("\n5. Testing specific: Steam Deck LCD 512GB")
price = lookup_price("Steam Deck LCD 512GB", "preowned")
if price == 250:
    print(f"   ✅ Correct trade-in: ${price}")
else:
    print(f"   ❌ Wrong price: ${price} (should be $250)")

print("\n" + "=" * 80)
print("TEST COMPLETE")
print("=" * 80)
