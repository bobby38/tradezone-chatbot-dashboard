'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { MessageSquare, Send, Bot, User, Sparkles, Loader2 } from 'lucide-react'
import { AIAnalyticsService, type AnalyticsReport } from '@/lib/ai-analytics'

interface ChatMessage {
  id: string
  type: 'user' | 'bot'
  content: string
  timestamp: Date
}

interface DataChatbotProps {
  analyticsReport?: AnalyticsReport
  chatLogs: any[]
}

export default function DataChatbot({ analyticsReport, chatLogs }: DataChatbotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      type: 'bot',
      content: "Hi! I'm your AI data analyst. Ask me anything about your chatbot performance, user sentiment, or analytics data. For example: 'What are the main issues users are facing?' or 'How can I improve response quality?'",
      timestamp: new Date()
    }
  ])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const suggestedQuestions = [
    "What are the main issues users are facing?",
    "How can I improve my chatbot's performance?",
    "What topics are users most interested in?",
    "What's the overall user sentiment?",
    "Give me 3 actionable recommendations"
  ]

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsLoading(true)

    try {
      const response = await generateAIResponse(inputValue)
      const botMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: response,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, botMessage])
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: "I'm sorry, I encountered an error while analyzing your question. Please try again or rephrase your question.",
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const generateAIResponse = async (question: string): Promise<string> => {
    const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY
    if (!apiKey || apiKey === 'your_openai_key_here' || apiKey === 'your_openrouter_key_here') {
      return "I need an API key to analyze your data. Please configure your OpenAI or OpenRouter API key in the environment variables."
    }

    const aiService = new AIAnalyticsService()

    // Create context from analytics report and chat logs
    const context = {
      totalChats: chatLogs.length,
      uniqueUsers: new Set(chatLogs.map(log => log.user_id)).size,
      successRate: chatLogs.length > 0 ? (chatLogs.filter(log => log.status === 'success').length / chatLogs.length * 100) : 0,
      errorRate: chatLogs.length > 0 ? (chatLogs.filter(log => log.status === 'error').length / chatLogs.length * 100) : 0,
      recentConversations: chatLogs.slice(0, 10).map(log => ({
        prompt: log.prompt,
        response: log.response,
        status: log.status
      })),
      analyticsReport: analyticsReport
    }

    const isOpenAI = Boolean(process.env.NEXT_PUBLIC_OPENAI_API_KEY)
    const baseUrl = isOpenAI ? 'https://api.openai.com/v1' : 'https://openrouter.ai/api/v1'
    const model = isOpenAI ? 'gpt-4-turbo-preview' : 'openai/gpt-4-turbo-preview'

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(baseUrl.includes('openrouter') && {
          'HTTP-Referer': 'https://tradezone-dashboard.com',
          'X-Title': 'Tradezone Data Chatbot'
        })
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: `You are an expert AI data analyst for a trading chatbot. You have access to comprehensive analytics data and should provide helpful, actionable insights. Keep responses conversational but informative. Focus on practical recommendations.

Context Data:
${JSON.stringify(context, null, 2)}

Answer questions about:
- User sentiment and satisfaction
- Performance metrics and improvements
- Common issues and solutions
- Trending topics and user behavior
- Specific recommendations for optimization

Keep responses concise (2-3 paragraphs max) and actionable.`
          },
          {
            role: 'user',
            content: question
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    })

    if (!response.ok) {
      throw new Error('Failed to get AI response')
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || "I couldn't generate a response. Please try again."
  }

  const handleSuggestedQuestion = (question: string) => {
    setInputValue(question)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <Card className="border-gray-700" style={{ backgroundColor: '#1a1a1a' }}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-gray-200">
          <Bot className="h-5 w-5 text-blue-400" />
          Ask About Your Data
        </CardTitle>
        <CardDescription className="text-gray-300">
          Ask questions about your chatbot analytics and get AI-powered insights
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Suggested Questions */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-300">Try asking:</p>
          <div className="flex flex-wrap gap-2">
            {suggestedQuestions.map((question, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => handleSuggestedQuestion(question)}
                className="text-xs bg-gray-700 hover:bg-gray-600 border-gray-600 text-gray-200"
              >
                {question}
              </Button>
            ))}
          </div>
        </div>

        {/* Chat Messages */}
        <div className="space-y-3 max-h-96 overflow-y-auto bg-gray-800 rounded-lg p-4 border border-gray-600">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex gap-2 max-w-[80%] ${message.type === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  message.type === 'user' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-purple-500 text-white'
                }`}>
                  {message.type === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div className={`rounded-lg p-3 ${
                  message.type === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-700 text-gray-200'
                }`}>
                  <p className="text-sm leading-relaxed">{message.content}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {message.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="flex gap-2">
                <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="bg-gray-700 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                    <p className="text-sm text-gray-200">Analyzing your data...</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about your data... (e.g., 'What are users asking about most?')"
            className="flex-1 bg-white border-purple-200 focus:border-purple-400"
            disabled={isLoading}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="bg-purple-500 hover:bg-purple-600 text-white"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
