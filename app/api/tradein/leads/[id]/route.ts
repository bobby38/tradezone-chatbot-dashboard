import { NextRequest, NextResponse } from "next/server";
import {
  TradeInValidationError,
  getTradeInLeadDetail,
  updateTradeInLead,
} from "@/lib/trade-in/service";
import { authErrorResponse, verifyAdminAccess } from "@/lib/security/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = verifyAdminAccess(request);
    if (!auth.authenticated) {
      return authErrorResponse(auth.error);
    }

    const lead = await getTradeInLeadDetail(params.id);
    return NextResponse.json({ lead });
  } catch (error) {
    console.error("[tradein/leads/:id] GET error", error);
    return NextResponse.json(
      { error: "Unable to load trade-in lead" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = verifyAdminAccess(request);
    if (!auth.authenticated) {
      return authErrorResponse(auth.error);
    }

    const body = await request.json();
    const patch = body?.patch ?? body;

    try {
      const { lead } = await updateTradeInLead(params.id, patch);
      return NextResponse.json({ lead });
    } catch (err) {
      if (err instanceof TradeInValidationError) {
        return NextResponse.json(
          { error: err.message, fields: err.fields },
          { status: 400 },
        );
      }
      throw err;
    }
  } catch (error) {
    console.error("[tradein/leads/:id] PATCH error", error);
    return NextResponse.json(
      { error: "Unable to update trade-in lead" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = verifyAdminAccess(request);
    if (!auth.authenticated) {
      return authErrorResponse(auth.error);
    }

    const { deleteTradeInLead } = await import("@/lib/trade-in/service");
    await deleteTradeInLead(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[tradein/leads/:id] DELETE error", error);
    return NextResponse.json(
      { error: "Unable to delete trade-in lead" },
      { status: 500 },
    );
  }
}
