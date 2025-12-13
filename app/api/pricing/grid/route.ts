/**
 * GET /api/pricing/grid
 * Returns the current trade-in price grid for voice/text agents
 * Public endpoint - used by voice agent to get latest prices
 */

import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'data/trade_in_prices_2025.json');
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const priceGrid = JSON.parse(fileContents);

    return NextResponse.json(priceGrid, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600', // Cache 5min
      },
    });
  } catch (error) {
    console.error('[PriceGrid API] Error loading price grid:', error);
    return NextResponse.json(
      { error: 'Failed to load price grid' },
      { status: 500 }
    );
  }
}
