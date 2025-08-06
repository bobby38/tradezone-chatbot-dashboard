'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AIAnalytics from '@/components/ai-analytics'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Brain, ArrowLeft, Settings } from 'lucide-react'
import Link from 'next/link'

interface ChatLog {
  id: string
  user_id: string
  prompt: string
  response: string
  timestamp: string
  status: string
  processing_time?: number
  created_at: string
}

export default function AnalyticsPage() {
  const [chatLogs, setChatLogs] = useState<ChatLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchChatLogs()
  }, [])

  const fetchChatLogs = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('chat_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100) // Get last 100 conversations for analysis

      if (error) {
        throw error
      }

      setChatLogs(data || [])
    } catch (err) {
      console.error('Error fetching chat logs:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch chat logs')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              AI Analytics
            </h1>
            <p className="text-gray-600">Loading chat data for analysis...</p>
          </div>
        </div>
        
        <Card>
          <CardContent className="p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              AI Analytics
            </h1>
            <p className="text-gray-600">Error loading data</p>
          </div>
        </div>
        
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-600">Error Loading Data</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={fetchChatLogs} variant="outline">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent flex items-center gap-2">
              <Brain className="h-8 w-8" />
              AI Analytics
            </h1>
            <p className="text-gray-600">
              Intelligent insights from {chatLogs.length} conversations
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Configure API
          </Button>
        </div>
      </div>

      {/* Configuration Notice */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="text-blue-800 flex items-center gap-2">
            <Settings className="h-5 w-5" />
            AI Analytics Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-blue-700 space-y-2">
            <p>To enable AI-powered analytics, add your API key to the environment variables:</p>
            <div className="bg-blue-100 p-3 rounded-lg font-mono text-sm">
              <div>NEXT_PUBLIC_OPENAI_API_KEY=your_openai_key</div>
              <div className="text-gray-600"># OR</div>
              <div>NEXT_PUBLIC_OPENROUTER_API_KEY=your_openrouter_key</div>
            </div>
            <p className="text-sm">
              This will enable sentiment analysis, conversation insights, and AI-powered recommendations.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* AI Analytics Component */}
      <AIAnalytics 
        chatLogs={chatLogs}
        onAnalysisComplete={(report) => {
          console.log('Analysis completed:', report)
        }}
      />

      {/* Data Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Data Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Total Conversations:</span>
                <span className="font-medium">{chatLogs.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Unique Users:</span>
                <span className="font-medium">
                  {new Set(chatLogs.map(log => log.user_id)).size}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Success Rate:</span>
                <span className="font-medium">
                  {chatLogs.length > 0 
                    ? Math.round((chatLogs.filter(log => log.status === 'success').length / chatLogs.length) * 100)
                    : 0}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {chatLogs.slice(0, 3).map((log, index) => (
                <div key={log.id} className="text-sm">
                  <div className="font-medium truncate">
                    {log.prompt.length > 30 ? `${log.prompt.substring(0, 30)}...` : log.prompt}
                  </div>
                  <div className="text-gray-500 text-xs">
                    {new Date(log.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Avg Response Time:</span>
                <span className="font-medium">
                  {chatLogs.filter(log => log.processing_time).length > 0
                    ? `${(chatLogs.reduce((sum, log) => sum + (log.processing_time || 0), 0) / chatLogs.filter(log => log.processing_time).length).toFixed(2)}s`
                    : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Error Rate:</span>
                <span className="font-medium">
                  {chatLogs.length > 0 
                    ? Math.round((chatLogs.filter(log => log.status === 'error').length / chatLogs.length) * 100)
                    : 0}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
