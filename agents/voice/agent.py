"""
TradeZone Voice Agent - LiveKit Integration
Calls existing Next.js APIs to keep logic in sync with text chat
"""
import logging
import os
import httpx
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    cli,
    inference,
    room_io,
    llm,
)
from livekit.plugins import noise_cancellation, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

logger = logging.getLogger("agent-amara")

load_dotenv(".env.local")

# Next.js API base URL
API_BASE_URL = os.getenv("NEXT_PUBLIC_API_URL", "http://localhost:3001")
API_KEY = os.getenv("CHATKIT_API_KEY", "")

class TradeZoneAgent(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="""You are Amara, TradeZone.sg's helpful AI assistant for gaming gear and electronics.

🔴 CRITICAL: Always speak and respond in ENGLISH ONLY, regardless of customer's accent or language.

**Language Policy:**
- ALWAYS respond in English (base language for all interactions)
- Voice transcription may mishear accented English - interpret the INTENT, stay in English
- If customer clearly speaks another language (full sentences in Chinese, French, Thai, etc.):
  * Politely respond in English: "Sorry, I can only assist in English. Can you try in English?"
  * Be understanding and helpful about the language limitation
- DO NOT mix languages or switch randomly because of accent/mispronounced words
- If transcription is unclear, ask in English: "Can you repeat that?"

- Speak in concise phrases (≤12 words). Pause after each short answer and let the caller interrupt.
- Never read markdown, headings like "Quick Links", or URLs aloud
- 🔴 **CRITICAL - NEVER SPEAK URLs**: When listing products, ALWAYS include the clickable link in your response text, but ONLY speak the product name and price. DO NOT say "https" or read any part of the URL out loud.
- 🔴 **CRITICAL - NEVER SPEAK CONTACT DETAILS**: When user provides phone/email, DO NOT read them back. Just say "Got it" (≤3 words).

- Start every call with: "Hi, Amara here. Want product info, trade-in or upgrade help, or a staff member?" Wait for a clear choice before running any tools.
- One voice reply = ≤12 words. Confirm what they asked, share one fact or question, then pause so they can answer.

**Available Tools:**
- searchProducts: Search TradeZone product catalog
- searchtool: Search website for policies, guides
- sendemail: Escalate to staff (only when customer explicitly asks)
- tradein_update_lead: Save trade-in information immediately after user provides it
- tradein_submit_lead: Submit complete trade-in request

Use these tools to help customers with product inquiries, trade-ins, and support requests.""",
        )

    async def on_enter(self):
        await self.session.generate_reply(
            instructions="""Greet the user: "Hi, Amara here. Want product info, trade-in or upgrade help, or a staff member?" """,
            allow_interruptions=True,
        )


# Tool definitions that call Next.js APIs
@llm.ai_callable()
async def searchProducts(query: str) -> str:
    """Search TradeZone product catalog using vector database."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{API_BASE_URL}/api/tools/search",
            json={"query": query, "context": "catalog"},
            headers={"X-API-Key": API_KEY},
            timeout=30.0,
        )
        result = response.json()
        return result.get("result", "No products found")


@llm.ai_callable()
async def searchtool(query: str) -> str:
    """Search TradeZone website for general information."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{API_BASE_URL}/api/tools/search",
            json={"query": query, "context": "website"},
            headers={"X-API-Key": API_KEY},
            timeout=30.0,
        )
        result = response.json()
        return result.get("result", "No information found")


@llm.ai_callable()
async def tradein_update_lead(
    category: str = None,
    brand: str = None,
    model: str = None,
    storage: str = None,
    condition: str = None,
    contact_name: str = None,
    contact_phone: str = None,
    contact_email: str = None,
    preferred_payout: str = None,
    notes: str = None,
) -> str:
    """Update trade-in lead information. Call this IMMEDIATELY after user provides ANY trade-in details."""
    async with httpx.AsyncClient() as client:
        data = {
            k: v
            for k, v in {
                "category": category,
                "brand": brand,
                "model": model,
                "storage": storage,
                "condition": condition,
                "contact_name": contact_name,
                "contact_phone": contact_phone,
                "contact_email": contact_email,
                "preferred_payout": preferred_payout,
                "notes": notes,
            }.items()
            if v is not None
        }

        response = await client.post(
            f"{API_BASE_URL}/api/tradein/update",
            json=data,
            headers={"X-API-Key": API_KEY},
            timeout=10.0,
        )
        result = response.json()
        return result.get("message", "Trade-in information saved")


@llm.ai_callable()
async def tradein_submit_lead(summary: str = None) -> str:
    """Submit the complete trade-in lead. Only call when all required info is collected."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{API_BASE_URL}/api/tradein/submit",
            json={"summary": summary, "notify": True},
            headers={"X-API-Key": API_KEY},
            timeout=10.0,
        )
        result = response.json()
        return result.get("message", "Trade-in submitted successfully")


@llm.ai_callable()
async def sendemail(
    email_type: str,
    name: str,
    email: str,
    message: str,
    phone_number: str = None,
) -> str:
    """Send support escalation to TradeZone staff. Only use when customer explicitly requests human follow-up."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{API_BASE_URL}/api/tools/email",
            json={
                "emailType": email_type,
                "name": name,
                "email": email,
                "message": message,
                "phone_number": phone_number,
            },
            headers={"X-API-Key": API_KEY},
            timeout=10.0,
        )
        result = response.json()
        return result.get("message", "Email sent to staff")


server = AgentServer()


def prewarm(proc: JobProcess):
    """Preload VAD model for better performance"""
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


@server.rtc_session(agent_name="amara")
async def entrypoint(ctx: JobContext):
    """Main entry point for LiveKit voice sessions"""

    # Use Cartesia Sonic for better latency (faster than OpenAI TTS)
    session = AgentSession(
        stt=inference.STT(
            model="deepgram/nova-2-general",  # Low latency STT
            language="en"
        ),
        llm=inference.LLM(
            model="openai/gpt-4.1-mini",  # Fast, cost-effective
            temperature=0.7,
        ),
        tts=inference.TTS(
            model="cartesia/sonic-3",  # Ultra-low latency TTS
            voice="9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",  # Female voice (similar to "nova")
            language="en",
        ),
        turn_detection=MultilingualModel(),
        vad=ctx.proc.userdata["vad"],
        preemptive_generation=True,  # Start generating before user finishes speaking
    )

    # Register tools
    session.register_tool(searchProducts)
    session.register_tool(searchtool)
    session.register_tool(tradein_update_lead)
    session.register_tool(tradein_submit_lead)
    session.register_tool(sendemail)

    await session.start(
        agent=TradeZoneAgent(),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=lambda params: (
                    noise_cancellation.BVCTelephony()
                    if params.participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                    else noise_cancellation.BVC()
                ),
            ),
        ),
    )


if __name__ == "__main__":
    cli.run_app(server)
