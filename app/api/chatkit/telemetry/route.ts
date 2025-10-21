import { NextRequest, NextResponse } from "next/server";
import { getAgentTelemetry } from "@/lib/chatkit/telemetry";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 100) : 20;

  const entries = getAgentTelemetry(limit);
  return NextResponse.json({ entries });
}

