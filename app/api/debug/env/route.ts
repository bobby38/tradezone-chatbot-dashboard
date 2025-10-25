import { NextResponse } from "next/server";

export async function GET() {
  // Only allow in development
  const isDev = process.env.NODE_ENV === "development";

  if (!isDev) {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  return NextResponse.json({
    hasTradeInVectorStore: !!process.env.OPENAI_VECTOR_STORE_ID_TRADEIN,
    tradeInVectorStoreId: process.env.OPENAI_VECTOR_STORE_ID_TRADEIN ?
      process.env.OPENAI_VECTOR_STORE_ID_TRADEIN.substring(0, 15) + "..." :
      "NOT SET",
    hasCatalogVectorStore: !!(process.env.OPENAI_VECTOR_STORE_ID_CATALOG || process.env.OPENAI_VECTOR_STORE_ID),
    catalogVectorStoreId: (process.env.OPENAI_VECTOR_STORE_ID_CATALOG || process.env.OPENAI_VECTOR_STORE_ID || "NOT SET").substring(0, 15) + "...",
    nodeEnv: process.env.NODE_ENV,
  });
}
