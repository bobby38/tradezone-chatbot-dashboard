import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  verifyApiKey,
  authErrorResponse,
  isAuthRequired,
} from "@/lib/security/auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface LiveKitChatRequest {
  session_id: string;
  user_message?: string;
  agent_message?: string;
  room_name?: string;
  participant_identity?: string;
}

/**
 * Save voice chat logs to Supabase
 * Called by Python LiveKit agent - follows same structure as /api/n8n-chat
 */
export async function POST(req: NextRequest) {
  // Authentication
  if (isAuthRequired()) {
    const authResult = verifyApiKey(req);
    if (!authResult.authenticated) {
      return authErrorResponse(authResult.error);
    }
  }

  try {
    const {
      session_id,
      user_message,
      agent_message,
      room_name,
      participant_identity,
    }: LiveKitChatRequest = await req.json();

    // Validate required fields
    if (!session_id || (!user_message && !agent_message)) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          required: ["session_id", "user_message or agent_message"],
          received: {
            session_id: !!session_id,
            user_message: !!user_message,
            agent_message: !!agent_message,
          },
        },
        { status: 400 },
      );
    }

    // Convert messages to strings if they're arrays
    const userMsg = Array.isArray(user_message)
      ? user_message.join(" ")
      : user_message;
    const agentMsg = Array.isArray(agent_message)
      ? agent_message.join(" ")
      : agent_message;

    const userId = participant_identity || "voice-user";
    const userAgent = req.headers.get("user-agent") || "livekit-agent";

    // Get next turn index for this session
    const { count: turnCount } = await supabase
      .from("chat_logs")
      .select("*", { count: "exact", head: true })
      .eq("session_id", session_id);

    const turnIndex = (turnCount || 0) + 1;

    // Generate session name from first message
    const firstMessage = userMsg || agentMsg || "Voice Chat";
    const sessionName =
      firstMessage.length > 50
        ? firstMessage.substring(0, 47) + "..."
        : firstMessage;

    // Save user message if provided
    if (userMsg) {
      const { error: userError } = await supabase.from("chat_logs").insert({
        user_id: userId,
        prompt: userMsg,
        response: "",
        session_id,
        session_name: `Voice: ${sessionName}`,
        status: "user_message",
        turn_index: turnIndex,
        source: "livekit-voice",
        channel: "voice",
        user_agent: userAgent,
        metadata: { room_name, participant_identity },
        timestamp: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });

      if (userError) {
        console.error("Error inserting user message:", userError);
        throw userError;
      }
    }

    // Save agent message if provided
    if (agentMsg) {
      const { error: agentError } = await supabase.from("chat_logs").insert({
        user_id: userId,
        prompt: userMsg || "",
        response: agentMsg,
        session_id,
        session_name: `Voice: ${sessionName}`,
        status: "completed",
        turn_index: userMsg ? turnIndex + 1 : turnIndex,
        source: "livekit-voice",
        channel: "voice",
        user_agent: userAgent,
        metadata: { room_name, participant_identity },
        timestamp: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });

      if (agentError) {
        console.error("Error inserting agent message:", agentError);
        throw agentError;
      }
    }

    return NextResponse.json({
      success: true,
      message: "Chat log saved successfully",
      data: {
        session_id,
        turn_index: turnIndex,
      },
    });
  } catch (error) {
    console.error("LiveKit chat log error:", error);

    return NextResponse.json(
      {
        error: "Failed to save chat log",
        details: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
