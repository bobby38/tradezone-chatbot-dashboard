interface ChatLog {
  id: string
  user_id: string
  prompt: string
  response: string
  timestamp: string
  status: string
  processing_time?: number
}

interface SentimentAnalysis {
  sentiment: 'positive' | 'negative' | 'neutral'
  confidence: number
  emotions: string[]
}

interface ConversationInsight {
  topic: string
  intent: string
  satisfaction_level: number
  issues_identified: string[]
  suggestions: string[]
}

interface AnalyticsReport {
  overall_sentiment: SentimentAnalysis
  conversation_insights: ConversationInsight[]
  performance_feedback: {
    response_quality: number
    user_satisfaction: number
    common_issues: string[]
    improvement_suggestions: string[]
  }
  trending_topics: string[]
  user_behavior_patterns: string[]
  recommendations: {
    priority: 'high' | 'medium' | 'low'
    category: 'performance' | 'content' | 'user_experience' | 'technical'
    title: string
    description: string
    action_items: string[]
  }[]
}

class AIAnalyticsService {
  private apiKey: string
  private baseUrl: string
  private model: string

  constructor() {
    this.apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || ''
    
    // Get saved provider and model from localStorage
    const savedProvider = typeof window !== 'undefined' ? localStorage.getItem('ai-provider') : null
    const savedModel = typeof window !== 'undefined' ? localStorage.getItem('ai-model') : null
    
    const provider = savedProvider || (process.env.NEXT_PUBLIC_OPENAI_API_KEY ? 'openai' : 'openrouter')
    
    this.baseUrl = provider === 'openai' 
      ? 'https://api.openai.com/v1' 
      : 'https://openrouter.ai/api/v1'
    
    // Use saved model or default
    if (savedModel) {
      this.model = provider === 'openrouter' && !savedModel.includes('/') 
        ? `openai/${savedModel}` 
        : savedModel
    } else {
      this.model = provider === 'openai' 
        ? 'gpt-4o' 
        : 'openai/gpt-4-turbo-preview'
    }
  }

  async analyzeChatLogs(logs: ChatLog[]): Promise<AnalyticsReport> {
    if (!logs.length) {
      throw new Error('No chat logs provided for analysis')
    }

    const prompt = this.buildAnalysisPrompt(logs)
    
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...(this.baseUrl.includes('openrouter') && {
            'HTTP-Referer': 'https://tradezone-dashboard.com',
            'X-Title': 'Tradezone Chatbot Analytics'
          })
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `You are an expert AI analyst specializing in chatbot performance and user experience analysis. 
              Analyze the provided chat logs and return insights in the exact JSON format specified. 
              Focus on actionable insights for improving the trading chatbot experience.`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 2000
        })
      })

      if (!response.ok) {
        throw new Error(`AI API request failed: ${response.statusText}`)
      }

      const data = await response.json()
      const analysisText = data.choices[0]?.message?.content

      if (!analysisText) {
        throw new Error('No analysis content received from AI')
      }

      return this.parseAnalysisResponse(analysisText)
    } catch (error) {
      console.error('AI analysis failed:', error)
      throw error
    }
  }

  private buildAnalysisPrompt(logs: ChatLog[]): string {
    const recentLogs = logs.slice(0, 50) // Analyze last 50 conversations
    
    const conversationSummary = recentLogs.map(log => ({
      user_query: log.prompt,
      bot_response: log.response,
      status: log.status,
      response_time: log.processing_time || 0,
      timestamp: log.timestamp
    }))

    return `
Analyze these trading chatbot conversations and provide comprehensive insights:

CONVERSATION DATA:
${JSON.stringify(conversationSummary, null, 2)}

Please analyze and return a JSON response with the following structure:

{
  "overall_sentiment": {
    "sentiment": "positive|negative|neutral",
    "confidence": 0.0-1.0,
    "emotions": ["array of detected emotions"]
  },
  "conversation_insights": [
    {
      "topic": "main topic discussed",
      "intent": "user intent category",
      "satisfaction_level": 1-10,
      "issues_identified": ["array of issues"],
      "suggestions": ["array of improvement suggestions"]
    }
  ],
  "performance_feedback": {
    "response_quality": 1-10,
    "user_satisfaction": 1-10,
    "common_issues": ["array of common problems"],
    "improvement_suggestions": ["array of specific improvements"]
  },
  "trending_topics": ["array of popular topics"],
  "user_behavior_patterns": ["array of observed patterns"],
  "recommendations": [
    {
      "priority": "high|medium|low",
      "category": "performance|content|user_experience|technical",
      "title": "recommendation title",
      "description": "detailed description",
      "action_items": ["array of specific actions"]
    }
  ]
}

Focus on:
1. Trading-specific insights and user intent
2. Response quality and accuracy
3. User satisfaction indicators
4. Technical performance issues
5. Content gaps and opportunities
6. Actionable recommendations for improvement

Return only valid JSON without any additional text or formatting.
`
  }

  private parseAnalysisResponse(response: string): AnalyticsReport {
    try {
      // Clean the response to extract JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No valid JSON found in AI response')
      }

      const parsed = JSON.parse(jsonMatch[0])
      
      // Validate the structure
      if (!parsed.overall_sentiment || !parsed.performance_feedback || !parsed.recommendations) {
        throw new Error('Invalid analysis response structure')
      }

      return parsed as AnalyticsReport
    } catch (error) {
      console.error('Failed to parse AI analysis response:', error)
      // Return a fallback response
      return this.getFallbackAnalysis()
    }
  }

  private getFallbackAnalysis(): AnalyticsReport {
    return {
      overall_sentiment: {
        sentiment: 'neutral',
        confidence: 0.5,
        emotions: ['curious', 'engaged']
      },
      conversation_insights: [{
        topic: 'Trading Inquiries',
        intent: 'information_seeking',
        satisfaction_level: 7,
        issues_identified: ['Analysis temporarily unavailable'],
        suggestions: ['Enable AI analytics for detailed insights']
      }],
      performance_feedback: {
        response_quality: 7,
        user_satisfaction: 7,
        common_issues: ['AI analysis service unavailable'],
        improvement_suggestions: ['Configure AI analytics API key']
      },
      trending_topics: ['Trading', 'Market Analysis'],
      user_behavior_patterns: ['Information seeking behavior'],
      recommendations: [{
        priority: 'high' as const,
        category: 'technical' as const,
        title: 'Configure AI Analytics',
        description: 'Set up OpenAI or OpenRouter API key to enable intelligent analytics',
        action_items: ['Add API key to environment variables', 'Test AI analytics connection']
      }]
    }
  }

  async getSentimentAnalysis(text: string): Promise<SentimentAnalysis> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...(this.baseUrl.includes('openrouter') && {
            'HTTP-Referer': 'https://tradezone-dashboard.com',
            'X-Title': 'Tradezone Sentiment Analysis'
          })
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'Analyze the sentiment of the given text and return a JSON response with sentiment (positive/negative/neutral), confidence (0-1), and emotions array.'
            },
            {
              role: 'user',
              content: `Analyze sentiment: "${text}"`
            }
          ],
          temperature: 0.1,
          max_tokens: 200
        })
      })

      const data = await response.json()
      const result = JSON.parse(data.choices[0]?.message?.content || '{}')
      
      return {
        sentiment: result.sentiment || 'neutral',
        confidence: result.confidence || 0.5,
        emotions: result.emotions || []
      }
    } catch (error) {
      console.error('Sentiment analysis failed:', error)
      return {
        sentiment: 'neutral',
        confidence: 0.5,
        emotions: []
      }
    }
  }
}

export { AIAnalyticsService, type AnalyticsReport, type SentimentAnalysis, type ConversationInsight }
