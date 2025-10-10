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
    return data.output || 'No product information found. Please try rephrasing your query.'
  } catch (error) {
    console.error('Error in vector search:', error)
    return 'I encountered an error searching our product database. Please try again or contact support.'
  }
}
