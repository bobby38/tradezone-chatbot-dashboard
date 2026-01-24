import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authErrorResponse, verifyAdminAccess } from "@/lib/security/auth";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * GET /api/tradein/debug/[id]
 * Debug endpoint to check trade-in lead media and session info
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = verifyAdminAccess(request);
    if (!auth.authenticated) {
      return authErrorResponse(auth.error);
    }

    const { id } = params;

    // Get lead details
    const { data: lead, error: leadError } = await supabase
      .from("trade_in_leads")
      .select("*")
      .eq("id", id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found", details: leadError },
        { status: 404 },
      );
    }

    // Get media records
    const { data: media, error: mediaError } = await supabase
      .from("trade_in_media")
      .select("*")
      .eq("lead_id", id);

    // Get actions
    const { data: actions, error: actionsError } = await supabase
      .from("trade_in_actions")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: false });

    // Check if there are any leads with the same session_id
    const { data: relatedLeads, error: relatedError } = await supabase
      .from("trade_in_leads")
      .select("id, session_id, created_at, status")
      .eq("session_id", lead.session_id)
      .order("created_at", { ascending: false });

    return NextResponse.json({
      lead: {
        id: lead.id,
        session_id: lead.session_id,
        status: lead.status,
        created_at: lead.created_at,
        contact_name: lead.contact_name,
        brand: lead.brand,
        model: lead.model,
      },
      media: {
        count: media?.length || 0,
        records: media || [],
        error: mediaError,
      },
      actions: {
        count: actions?.length || 0,
        media_uploads:
          actions?.filter((a) => a.action_type === "media_uploaded") || [],
        all_actions: actions || [],
        error: actionsError,
      },
      related_leads: {
        count: relatedLeads?.length || 0,
        leads: relatedLeads || [],
        error: relatedError,
      },
    });
  } catch (error) {
    console.error("[Debug] Error:", error);
    return NextResponse.json(
      {
        error: "Debug failed",
        details: error instanceof Error ? error.message : "Unknown",
      },
      { status: 500 },
    );
  }
}
