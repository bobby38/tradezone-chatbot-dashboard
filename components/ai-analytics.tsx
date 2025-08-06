'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  Brain, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  Lightbulb, 
  BarChart3,
  MessageSquare,
  Users,
  Zap,
  RefreshCw,
  Sparkles
} from 'lucide-react'
import { AIAnalyticsService, type AnalyticsReport } from '@/lib/ai-analytics'

interface AIAnalyticsProps {
  chatLogs: any[]
  onAnalysisComplete?: (report: AnalyticsReport) => void
}

export default function AIAnalytics({ chatLogs, onAnalysisComplete }: AIAnalyticsProps) {
  const [report, setReport] = useState<AnalyticsReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const analyzeData = async () => {
    if (!chatLogs.length) {
      setError('No chat logs available for analysis')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Check if API key is configured
      const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY
      if (!apiKey) {
        throw new Error('AI API key not configured. Please add NEXT_PUBLIC_OPENAI_API_KEY or NEXT_PUBLIC_OPENROUTER_API_KEY to your environment variables.')
      }

      const provider = process.env.NEXT_PUBLIC_OPENAI_API_KEY ? 'openai' : 'openrouter'
      const aiService = new AIAnalyticsService(apiKey, provider)
      
      const analysisReport = await aiService.analyzeChatLogs(chatLogs)
      setReport(analysisReport)
      onAnalysisComplete?.(analysisReport)
    } catch (err) {
      console.error('AI analysis failed:', err)
      setError(err instanceof Error ? err.message : 'Analysis failed')
      
      // Show fallback analysis
      const aiService = new AIAnalyticsService('fallback')
      const fallbackReport = (aiService as any).getFallbackAnalysis()
      setReport(fallbackReport)
    } finally {
      setLoading(false)
    }
  }

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'text-green-600 bg-green-100'
      case 'negative': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-100'
      case 'medium': return 'text-yellow-600 bg-yellow-100'
      default: return 'text-blue-600 bg-blue-100'
    }
  }

  if (!report && !loading) {
    return (
      <Card className="border-dashed border-2">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mb-4">
            <Brain className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="flex items-center justify-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            AI-Powered Analytics
          </CardTitle>
          <CardDescription>
            Get intelligent insights, sentiment analysis, and actionable recommendations from your chat data
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button 
            onClick={analyzeData} 
            disabled={loading || !chatLogs.length}
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Brain className="h-4 w-4 mr-2" />
                Analyze Chat Data
              </>
            )}
          </Button>
          {!chatLogs.length && (
            <p className="text-sm text-gray-500 mt-2">
              No chat logs available. Start conversations to enable AI analysis.
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 animate-spin" />
            Analyzing Your Data...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
            <Progress value={33} className="w-full" />
            <p className="text-sm text-gray-500">
              AI is analyzing your chat logs to provide insights and recommendations...
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Analysis Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={analyzeData} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry Analysis
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            AI Analytics Report
          </h2>
          <p className="text-gray-600">Intelligent insights from your chat data</p>
        </div>
        <Button onClick={analyzeData} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Analysis
        </Button>
      </div>

      {/* Overall Sentiment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Overall Sentiment Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Badge className={getSentimentColor(report.overall_sentiment.sentiment)}>
                {report.overall_sentiment.sentiment.toUpperCase()}
              </Badge>
              <p className="text-sm text-gray-600 mt-2">
                Confidence: {Math.round(report.overall_sentiment.confidence * 100)}%
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">Detected Emotions:</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {report.overall_sentiment.emotions.map((emotion, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {emotion}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Performance Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm">
                <span>Response Quality</span>
                <span>{report.performance_feedback.response_quality}/10</span>
              </div>
              <Progress value={report.performance_feedback.response_quality * 10} className="mt-1" />
            </div>
            <div>
              <div className="flex justify-between text-sm">
                <span>User Satisfaction</span>
                <span>{report.performance_feedback.user_satisfaction}/10</span>
              </div>
              <Progress value={report.performance_feedback.user_satisfaction * 10} className="mt-1" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Trending Topics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {report.trending_topics.map((topic, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-sm">{topic}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            AI Recommendations
          </CardTitle>
          <CardDescription>
            Actionable insights to improve your chatbot performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {report.recommendations.map((rec, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-medium">{rec.title}</h4>
                  <Badge className={getPriorityColor(rec.priority)}>
                    {rec.priority}
                  </Badge>
                </div>
                <p className="text-sm text-gray-600 mb-3">{rec.description}</p>
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-1">Action Items:</p>
                  <ul className="text-xs text-gray-600 space-y-1">
                    {rec.action_items.map((item, itemIndex) => (
                      <li key={itemIndex} className="flex items-center gap-2">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Common Issues */}
      {report.performance_feedback.common_issues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Common Issues Identified
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {report.performance_feedback.common_issues.map((issue, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  {issue}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
