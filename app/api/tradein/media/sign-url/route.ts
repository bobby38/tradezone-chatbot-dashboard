import { NextRequest, NextResponse } from "next/server";
import { createSignedMediaUrl } from "@/lib/trade-in/service";

export const dynamic = "force-dynamic";

function normalizeStoragePath(rawPath: string) {
  if (!rawPath) return rawPath;

  try {
    if (rawPath.startsWith("http")) {
      const url = new URL(rawPath);
      const parts = url.pathname.split("/");
      const fileIndex = parts.findIndex((segment) => segment === "files");
      if (fileIndex !== -1 && parts[fileIndex + 1]) {
        return decodeURIComponent(parts[fileIndex + 1]);
      }
    }
  } catch (error) {
    console.warn("[tradein/media/sign-url] Failed to normalize path", error);
  }

  return rawPath.replace(/.*\/files\//, "").replace(/\/view.*$/, "");
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawPath = searchParams.get("path");
    const path = rawPath ? normalizeStoragePath(rawPath) : null;

    if (!path) {
      return NextResponse.json(
        { error: "path query parameter is required" },
        { status: 400 },
      );
    }

    const signedUrl = await createSignedMediaUrl({ path });
    return NextResponse.json({ url: signedUrl });
  } catch (error) {
    console.error("[tradein/media/sign-url] Unexpected error", error);
    return NextResponse.json(
      { error: "Unable to create signed URL" },
      { status: 500 },
    );
  }
}
