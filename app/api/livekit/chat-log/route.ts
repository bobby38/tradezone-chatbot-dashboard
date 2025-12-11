import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  verifyApiKey,
  authErrorResponse,
  isAuthRequired,
} from "@/lib/security/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Save voice chat logs to Supabase
 * Called by Python LiveKit agent
 */
export async function POST(req: NextRequest) {
  console.log("[LiveKit Chat Log] ========== NEW REQUEST ==========");
  console.log("[LiveKit Chat Log] Timestamp:", new Date().toISOString());
  console.log("[LiveKit Chat Log] Environment check:", {
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  // Authentication
  if (isAuthRequired()) {
    console.log("[LiveKit Chat Log] Auth required, verifying...");
    const authResult = verifyApiKey(req);
    if (!authResult.authenticated) {
      console.log("[LiveKit Chat Log] ❌ Auth failed:", authResult.error);
      return authErrorResponse(authResult.error);
    }
    console.log("[LiveKit Chat Log] ✅ Auth passed");
  } else {
    console.log("[LiveKit Chat Log] ⚠️ Auth disabled in this environment");
  }

  try {
    const {
      session_id,
      user_message,
      agent_message,
      room_name,
      participant_identity,
    } = await req.json();

    console.log("[LiveKit Chat Log] Payload:", {
      session_id,
      has_user_msg: !!user_message,
      has_agent_msg: !!agent_message,
      user_msg_preview: user_message?.substring(0, 50),
      agent_msg_preview: agent_message?.substring(0, 50),
      room_name,
      participant_identity,
    });

    if (!session_id || (!user_message && !agent_message)) {
      console.log(
        "[LiveKit Chat Log] ❌ Validation failed: missing required fields",
      );
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Get current turn index
    console.log(
      "[LiveKit Chat Log] Querying turn count for session:",
      session_id,
    );
    const { count: turnCount, error: countError } = await supabase
      .from("chat_logs")
      .select("*", { count: "exact", head: true })
      .eq("session_id", session_id);

    if (countError) {
      console.error("[LiveKit Chat Log] ❌ Count query failed:", countError);
    } else {
      console.log("[LiveKit Chat Log] Current turn count:", turnCount);
    }

    const turnIndex = (turnCount || 0) + 1;

    // Save user message if provided
    if (user_message) {
      console.log("[LiveKit Chat Log] Attempting to save user message...");
      const userData = {
        user_id: participant_identity || "voice-user",
        prompt: user_message,
        response: "",
        session_id,
        session_name: `Voice: ${user_message.substring(0, 50)}...`,
        status: "user_message",
        turn_index: turnIndex,
        source: "livekit-voice",
        channel: "voice",
        metadata: { room_name, participant_identity },
        timestamp: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      console.log(
        "[LiveKit Chat Log] User data to insert:",
        JSON.stringify(userData, null, 2),
      );

      const { data: userData_result, error: userError } = await supabase
        .from("chat_logs")
        .insert(userData);

      if (userError) {
        console.error(
          "[LiveKit Chat Log] ❌ Failed to save user message:",
          JSON.stringify(userError, null, 2),
        );
        throw userError;
      }
      console.log("[LiveKit Chat Log] ✅ User message saved successfully");
    }

    // Save agent message if provided
    if (agent_message) {
      console.log("[LiveKit Chat Log] Attempting to save agent message...");
      const agentData = {
        user_id: participant_identity || "voice-user",
        prompt: user_message || "",
        response: agent_message,
        session_id,
        session_name: `Voice: ${(user_message || agent_message).substring(0, 50)}...`,
        status: "completed",
        turn_index: turnIndex + (user_message ? 1 : 0),
        source: "livekit-voice",
        channel: "voice",
        metadata: { room_name, participant_identity },
        timestamp: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      console.log(
        "[LiveKit Chat Log] Agent data to insert:",
        JSON.stringify(agentData, null, 2),
      );

      const { data: agentData_result, error: agentError } = await supabase
        .from("chat_logs")
        .insert(agentData);

      if (agentError) {
        console.error(
          "[LiveKit Chat Log] ❌ Failed to save agent message:",
          JSON.stringify(agentError, null, 2),
        );
        throw agentError;
      }
      console.log("[LiveKit Chat Log] ✅ Agent message saved successfully");
    }

    console.log("[LiveKit Chat Log] ========== SUCCESS ==========");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[LiveKit Chat Log] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to save chat log",
      },
      { status: 500 },
    );
  }
}
