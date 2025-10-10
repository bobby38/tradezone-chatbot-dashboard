import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { sessionId } = await req.json();

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "Session ID is required" },
        { status: 400 },
      );
    }

    // Support both GPT-4o Realtime and GPT-4o-mini Realtime
    const model = process.env.OPENAI_REALTIME_MODEL || "gpt-4o-mini-realtime-preview-2024-12-17";
    
    const config = {
      apiKey: process.env.OPENAI_API_KEY,
      websocketUrl: "wss://api.openai.com/v1/realtime",
      model,
      voice: "alloy",
      vectorStoreId: process.env.OPENAI_VECTOR_STORE_ID,
    };

    if (!config.apiKey || !config.vectorStoreId) {
      console.error("Missing OpenAI API key or Vector Store ID");
      return NextResponse.json(
        { success: false, error: "Server configuration missing" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error("[Realtime API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
