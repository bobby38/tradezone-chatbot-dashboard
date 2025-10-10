/**
 * Perplexity Web Search Tool
 * Searches tradezone.sg domain using Perplexity AI
 */

export const perplexitySearchTool = {
  type: 'function' as const,
  function: {
    name: 'searchtool',
    description: 'Search the TradeZone.sg website for current information, policies, or general content',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query for TradeZone.sg website'
        }
      },
      required: ['query']
    }
  }
}

/**
 * Handler function for Perplexity search
 * Uses Perplexity API with domain filter
 */
export async function handlePerplexitySearch(query: string): Promise<string> {
  try {
    const perplexityKey = process.env.PERPLEXITY_API_KEY

    if (!perplexityKey) {
      console.warn('Perplexity API key not configured, skipping web search')
      return 'Web search is currently unavailable. Please try using product search instead.'
    }

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        search_domain_filter: ['tradezone.sg'],
        messages: [
          {
            role: 'system',
            content: 'Search tradezone.sg only for relevant information. Provide concise, accurate answers.'
          },
          {
            role: 'user',
            content: query
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Perplexity search error:', error)
      throw new Error(`Perplexity search failed: ${error.error?.message || 'Unknown error'}`)
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content || 'No results found on TradeZone.sg'
  } catch (error) {
    console.error('Error in Perplexity search:', error)
    return 'I encountered an error searching the website. Please try again or use product search.'
  }
}
