import { NextRequest, NextResponse } from "next/server";
import { ensureTradeInLead } from "@/lib/trade-in/service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      clientId,
      sessionId,
      channel = "chat",
      initialMessage,
    }: {
      clientId?: string;
      sessionId?: string;
      channel?: string;
      initialMessage?: string;
    } = body || {};

    const identity = clientId || sessionId;

    if (!identity) {
      return NextResponse.json(
        { error: "clientId or sessionId is required" },
        { status: 400 },
      );
    }

    const { leadId, created } = await ensureTradeInLead({
      sessionId: sessionId || clientId || identity,
      leadHash: identity,
      channel,
      initialMessage,
      source: "api.tradein.start",
    });

    return NextResponse.json({ leadId, existing: !created });
  } catch (error) {
    console.error("[tradein/start] Unexpected error", error);
    return NextResponse.json(
      { error: "Unable to start trade-in lead" },
      { status: 500 },
    );
  }
}
