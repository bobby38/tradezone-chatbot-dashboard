import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DEFAULT_ORG_ID = "765e1172-b666-471f-9b42-f80c9b5006de";

/**
 * ChatKit Realtime Voice API
 * Returns configuration for OpenAI Realtime API voice sessions
 */
export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    // Load admin-configured voice settings from Supabase
    const { data: org } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", DEFAULT_ORG_ID)
      .single();

    const settings = org?.settings?.chatkit || {};
    const voiceModel = settings.voiceModel || "gpt-4o-realtime-preview";
    const voice = settings.voice || "alloy";
    const vectorStoreId =
      process.env.OPENAI_VECTOR_STORE_ID ||
      "vs_68e89cf979e88191bb8b4882caadbc0d";

    console.log(
      `[Realtime API] Initializing voice session: ${sessionId}, Model: ${voiceModel}, Voice: ${voice}`,
    );

    // Return configuration for client to connect to OpenAI Realtime API
    // In production, you should generate ephemeral tokens instead of exposing the API key
    return NextResponse.json({
      success: true,
      config: {
        model: voiceModel,
        voice: voice,
        sessionId: sessionId,
        vectorStoreId: vectorStoreId,
        // WebSocket connection details
        websocketUrl: "wss://api.openai.com/v1/realtime",
        // WARNING: In production, use ephemeral tokens instead
        apiKey: process.env.OPENAI_API_KEY,
        // Additional configuration
        instructions:
          settings.systemPrompt ||
          "You are Izacc, a friendly assistant from TradeZone.sg",
        turnDetection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        // Voice settings
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        input_audio_transcription: {
          model: "whisper-1",
        },
      },
    });
  } catch (error) {
    console.error("[Realtime API] Error:", error);

    return NextResponse.json(
      {
        error: "Failed to initialize voice session",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: "healthy",
    service: "ChatKit Realtime Voice API",
    timestamp: new Date().toISOString(),
    availableModels: [
      "gpt-realtime-mini",
      "gpt-4o-realtime-preview",
      "gpt-4o-mini-realtime-preview",
    ],
    availableVoices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
  });
}
