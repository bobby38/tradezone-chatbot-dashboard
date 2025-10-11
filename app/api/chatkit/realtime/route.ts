import { NextResponse } from "next/server";

// CORS headers for widget integration
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Handle OPTIONS request for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const { sessionId } = await req.json();

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "Session ID is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    // Support both GPT-4o Realtime and GPT-4o-mini Realtime
    const model =
      process.env.OPENAI_REALTIME_MODEL ||
      "gpt-4o-mini-realtime-preview-2024-12-17";

    const config = {
      apiKey: process.env.OPENAI_API_KEY,
      websocketUrl: "wss://api.openai.com/v1/realtime",
      model,
      voice: "alloy",
      vectorStoreId: process.env.OPENAI_VECTOR_STORE_ID,

      // Full session configuration for both dashboard and widget
      sessionConfig: {
        modalities: ["text", "audio"],
        instructions: `You are Amara, TradeZone.sg's helpful AI assistant for gaming gear and electronics.

## Quick Answers (Answer instantly - NO tool calls)
- What is TradeZone.sg? → TradeZone.sg buys and sells new and second-hand electronics, gaming gear, and gadgets in Singapore.
- Where are you located? → 21 Hougang St 51, #02-09, Hougang Green Shopping Mall, Singapore 538719.
- Opening hours? → Daily 11 am – 8 pm.
- Shipping? → Flat $5, 1–3 business days within Singapore via EasyParcel.
- Categories? → Console games, PlayStation items, graphic cards, mobile phones, plus trade-ins.
- Payment & returns? → Cards, PayNow, PayPal. Returns on unopened items within 14 days.
- Store pickup? → Yes—collect at our Hougang Green outlet during opening hours.
- Support? → contactus@tradezone.sg, phone, or live chat on the site.

## Available Tools (Use only when needed)
1. **searchProducts** - Search TradeZone product catalog (use FIRST for product queries like "PS5", "gaming keyboard", etc.)
2. **searchtool** - Search TradeZone website for detailed info (policies, trade-ins, promotions, guides, store info)
3. **sendemail** - Send inquiry to staff (ONLY when customer explicitly requests contact or follow-up)

## Instructions
- Answer FAQ questions directly from the Quick Answers list above - DO NOT use tools for these
- For **product queries** (prices, availability, specs), use **searchProducts** FIRST
- For **trade-ins, policies, promotions, or store info**, use **searchtool** (searches website pages)
- Be friendly, concise, and natural - speak as if helping a customer in-store
- Keep responses brief for voice chat, but always include important details like product links and prices if available.
- Always review the recent conversation history to understand the user's context. If you have already provided a list of products, and the user asks for more details about one of them, use the tools again to get the specific details for that product.
- When a product has a URL, always provide it to the user by saying "You can find it here:" followed by the URL.
- If user interrupts or speaks, STOP immediately and listen
- Prioritize speed and brevity over completeness`,
        input_audio_transcription: {
          model: "whisper-1",
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 200,
        },
        tools: [
          {
            type: "function",
            name: "searchProducts",
            description:
              "Search TradeZone product catalog using vector database. Use this FIRST for all product-related queries including gaming consoles, laptops, phones, accessories, pricing and availability.",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The product search query",
                },
              },
              required: ["query"],
            },
          },
          {
            type: "function",
            name: "searchtool",
            description:
              "Search TradeZone website and web for general information. Use this if searchProducts doesn't find what you need.",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The search query",
                },
              },
              required: ["query"],
            },
          },
          {
            type: "function",
            name: "sendemail",
            description:
              "Send an email inquiry to TradeZone staff. Only use when customer explicitly requests to be contacted or wants staff to follow up.",
            parameters: {
              type: "object",
              properties: {
                emailType: {
                  type: "string",
                  enum: ["trade_in", "info_request", "contact"],
                  description: "Type of inquiry",
                },
                name: {
                  type: "string",
                  description: "Customer name",
                },
                email: {
                  type: "string",
                  description: "Customer email address",
                },
                phone_number: {
                  type: "string",
                  description: "Customer phone number (optional)",
                },
                message: {
                  type: "string",
                  description: "Customer inquiry or request details",
                },
              },
              required: ["emailType", "name", "email", "message"],
            },
          },
        ],
        tool_choice: "auto",
      },
    };

    if (!config.apiKey || !config.vectorStoreId) {
      console.error("Missing OpenAI API key or Vector Store ID");
      return NextResponse.json(
        { success: false, error: "Server configuration missing" },
        { status: 500, headers: corsHeaders },
      );
    }

    return NextResponse.json(
      { success: true, config },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("[Realtime API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500, headers: corsHeaders },
    );
  }
}
