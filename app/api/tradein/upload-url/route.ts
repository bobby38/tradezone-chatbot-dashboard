import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createTradeInUploadUrl } from "@/lib/trade-in/service";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "video/mp4",
  "video/quicktime",
]);

const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

function getExtensionFromMime(mime: string) {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    case "image/webp":
      return "webp";
    case "video/mp4":
      return "mp4";
    case "video/quicktime":
      return "mov";
    default:
      return "bin";
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      leadId,
      mimeType,
      sizeBytes,
    }: { leadId?: string; mimeType?: string; sizeBytes?: number } = body || {};

    if (!leadId) {
      return NextResponse.json(
        { error: "leadId is required" },
        { status: 400 },
      );
    }

    if (!mimeType || !ALLOWED_MIME.has(mimeType)) {
      return NextResponse.json(
        { error: "Unsupported file type" },
        { status: 400 },
      );
    }

    if (sizeBytes && sizeBytes > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File exceeds 15MB limit" },
        { status: 400 },
      );
    }

    try {
      const extension = getExtensionFromMime(mimeType);
      const { uploadUrl, path, bucket } = await createTradeInUploadUrl({
        leadId,
        mimeType,
        path: `tradein/${leadId}/${randomUUID()}.${extension}`,
      });

      return NextResponse.json({ uploadUrl, path, bucket });
    } catch (err) {
      console.error("[tradein/upload-url] Error", err);
      return NextResponse.json(
        { error: "Failed to create upload URL" },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("[tradein/upload-url] Unexpected error", error);
    return NextResponse.json(
      { error: "Unable to create upload URL" },
      { status: 500 },
    );
  }
}
