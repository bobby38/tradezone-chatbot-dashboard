'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AIAnalytics from '@/components/ai-analytics'
import DataChatbot from '@/components/data-chatbot'
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
    <div className="min-h-screen" style={{ backgroundColor: '#1F1F1F' }}>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white hover:bg-gray-700">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent flex items-center gap-2">
                <Brain className="h-8 w-8 text-purple-400" />
                AI Analytics
              </h1>
              <p className="text-gray-300 text-lg">
                Intelligent insights from {chatLogs.length} conversations
              </p>
            </div>
          </div>
        
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600">
              <Settings className="h-4 w-4 mr-2" />
              Configure API
            </Button>
          </div>
      </div>

        {/* AI Status Notice */}
        <Card className="border-green-600 bg-gradient-to-r from-green-900/20 to-emerald-900/20" style={{ backgroundColor: '#333' }}>
          <CardHeader>
            <CardTitle className="text-green-400 flex items-center gap-2 text-lg">
              <Brain className="h-5 w-5" />
              AI Analytics Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-green-300">
              <p className="text-base font-medium">
                🎉 AI-powered analytics are now enabled! Get intelligent insights, sentiment analysis, and personalized recommendations from your chat data.
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
          <Card className="border-gray-600" style={{ backgroundColor: '#333' }}>
            <CardHeader>
              <CardTitle className="text-xl text-gray-200">Data Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-base text-gray-300">Total Conversations:</span>
                  <span className="font-medium text-white text-lg">{chatLogs.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-base text-gray-300">Unique Users:</span>
                  <span className="font-medium text-white text-lg">
                    {new Set(chatLogs.map(log => log.user_id)).size}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-base text-gray-300">Success Rate:</span>
                  <span className="font-medium text-white text-lg">
                    {chatLogs.length > 0 
                      ? Math.round((chatLogs.filter(log => log.status === 'success').length / chatLogs.length) * 100)
                      : 0}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-600" style={{ backgroundColor: '#333' }}>
            <CardHeader>
              <CardTitle className="text-xl text-gray-200">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {chatLogs.slice(0, 3).map((log, index) => (
                  <div key={log.id} className="text-base">
                    <div className="font-medium truncate text-white">
                      {log.prompt.length > 30 ? `${log.prompt.substring(0, 30)}...` : log.prompt}
                    </div>
                    <div className="text-gray-400 text-sm">
                      {new Date(log.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-600" style={{ backgroundColor: '#333' }}>
            <CardHeader>
              <CardTitle className="text-xl text-gray-200">Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-base text-gray-300">Avg Response Time:</span>
                  <span className="font-medium text-white text-lg">
                    {chatLogs.filter(log => log.processing_time).length > 0
                      ? `${(chatLogs.reduce((sum, log) => sum + (log.processing_time || 0), 0) / chatLogs.filter(log => log.processing_time).length).toFixed(2)}s`
                      : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-base text-gray-300">Error Rate:</span>
                  <span className="font-medium text-white text-lg">
                    {chatLogs.length > 0 
                      ? Math.round((chatLogs.filter(log => log.status === 'error').length / chatLogs.length) * 100)
                      : 0}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
      </div>

      {/* Interactive Data Chatbot */}
      <DataChatbot chatLogs={chatLogs} />
      </div>
    </div>
  )
}
