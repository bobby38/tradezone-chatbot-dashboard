import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authErrorResponse, verifyAdminAccess } from "@/lib/security/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(request: NextRequest) {
  try {
    const auth = verifyAdminAccess(request);
    if (!auth.authenticated) {
      return authErrorResponse(auth.error);
    }

    const body = await request.json();
    const { leadIds } = body;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json(
        { error: "Invalid or empty leadIds array" },
        { status: 400 },
      );
    }

    // Delete all leads with the given IDs
    const { error, count } = await supabase
      .from("trade_in_leads")
      .delete()
      .in("id", leadIds);

    if (error) {
      console.error("[BulkDelete] Failed to delete leads:", error);
      return NextResponse.json(
        { error: "Failed to delete leads", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      deletedCount: count || leadIds.length,
      message: `Successfully deleted ${count || leadIds.length} lead(s)`,
    });
  } catch (error) {
    console.error("[BulkDelete] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
