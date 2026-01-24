import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authErrorResponse, verifyAdminAccess } from "@/lib/security/auth";

export async function GET(req: NextRequest) {
  const auth = verifyAdminAccess(req);
  if (!auth.authenticated) {
    return authErrorResponse(auth.error);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return NextResponse.json({
    environment: {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey,
      urlMatch: supabaseUrl === "https://jvkmxtbckpfwypnbubdy.supabase.co",
      serviceKeyLength: supabaseServiceKey?.length || 0,
      nodeEnv: process.env.NODE_ENV,
    },
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const auth = verifyAdminAccess(req);
    if (!auth.authenticated) {
      return authErrorResponse(auth.error);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        {
          error: "Missing credentials",
          hasUrl: !!supabaseUrl,
          hasServiceKey: !!supabaseServiceKey,
        },
        { status: 500 },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Test insert exactly like webhook
    const testData = {
      user_id: "7696939b-4bb3-4c76-bf63-0c47db8119e9",
      org_id: "765e1172-b666-471f-9b42-f80c9b5006de",
      title: "TEST: Production webhook verification",
      content_input: JSON.stringify({
        test: "production verification",
        timestamp: new Date().toISOString(),
        source: "test-webhook-endpoint",
      }),
      content_type: "Form Submission",
      ai_metadata: { test: true, source: "test-endpoint" },
      status: "ready",
    };

    const { data, error } = await supabaseAdmin
      .from("submissions")
      .insert(testData)
      .select();

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: "Database insert failed",
          errorDetails: error,
          testData,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Test successful - data saved to database",
      insertedId: data?.[0]?.id,
      environment: process.env.NODE_ENV,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Test failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
