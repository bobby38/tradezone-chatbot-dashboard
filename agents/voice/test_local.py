"""
Local test script for TradeZone agent
Tests without needing LiveKit Cloud
"""

import asyncio

from agent import searchProducts, searchtool, tradein_update_lead


async def test_tools():
    """Test that tools can call Next.js APIs"""

    print("\n🧪 Testing TradeZone Voice Agent Tools\n")

    # Test 1: Search Products
    print("1️⃣ Testing searchProducts...")
    result = await searchProducts("PS5 games")
    print(f"   Result: {result[:100]}...\n")

    # Test 2: Search Website
    print("2️⃣ Testing searchtool...")
    result = await searchtool("return policy")
    print(f"   Result: {result[:100]}...\n")

    # Test 3: Trade-in Update
    print("3️⃣ Testing tradein_update_lead...")
    result = await tradein_update_lead(
        brand="Sony", model="PlayStation 5", storage="1TB", condition="good"
    )
    print(f"   Result: {result}\n")

    print("✅ All tool tests completed!\n")
    print("Next steps:")
    print("1. Sign up for LiveKit Cloud: https://cloud.livekit.io")
    print("2. Add LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET to .env.local")
    print("3. Run: python agent.py dev")


if __name__ == "__main__":
    asyncio.run(test_tools())
