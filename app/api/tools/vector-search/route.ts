import { NextRequest, NextResponse } from "next/server";
import { handleVectorSearch } from "@/lib/tools";

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query) {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    console.log("[Vector Search API] Query:", query);

    const result = await handleVectorSearch(query);

    console.log("[Vector Search API] Result length:", result.length);

    return NextResponse.json({ result });
  } catch (error) {
    console.error("[Vector Search API] Error:", error);
    return NextResponse.json(
      { 
        error: "Vector search failed",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: "healthy",
    service: "Vector Search API",
    timestamp: new Date().toISOString(),
  });
}
