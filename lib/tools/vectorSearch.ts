import { findCatalogMatches } from "@/lib/chatkit/productCatalog";

/**
 * Vector Search Tool for TradeZone Products
 * Uses OpenAI's Docling hybrid chunk vector store
 */

export const vectorSearchTool = {
  type: 'function' as const,
  function: {
    name: 'searchProducts',
    description: 'Search TradeZone products and information using the Docling vector store with hybrid chunking',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The product search query or question about TradeZone products/services'
        }
      },
      required: ['query']
    }
  }
}

/**
 * Handler function for vector search
 * Calls OpenAI Responses API with file_search tool
 */
export async function handleVectorSearch(query: string): Promise<string> {
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4.1',
        input: query,
        tools: [{
          type: 'file_search',
          vector_store_ids: [process.env.OPENAI_VECTOR_STORE_ID || 'vs_68e89cf979e88191bb8b4882caadbc0d']
        }]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Vector search error:', error)
      throw new Error(`Vector search failed: ${error.error?.message || 'Unknown error'}`)
    }

    const data = await response.json()

    const result =
      data.output
        ?.flatMap((item: any) =>
          item.content
            ?.filter((block: any) => block.type === 'output_text')
            ?.map((block: any) => block.text?.trim()),
        )
        ?.flat()
        ?.filter(Boolean)
        ?.join('\n\n') || ''

    let enriched = result

    const catalogMatches = await findCatalogMatches(query, 3)

    if (catalogMatches.length > 0) {
      const lines = catalogMatches.map((match) => {
        const details: string[] = []
        details.push(
          `- **${match.name}**${match.price ? ` — S$${match.price}` : ''}`,
        )
        if (match.stockStatus) {
          const humanStock =
            match.stockStatus === 'instock'
              ? 'In stock'
              : match.stockStatus === 'outofstock'
                ? 'Out of stock'
                : match.stockStatus
          details.push(`  - Availability: ${humanStock}`)
        }
        if (match.permalink) {
          details.push(`  - [View Product](${match.permalink})`)
        }
        if (match.image) {
          details.push(`  - ![Product Image](${match.image})`)
        }
        return details.join('\n')
      })

      const section = ['**Online Store Matches**', ...lines].join('\n')
      enriched = enriched ? `${enriched}\n\n${section}` : section
    }

    if (enriched.trim().length === 0) {
      return 'No product information found. Please try rephrasing your query.'
    }

    return enriched
  } catch (error) {
    console.error('Error in vector search:', error)
    return 'I encountered an error searching our product database. Please try again or contact support.'
  }
}
