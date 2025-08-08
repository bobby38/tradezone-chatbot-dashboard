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
import DataChatbot from './data-chatbot'

interface AIAnalyticsProps {
  chatLogs: any[]
  persistentReport?: any
  onReportGenerated?: (report: any, timestamp: Date) => void
  onAnalysisComplete?: (report: AnalyticsReport) => void
}

export default function AIAnalytics({ chatLogs, persistentReport, onReportGenerated, onAnalysisComplete }: AIAnalyticsProps) {
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
      if (!apiKey || apiKey === 'your_openai_key_here' || apiKey === 'your_openrouter_key_here') {
        throw new Error('AI API key not configured. Please add NEXT_PUBLIC_OPENAI_API_KEY or NEXT_PUBLIC_OPENROUTER_API_KEY to your environment variables.')
      }

      const aiService = new AIAnalyticsService()
      
      const analysisReport = await aiService.analyzeChatLogs(chatLogs)
      setReport(analysisReport)
      const timestamp = new Date()
      onReportGenerated?.(analysisReport, timestamp)
      onAnalysisComplete?.(analysisReport)
    } catch (err) {
      console.error('AI analysis failed:', err)
      setError(err instanceof Error ? err.message : 'Analysis failed')
      
      // Show fallback analysis
      const aiService = new AIAnalyticsService()
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
      <Card className="border-red-600" style={{ backgroundColor: '#333' }}>
        <CardHeader>
          <CardTitle className="text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Analysis Failed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-300 mb-4">{error}</p>
          <Button onClick={analyzeData} className="bg-red-600 hover:bg-red-700">
            Retry Analysis
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!report) {
    return (
      <Card className="border-gray-600" style={{ backgroundColor: '#333' }}>
        <CardHeader>
          <CardTitle className="text-gray-200">No Analytics Report Available</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-300 mb-4">Click the button below to generate an AI analytics report.</p>
          <Button onClick={analyzeData} className="bg-blue-600 hover:bg-blue-700">
            Generate Report
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-8 min-h-screen p-6 rounded-xl" style={{ backgroundColor: '#333' }}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            AI Analytics Report
          </h2>
          <p className="text-gray-200 text-lg font-medium">Intelligent insights from your chat data</p>
        </div>
        <Button onClick={analyzeData} variant="outline" size="sm" className="bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Analysis
        </Button>
      </div>

      {/* Overall Sentiment */}
      <Card className="border-gray-600" style={{ backgroundColor: '#333' }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-gray-200 text-xl">
            <MessageSquare className="h-6 w-6 text-blue-400" />
            Overall Sentiment Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Badge className={getSentimentColor(report.overall_sentiment.sentiment)}>
                {report.overall_sentiment.sentiment.toUpperCase()}
              </Badge>
              <p className="text-base text-gray-300 mt-3 font-medium">
                Confidence: {Math.round(report.overall_sentiment.confidence * 100)}%
              </p>
            </div>
            <div className="text-right">
              <p className="text-base font-semibold text-gray-200 mb-2">Detected Emotions:</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {report.overall_sentiment.emotions.map((emotion, index) => (
                  <Badge key={index} variant="secondary" className="text-sm bg-gray-600 text-gray-200">
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
        <Card className="border-gray-600" style={{ backgroundColor: '#333' }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-200 text-xl">
              <BarChart3 className="h-6 w-6 text-green-400" />
              Performance Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex justify-between text-base">
                <span className="text-gray-200 font-medium">Response Quality</span>
                <span className="text-white font-bold text-lg">{report.performance_feedback.response_quality}/10</span>
              </div>
              <Progress value={report.performance_feedback.response_quality * 10} className="mt-2 h-3" />
            </div>
            <div>
              <div className="flex justify-between text-base">
                <span className="text-gray-200 font-medium">User Satisfaction</span>
                <span className="text-white font-bold text-lg">{report.performance_feedback.user_satisfaction}/10</span>
              </div>
              <Progress value={report.performance_feedback.user_satisfaction * 10} className="mt-2 h-3" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-600" style={{ backgroundColor: '#333' }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-200 text-xl">
              <TrendingUp className="h-6 w-6 text-blue-400" />
              Trending Topics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report.trending_topics.map((topic, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
                  <span className="text-base text-gray-200 font-medium">{topic}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recommendations */}
      <Card className="border-gray-600" style={{ backgroundColor: '#333' }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-gray-200 text-xl">
            <Lightbulb className="h-6 w-6 text-yellow-400" />
            AI Recommendations
          </CardTitle>
          <CardDescription className="text-gray-300 text-base">
            Actionable insights to improve your chatbot performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {report.recommendations.map((rec, index) => (
              <div key={index} className="border border-gray-600 rounded-lg p-5 bg-gray-700/50">
                <div className="flex items-start justify-between mb-3">
                  <h4 className="font-semibold text-white text-lg">{rec.title}</h4>
                  <Badge className={getPriorityColor(rec.priority)}>
                    {rec.priority}
                  </Badge>
                </div>
                <p className="text-base text-gray-300 mb-4 leading-relaxed">{rec.description}</p>
                <div>
                  <p className="text-sm font-semibold text-gray-200 mb-2">Action Items:</p>
                  <ul className="text-sm text-gray-300 space-y-2">
                    {rec.action_items.map((item, itemIndex) => (
                      <li key={itemIndex} className="flex items-start gap-3">
                        <CheckCircle className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                        <span className="leading-relaxed">{item}</span>
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
