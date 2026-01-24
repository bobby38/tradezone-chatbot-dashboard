import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getClientIdentifier } from "@/lib/security/rateLimit";
import { verifyApiKey } from "@/lib/security/auth";

const ALLOWED_ORIGINS = [
  "https://tradezone.sg",
  "https://www.tradezone.sg",
  "https://rezult.co",
  "https://www.rezult.co",
  "https://trade.rezult.co",
  "https://sabaisensations.com",
  "https://www.sabaisensations.com",
  ...(process.env.NODE_ENV === "development"
    ? [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3003",
      ]
    : []),
];

function getCorsHeaders(origin: string | null): HeadersInit {
  const allowedOrigin =
    origin &&
    ALLOWED_ORIGINS.some((allowed) =>
      origin.includes(allowed.replace("https://", "").replace("http://", "")),
    )
      ? origin
      : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return NextResponse.json({}, { headers: getCorsHeaders(origin) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  const clientIp = getClientIdentifier(request);

  const authResult = verifyApiKey(request);
  if (!authResult.authenticated) {
    return NextResponse.json(
      { success: false, error: authResult.error || "Unauthorized" },
      { status: 401, headers: corsHeaders },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json(
      { success: false, error: "Server misconfigured" },
      { status: 500, headers: corsHeaders },
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400, headers: corsHeaders },
    );
  }

  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const userTranscript =
    typeof body.userTranscript === "string" ? body.userTranscript.trim() : "";
  const assistantTranscript =
    typeof body.assistantTranscript === "string"
      ? body.assistantTranscript.trim()
      : "";
  const linksMarkdown =
    typeof body.linksMarkdown === "string" ? body.linksMarkdown.trim() : null;
  const status = typeof body.status === "string" ? body.status : "partial";
  const userId = typeof body.userId === "string" ? body.userId : sessionId;

  if (!sessionId || !userTranscript) {
    return NextResponse.json(
      { success: false, error: "sessionId and userTranscript are required" },
      { status: 400, headers: corsHeaders },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Compute next turn index for ordering
  let turnIndex = 0;
  try {
    const { data, error } = await supabase
      .from("chat_logs")
      .select("turn_index")
      .eq("session_id", sessionId)
      .order("turn_index", { ascending: false })
      .limit(1);
    if (!error && data && data.length > 0) {
      const current = data[0]?.turn_index;
      if (typeof current === "number") {
        turnIndex = current + 1;
      }
    }
  } catch (err) {
    // Continue with default turnIndex = 0
  }

  try {
    await supabase.from("chat_logs").insert({
      session_id: sessionId,
      user_id: userId,
      prompt: userTranscript,
      response: assistantTranscript || null,
      source: "chatkit_voice",
      status: status || "partial",
      turn_index: turnIndex,
      created_at: new Date().toISOString(),
      metadata: linksMarkdown ? { linksMarkdown, clientIp } : { clientIp },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to log" },
      { status: 500, headers: corsHeaders },
    );
  }

  return NextResponse.json({ success: true }, { headers: corsHeaders });
}
