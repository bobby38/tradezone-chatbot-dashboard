import { NextRequest, NextResponse } from "next/server";
import { listTradeInLeads } from "@/lib/trade-in/service";

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const limitParam = searchParams.get("limit");
    const search = searchParams.get("search") || undefined;
    const limit = limitParam ? Number(limitParam) : undefined;

    console.log("[tradein/leads] Fetching leads with params:", { status, limit, search });
    const leads = await listTradeInLeads({ status, limit, search });
    console.log("[tradein/leads] Found", leads?.length || 0, "leads");
    if (leads && leads.length > 0) {
      console.log("[tradein/leads] First lead:", leads[0]?.id, leads[0]?.model, leads[0]?.status);
    }
    return NextResponse.json({ leads });
  } catch (error) {
    console.error("[tradein/leads] Unexpected error", error);
    return NextResponse.json(
      { error: "Unable to load trade-in leads" },
      { status: 500 },
    );
  }
}
