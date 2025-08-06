'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AIAnalytics from '@/components/ai-analytics'
import DataChatbot from '@/components/data-chatbot'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Brain, ArrowLeft, Settings, Trash2, Download, Mail } from 'lucide-react'
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
  const [persistentReport, setPersistentReport] = useState<any>(null)
  const [reportTimestamp, setReportTimestamp] = useState<Date | null>(null)
  const [emailSchedule, setEmailSchedule] = useState<string>('none')

  const exportAnalyticsReport = (format: 'json' | 'csv' | 'pdf') => {
    if (!persistentReport) {
      alert('No analytics report available to export')
      return
    }

    const timestamp = new Date().toISOString().split('T')[0]
    const filename = `analytics-report-${timestamp}`

    if (format === 'json') {
      const dataStr = JSON.stringify(persistentReport, null, 2)
      const dataBlob = new Blob([dataStr], { type: 'application/json' })
      const url = URL.createObjectURL(dataBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${filename}.json`
      link.click()
      URL.revokeObjectURL(url)
    } else if (format === 'csv') {
      // Convert analytics data to CSV format
      const csvData = convertReportToCSV(persistentReport)
      const dataBlob = new Blob([csvData], { type: 'text/csv' })
      const url = URL.createObjectURL(dataBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${filename}.csv`
      link.click()
      URL.revokeObjectURL(url)
    }
  }

  const convertReportToCSV = (report: any) => {
    const lines = [
      'Metric,Value',
      `Overall Sentiment,${report.overall_sentiment?.sentiment || 'N/A'}`,
      `Sentiment Confidence,${Math.round((report.overall_sentiment?.confidence || 0) * 100)}%`,
      `Response Quality,${report.performance_feedback?.response_quality || 'N/A'}/10`,
      `User Satisfaction,${report.performance_feedback?.user_satisfaction || 'N/A'}/10`,
      '',
      'Trending Topics',
      ...(report.trending_topics || []).map((topic: string) => `"${topic}"`),
      '',
      'Recommendations',
      ...(report.recommendations || []).map((rec: any) => `"${rec.title}","${rec.description}"`)
    ]
    return lines.join('\n')
  }

  const scheduleEmailReport = async (frequency: string) => {
    try {
      const response = await fetch('/api/schedule-email-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frequency,
          email: 'info@rezult.co',
          reportData: persistentReport
        })
      })
      
      if (response.ok) {
        setEmailSchedule(frequency)
        alert(`Email reports scheduled ${frequency}ly to info@rezult.co`)
      } else {
        alert('Failed to schedule email reports. Please check SMTP configuration.')
      }
    } catch (error) {
      console.error('Error scheduling email report:', error)
      alert('Error scheduling email reports')
    }
  }

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
                {reportTimestamp && (
                  <span className="block text-sm text-gray-500 mt-1">
                    Report generated: {reportTimestamp.toLocaleString()}
                  </span>
                )}
              </p>
            </div>
          </div>
        
          <div className="flex gap-2">
            {persistentReport && (
              <>
                <div className="flex gap-1">
                  <Button 
                    onClick={() => exportAnalyticsReport('json')}
                    variant="outline" 
                    size="sm" 
                    className="bg-blue-700 border-blue-600 text-blue-200 hover:bg-blue-600"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    JSON
                  </Button>
                  <Button 
                    onClick={() => exportAnalyticsReport('csv')}
                    variant="outline" 
                    size="sm" 
                    className="bg-green-700 border-green-600 text-green-200 hover:bg-green-600"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    CSV
                  </Button>
                </div>
                <div className="flex gap-1">
                  <Button 
                    onClick={() => scheduleEmailReport('week')}
                    variant="outline" 
                    size="sm" 
                    className={`${emailSchedule === 'week' ? 'bg-purple-600 border-purple-500' : 'bg-purple-700 border-purple-600'} text-purple-200 hover:bg-purple-600`}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Weekly
                  </Button>
                  <Button 
                    onClick={() => scheduleEmailReport('month')}
                    variant="outline" 
                    size="sm" 
                    className={`${emailSchedule === 'month' ? 'bg-orange-600 border-orange-500' : 'bg-orange-700 border-orange-600'} text-orange-200 hover:bg-orange-600`}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Monthly
                  </Button>
                </div>
              </>
            )}
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

      {/* AI Analytics Report */}
      <AIAnalytics 
        chatLogs={chatLogs} 
        persistentReport={persistentReport}
        onReportGenerated={(report, timestamp) => {
          setPersistentReport(report)
          setReportTimestamp(timestamp)
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
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h1 className="text-3xl font-bold text-white">AI Analytics</h1>
                    <p className="text-gray-400 mt-2">
                      AI-powered insights from your chatbot interactions
                      {reportTimestamp && (
                        <span className="block text-sm text-gray-500 mt-1">
                          Report generated: {reportTimestamp.toLocaleString()}
                        </span>
                      )}
                    </p>
                  </div>
                  {persistentReport && (
                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          setPersistentReport(null)
                          setReportTimestamp(null)
                        }}
                        variant="outline"
                        className="bg-red-600 hover:bg-red-700 text-white border-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Report
                      </Button>
                    </div>
                  )}
                </div>
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
