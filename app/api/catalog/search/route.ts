import { NextRequest, NextResponse } from "next/server";
import { findCatalogMatches } from "@/lib/chatkit/productCatalog";

export const dynamic = "force-dynamic";

const STOP_WORDS = new Set([
  "any",
  "game",
  "games",
  "show",
  "find",
  "give",
  "please",
  "me",
  "a",
  "an",
  "the",
]);

function normalizeQuery(input: string) {
  return input
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !STOP_WORDS.has(token) && token.length >= 2)
    .join(" ");
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawQuery = searchParams.get("q")?.trim();

    if (!rawQuery) {
      return NextResponse.json(
        { results: [], reason: "empty_query" },
        { status: 200 },
      );
    }

    const normalized = normalizeQuery(rawQuery);
    if (!normalized) {
      return NextResponse.json(
        { results: [], reason: "query_filtered" },
        { status: 200 },
      );
    }

    const matches = await findCatalogMatches(normalized, 10);
    return NextResponse.json({
      results: matches,
      reason: matches.length ? "catalog_hit" : "catalog_empty",
    });
  } catch (error) {
    console.error("[CatalogSearch] error", error);
    return NextResponse.json(
      { results: [], reason: "error", error: (error as Error).message },
      { status: 200 },
    );
  }
}
