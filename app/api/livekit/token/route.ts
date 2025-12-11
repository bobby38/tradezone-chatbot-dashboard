import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const { roomName, participantName } = await req.json();

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL;

    console.log("[LiveKit Token] Environment check:", {
      hasApiKey: !!apiKey,
      hasApiSecret: !!apiSecret,
      hasUrl: !!livekitUrl,
      apiKeyPrefix: apiKey?.substring(0, 7),
      urlPrefix: livekitUrl?.substring(0, 20),
    });

    if (!apiKey || !apiSecret) {
      console.error("[LiveKit Token] Missing credentials!");
      return NextResponse.json(
        { error: "LiveKit credentials not configured" },
        { status: 500, headers: corsHeaders },
      );
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantName || "user-" + Date.now(),
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    // Dispatch agent to the room
    try {
      const apiUrl = process.env.LIVEKIT_URL?.replace(
        "wss://",
        "https://",
      ).replace("ws://", "http://");
      const dispatchResponse = await fetch(
        `${apiUrl}/twirp/livekit.AgentDispatchService/CreateDispatch`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            room: roomName,
            agent_name: "amara",
          }),
        },
      );

      if (!dispatchResponse.ok) {
        console.error(
          "[LiveKit] Agent dispatch failed:",
          await dispatchResponse.text(),
        );
      } else {
        console.log("[LiveKit] Agent dispatched to room:", roomName);
      }
    } catch (error: any) {
      console.error("[LiveKit] Agent dispatch error:", error.message);
      // Don't fail the token request if dispatch fails
    }

    return NextResponse.json(
      {
        token,
        url: process.env.LIVEKIT_URL,
      },
      { headers: corsHeaders },
    );
  } catch (error: any) {
    console.error("[LiveKit Token] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate token" },
      { status: 500, headers: corsHeaders },
    );
  }
}
