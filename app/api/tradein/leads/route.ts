import { NextRequest, NextResponse } from "next/server";
import { listTradeInLeads } from "@/lib/trade-in/service";
import { authErrorResponse, verifyAdminAccess } from "@/lib/security/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = verifyAdminAccess(request);
    if (!auth.authenticated) {
      return authErrorResponse(auth.error);
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const limitParam = searchParams.get("limit");
    const search = searchParams.get("search") || undefined;
    const limit = limitParam ? Number(limitParam) : undefined;

    console.log("[tradein/leads] Fetching leads with params:", {
      status,
      limit,
      search,
    });
    const leads = await listTradeInLeads({ status, limit, search });
    console.log("[tradein/leads] Found", leads?.length || 0, "leads");
    if (leads && leads.length > 0) {
      console.log("[tradein/leads] First lead:", {
        id: leads[0]?.id,
        model: leads[0]?.model,
        status: leads[0]?.status,
        contact_name: leads[0]?.contact_name,
        contact_email: leads[0]?.contact_email,
      });
      console.log(
        "[tradein/leads] Sample of leads with missing names:",
        leads
          .filter((l) => !l.contact_name)
          .slice(0, 3)
          .map((l) => ({
            id: l.id,
            model: l.model,
            contact_email: l.contact_email,
          })),
      );
    }
    return NextResponse.json(
      { leads },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
        },
      },
    );
  } catch (error) {
    console.error("[tradein/leads] Unexpected error", error);
    return NextResponse.json(
      { error: "Unable to load trade-in leads" },
      { status: 500 },
    );
  }
}
