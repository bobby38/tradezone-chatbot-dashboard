import { NextRequest, NextResponse } from 'next/server';
import { handlePerplexitySearch } from '@/lib/tools';

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();
    
    if (!query) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    const result = await handlePerplexitySearch({ query });

    return NextResponse.json({ result });
    
  } catch (error) {
    console.error('[Perplexity API Error]:', error);
    return NextResponse.json(
      { error: 'Failed to search' },
      { status: 500 }
    );
  }
}
