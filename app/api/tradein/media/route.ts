import { NextRequest, NextResponse } from "next/server";
import { recordTradeInMediaEntry } from "@/lib/trade-in/service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      leadId,
      path,
      mediaType,
      mimeType,
      sizeBytes,
      width,
      height,
      thumbnailUrl,
    } = body || {};

    if (!leadId || !path || !mediaType) {
      return NextResponse.json(
        { error: "leadId, path and mediaType are required" },
        { status: 400 },
      );
    }

    if (!["image", "video", "document"].includes(mediaType)) {
      return NextResponse.json(
        { error: "Invalid mediaType" },
        { status: 400 },
      );
    }

    await recordTradeInMediaEntry({
      leadId,
      mediaType,
      url: path,
      thumbnailUrl,
      mimeType,
      sizeBytes,
      width,
      height,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[tradein/media] Unexpected error", error);
    return NextResponse.json(
      { error: "Unable to record media" },
      { status: 500 },
    );
  }
}
