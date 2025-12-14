import { NextRequest, NextResponse } from "next/server";
import { ensureTradeInLead, type TradeInChannel } from "@/lib/trade-in/service";

const HANDLER_VERSION = "tradein-start-2025-12-14";

export async function POST(request: NextRequest) {
  try {
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const body = await request.json();
    const {
      clientId,
      sessionId,
      channel = "chat",
      initialMessage,
    }: {
      clientId?: string;
      sessionId?: string;
      channel?: TradeInChannel;
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

    console.log("[tradein/start]", {
      requestId,
      handlerVersion: HANDLER_VERSION,
      leadId,
      created,
      channel,
      clientId,
      sessionId,
      identity,
    });

    return NextResponse.json({
      success: true,
      requestId,
      handlerVersion: HANDLER_VERSION,
      leadId,
      existing: !created,
    });
  } catch (error) {
    console.error("[tradein/start] Unexpected error", error);
    return NextResponse.json(
      { error: "Unable to start trade-in lead" },
      { status: 500 },
    );
  }
}
