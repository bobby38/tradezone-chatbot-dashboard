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

    const leads = await listTradeInLeads({ status, limit, search });
    return NextResponse.json({ leads });
  } catch (error) {
    console.error("[tradein/leads] Unexpected error", error);
    return NextResponse.json(
      { error: "Unable to load trade-in leads" },
      { status: 500 },
    );
  }
}
