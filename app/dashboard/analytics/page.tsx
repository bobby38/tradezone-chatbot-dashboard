'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchWithCache } from '@/lib/client-cache'
import { supabase } from '@/lib/supabase'
import AIAnalytics from '@/components/ai-analytics'
import DataChatbot from '@/components/data-chatbot'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Brain, ArrowLeft, Settings, Trash2, Download, Mail } from 'lucide-react'
import Link from 'next/link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

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
  const [insightsOpen, setInsightsOpen] = useState(false)
  const [compiledInsights, setCompiledInsights] = useState<string>('')
  const [selectedTab, setSelectedTab] = useState<'chat' | 'woo' | 'google'>('chat')
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyItems, setHistoryItems] = useState<Array<{id: string, created_at: string, content: string}>>([])

  // Derive a short title from content (first non-empty line)
  const titleFrom = (content: string) => {
    const line = (content || '')
      .split('\n')
      .map(l => l.trim())
      .find(l => l.length > 0) || 'Untitled insight'
    return line.length > 80 ? line.slice(0, 77) + '…' : line
  }

  const handleAskAI = async () => {
    // Build a tab-scoped prompt using real data from the selected tab only.
    setInsightsLoading(true)
    setInsightsOpen(true)
    let body = ''
    if (selectedTab === 'chat') {
      const successRate = chatLogs.length > 0 ? Math.round((chatLogs.filter(l => l.status === 'success').length / chatLogs.length) * 100) : 0
      body = [
        '— Chat (AI Analytics) —',
        `Conversations: ${chatLogs.length}`,
        `Success rate: ${successRate}%`,
        '',
        'Task: Provide insights, issues, and prioritized actions to improve the chatbot. Keep it concise and actionable.'
      ].join('\n')
    } else if (selectedTab === 'woo') {
      try {
        const json = await fetchWithCache('/api/woocommerce/orders?limit=100')
        const orders = Array.isArray(json?.orders) ? json.orders : (json?.data || [])
        const count = orders.length
        const revenue = orders.reduce((s: number, o: any) => s + (parseFloat(o.total) || 0), 0)
        const aov = count ? (revenue / count) : 0
        const products: Record<string, number> = {}
        const statusCount: Record<string, number> = {}
        const qtyTotal = orders.reduce((sum: number, o: any) => {
          const st = (o.status || '').toString()
          statusCount[st] = (statusCount[st] || 0) + 1
          const items = o.line_items || o.items || []
          return sum + items.reduce((s: number, it: any) => s + Number(it.quantity || it.qty || 0), 0)
        }, 0)
        orders.forEach((o: any) => {
          const items = o.line_items || o.items || []
          items.forEach((it: any) => {
            const name = it.name || it.product_name || 'Unknown'
            const qty = Number(it.quantity || it.qty || 0)
            products[name] = (products[name] || 0) + qty
          })
        })
        const productEntries = Object.entries(products).sort((a, b) => b[1] - a[1])
        const topProduct = productEntries[0]?.[0] || 'N/A'
        const top3 = productEntries.slice(0, 3)
        const topShare = qtyTotal > 0 ? Math.round((Number(productEntries[0]?.[1] || 0) / qtyTotal) * 100) : 0

        // Trend: last 7d vs previous 7d
        const byDate = (o: any) => new Date(o.date_created || o.created_at || o.date_paid || o.date_modified || Date.now())
        const now = Date.now()
        const d7 = 7 * 24 * 3600 * 1000
        const last7 = orders.filter((o: any) => now - byDate(o).getTime() <= d7).length
        const prev7 = orders.filter((o: any) => now - byDate(o).getTime() > d7 && now - byDate(o).getTime() <= 2 * d7).length
        const trendPct = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : undefined

        const completed = (statusCount['completed'] || 0)
        const processing = (statusCount['processing'] || 0) + (statusCount['on-hold'] || 0)
        const refunded = (statusCount['refunded'] || 0)

        const last = orders[0]
        const lastLine = last ? `Last order #${last.id || ''} ${last.status ? '(' + last.status + ')' : ''} total ${last.total || ''}` : 'No recent orders.'

        const parts: string[] = [
          '— WooCommerce (Store) —',
          `Orders (last 100): ${count}`,
          `Revenue: ${revenue.toFixed(2)}`,
          `AOV: ${aov.toFixed(2)}`,
          ...(top3.length ? ['Top Products:', ...top3.map(([n, q], i) => `  ${i + 1}. ${n} (${q})`)] : [`Top product (by qty): ${topProduct}`]),
          ...(trendPct !== undefined ? [`7d trend: ${trendPct >= 0 ? '+' : ''}${trendPct}% (L7 ${last7} vs P7 ${prev7})`] : []),
          `Fulfillment: completed ${completed}, processing ${processing}, refunded ${refunded}`,
          lastLine,
          '',
          'Recommendations:',
        ]

        // Data-driven recommendations (3–5)
        const recs: string[] = []
        if (trendPct !== undefined && trendPct < 0) recs.push('Run a 7–day promo to reverse the downward trend; highlight best-seller bundle on home and cart.')
        if (aov && aov < 50) recs.push('Introduce bundles and free-shipping threshold slightly above current AOV to lift average basket size.')
        if (topShare >= 30) recs.push(`Restock and feature ${topProduct} (accounts for ~${topShare}% of qty) to avoid stockouts and capture demand.`)
        if (processing > completed) recs.push('Tighten fulfillment SLA: auto-notify delayed orders and prioritize picking to reduce processing backlog.')
        if (refunded > 0) recs.push('Audit refund reasons and update product pages/FAQ to reduce preventable returns.')
        if (recs.length < 3) recs.push('Launch an email win-back for recent non-purchasers with a time-limited incentive.')

        body = [...parts, ...recs.map(r => `- ${r}`)].join('\n')
      } catch (e) {
        body = 'WooCommerce data unavailable. Open the WooCommerce page to load data.'
      }

    } else if (selectedTab === 'google') {
      try {
        const results = await Promise.allSettled([
          fetchWithCache('/api/ga/summary'),
          fetchWithCache('/api/ga/top-pages?days=28'),
          fetchWithCache('/api/ga/top-devices?days=28'),
          fetchWithCache('/api/sc/supabase')
        ])
        const get = (i: number) => (results[i].status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<any>).value : null)
        const gaSummary = get(0)
        const gaPages = get(1)
        const gaDevices = get(2)
        const scSummary = get(3)
        const sessions = gaSummary?.sessions ?? gaSummary?.data?.sessions
        const users = gaSummary?.users ?? gaSummary?.data?.users
        const topPage = gaPages?.rows?.[0]?.dimensionValues?.[0]?.value || gaPages?.data?.[0]?.page
        const topDevice = gaDevices?.rows?.[0]?.dimensionValues?.[0]?.value || gaDevices?.data?.[0]?.device
        const scClicks = scSummary?.summary?.clicks ?? scSummary?.clicks ?? 0
        const scImpr = scSummary?.summary?.impressions ?? scSummary?.impressions ?? 0
        const scCtr = (typeof scClicks === 'number' && typeof scImpr === 'number' && scImpr > 0)
          ? `${((scClicks / scImpr) * 100).toFixed(2)}%`
          : undefined

        // Format top 3 pages if available
        const pageLines: string[] = []
        if (gaPages?.rows?.length) {
          const count = Math.min(3, gaPages.rows.length)
          for (let i = 0; i < count; i++) {
            const r = gaPages.rows[i]
            const name = r?.dimensionValues?.[0]?.value || gaPages?.data?.[i]?.page
            const metric = r?.metricValues?.[0]?.value || gaPages?.data?.[i]?.value
            pageLines.push(`  ${i + 1}. ${name || 'N/A'}${metric ? ` (${metric})` : ''}`)
          }
        } else if (gaPages?.data?.length) {
          const count = Math.min(3, gaPages.data.length)
          for (let i = 0; i < count; i++) {
            const p = gaPages.data[i]
            pageLines.push(`  ${i + 1}. ${p.page || 'N/A'}${p.value ? ` (${p.value})` : ''}`)
          }
        }

        // Format top 3 devices if available
        const deviceLines: string[] = []
        if (gaDevices?.rows?.length) {
          const count = Math.min(3, gaDevices.rows.length)
          for (let i = 0; i < count; i++) {
            const r = gaDevices.rows[i]
            const name = r?.dimensionValues?.[0]?.value || gaDevices?.data?.[i]?.device
            const metric = r?.metricValues?.[0]?.value || gaDevices?.data?.[i]?.value
            deviceLines.push(`  ${i + 1}. ${name || 'N/A'}${metric ? ` (${metric})` : ''}`)
          }
        } else if (gaDevices?.data?.length) {
          const count = Math.min(3, gaDevices.data.length)
          for (let i = 0; i < count; i++) {
            const d = gaDevices.data[i]
            deviceLines.push(`  ${i + 1}. ${d.device || 'N/A'}${d.value ? ` (${d.value})` : ''}`)
          }
        }

        const parts: string[] = ['— Google Analytics / Search Console —']
        if (sessions != null) parts.push(`GA Sessions (28d): ${sessions}`)
        if (users != null) parts.push(`GA Users (28d): ${users}`)
        if (pageLines.length) {
          parts.push('Top Pages:')
          parts.push(...pageLines)
        } else if (topPage) {
          parts.push(`GA Top page: ${topPage}`)
        }
        if (deviceLines.length) {
          parts.push('Top Devices:')
          parts.push(...deviceLines)
        } else if (topDevice) {
          parts.push(`GA Top device: ${topDevice}`)
        }
        if (scClicks != null || scImpr != null) {
          parts.push(`SC Clicks (28d): ${scClicks ?? 'N/A'}`)
          parts.push(`SC Impressions (28d): ${scImpr ?? 'N/A'}`)
          if (scCtr) parts.push(`SC CTR (28d): ${scCtr}`)
        }
        parts.push('', 'Task: Provide traffic insights and 3–5 next actions for acquisition/content/SEO.')
        body = parts.join('\n')
      } catch (e) {
        body = 'Analytics data unavailable. If this persists, open the GA/SC pages once to warm the cache.'
      }
    }
    setCompiledInsights(body)
    // Persist last 10 insights per tab in Supabase (best-effort)
    saveInsight(selectedTab, body).catch(() => {})
    // Refresh inline history list (best-effort)
    loadHistory().catch(() => {})
    setInsightsLoading(false)
  }

  // Save insight to Supabase and prune to latest 10 per tab
  async function saveInsight(tab: 'chat' | 'woo' | 'google', content: string) {
    try {
      // Insert
      const { error: insertError } = await supabase
        .from('insights_history')
        .insert({ tab, content })
      if (insertError) throw insertError

      // Prune older rows beyond 10 for this tab
      const { data, error: listError } = await supabase
        .from('insights_history')
        .select('id, created_at')
        .eq('tab', tab)
        .order('created_at', { ascending: false })
        .range(10, 999) // rows beyond the first 10
      if (listError) return
      const idsToDelete = (data || []).map((r: any) => r.id).filter(Boolean)
      if (idsToDelete.length) {
        await supabase.from('insights_history').delete().in('id', idsToDelete)
      }
    } catch (e) {
      // Ignore; table or policy might not be ready
      console.warn('saveInsight skipped:', e)
    }
  }

  // Load last 10 insights for the current tab
  const loadHistory = async () => {
    try {
      setHistoryLoading(true)
      const { data, error } = await supabase
        .from('insights_history')
        .select('id, created_at, content')
        .eq('tab', selectedTab)
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw error
      setHistoryItems((data as any[]) || [])
    } catch (e) {
      console.warn('loadHistory failed:', e)
      setHistoryItems([])
    } finally {
      setHistoryLoading(false)
    }
  }

  // Auto-load history whenever the tab changes
  useEffect(() => {
    loadHistory().catch(() => {})
  }, [selectedTab])

  // Delete a single history item by id
  const deleteHistory = async (id: string) => {
    try {
      const { error } = await supabase.from('insights_history').delete().eq('id', id)
      if (error) throw error
      setHistoryItems(items => items.filter(i => i.id !== id))
    } catch (e) {
      alert('Failed to delete history item')
    }
  }

  // Clear all insights for the current tab
  const clearHistory = async () => {
    if (!confirm('Clear all insights for this tab?')) return
    try {
      const { error } = await supabase.from('insights_history').delete().eq('tab', selectedTab)
      if (error) throw error
      setHistoryItems([])
    } catch (e) {
      alert('Failed to clear history')
    }
  }

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
    const load = async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('chat_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100)
        if (error) throw error
        setChatLogs((data as any[]) || [])
      } catch (err) {
        console.error('Error fetching chat logs:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch chat logs')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

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

        {/* Tabs: Chat | WooCommerce | Google */}
        <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as any)} className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="chat">Chat</TabsTrigger>
              <TabsTrigger value="woo">WooCommerce</TabsTrigger>
              <TabsTrigger value="google">Google</TabsTrigger>
            </TabsList>
            <div className="flex gap-2">
              <Button onClick={handleAskAI} variant="default" className="bg-purple-600 hover:bg-purple-700 text-white">
                <Brain className="h-4 w-4 mr-2" />
                Ask AI for Insights
              </Button>
            </div>
          </div>

          <TabsContent value="chat" className="space-y-4">
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

          {/* Insights History (Chat) */}
          <Card className="border-gray-600" style={{ backgroundColor: '#333' }}>
            <CardHeader>
              <CardTitle className="text-xl text-gray-200">Insights History</CardTitle>
              <CardDescription className="text-gray-400">Last 10 for Chat</CardDescription>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="text-gray-400 text-sm">Loading…</div>
              ) : historyItems.length === 0 ? (
                <div className="text-gray-400 text-sm">No insights yet.</div>
              ) : (
                <div className="space-y-2">
                  {historyItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-3 border border-gray-700 rounded px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm text-white truncate">{titleFrom(item.content)}</div>
                        <div className="text-xs text-gray-400">{new Date(item.created_at).toLocaleString()}</div>
                      </div>
                      <div className="flex-shrink-0 flex gap-2">
                        <Button size="sm" variant="outline" className="bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600"
                          onClick={() => { setCompiledInsights(item.content); setInsightsOpen(true); }}>
                          View
                        </Button>
                        <Button size="sm" variant="outline" className="bg-red-700 border-red-600 text-red-200 hover:bg-red-600"
                          onClick={() => deleteHistory(item.id)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
          </TabsContent>

          <TabsContent value="woo" className="space-y-4">
            <Card className="border-gray-600" style={{ backgroundColor: '#333' }}>
              <CardHeader>
                <CardTitle className="text-xl text-gray-200">WooCommerce Summary</CardTitle>
                <CardDescription className="text-gray-400">Last 100 orders, last sale status, and top products. Open full page for details.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-gray-300">View detailed sales, shipping, and product performance.</div>
                  <Link href="/dashboard/woocommerce"><Button className="bg-purple-600 hover:bg-purple-700 text-white">Open</Button></Link>
                </div>
              </CardContent>
            </Card>

            {/* Insights History (WooCommerce) */}
            <Card className="border-gray-600" style={{ backgroundColor: '#333' }}>
              <CardHeader>
                <CardTitle className="text-xl text-gray-200">Insights History</CardTitle>
                <CardDescription className="text-gray-400">Last 10 for WooCommerce</CardDescription>
              </CardHeader>
              <CardContent>
                {historyLoading ? (
                  <div className="text-gray-400 text-sm">Loading…</div>
                ) : historyItems.length === 0 ? (
                  <div className="text-gray-400 text-sm">No insights yet.</div>
                ) : (
                  <div className="space-y-2">
                    {historyItems.map(item => (
                      <div key={item.id} className="flex items-center justify-between gap-3 border border-gray-700 rounded px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-sm text-white truncate">{titleFrom(item.content)}</div>
                          <div className="text-xs text-gray-400">{new Date(item.created_at).toLocaleString()}</div>
                        </div>
                        <div className="flex-shrink-0 flex gap-2">
                          <Button size="sm" variant="outline" className="bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600"
                            onClick={() => { setCompiledInsights(item.content); setInsightsOpen(true); }}>
                            View
                          </Button>
                          <Button size="sm" variant="outline" className="bg-red-700 border-red-600 text-red-200 hover:bg-red-600"
                            onClick={() => deleteHistory(item.id)}>
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="google" className="space-y-4">
            <Card className="border-gray-600" style={{ backgroundColor: '#333' }}>
              <CardHeader>
                <CardTitle className="text-xl text-gray-200">Google Analytics Summary</CardTitle>
                <CardDescription className="text-gray-400">Sessions, users, channels, devices. Open full page for details and charts.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-gray-300">Explore traffic patterns and top content.</div>
                  <Link href="/dashboard/google-analytics"><Button className="bg-purple-600 hover:bg-purple-700 text-white">Open</Button></Link>
                </div>
              </CardContent>
            </Card>

            {/* Insights History (Google) */}
            <Card className="border-gray-600" style={{ backgroundColor: '#333' }}>
              <CardHeader>
                <CardTitle className="text-xl text-gray-200">Insights History</CardTitle>
                <CardDescription className="text-gray-400">Last 10 for Google Analytics</CardDescription>
              </CardHeader>
              <CardContent>
                {historyLoading ? (
                  <div className="text-gray-400 text-sm">Loading…</div>
                ) : historyItems.length === 0 ? (
                  <div className="text-gray-400 text-sm">No insights yet.</div>
                ) : (
                  <div className="space-y-2">
                    {historyItems.map(item => (
                      <div key={item.id} className="flex items-center justify-between gap-3 border border-gray-700 rounded px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-sm text-white truncate">{titleFrom(item.content)}</div>
                          <div className="text-xs text-gray-400">{new Date(item.created_at).toLocaleString()}</div>
                        </div>
                        <div className="flex-shrink-0 flex gap-2">
                          <Button size="sm" variant="outline" className="bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600"
                            onClick={() => { setCompiledInsights(item.content); setInsightsOpen(true); }}>
                            View
                          </Button>
                          <Button size="sm" variant="outline" className="bg-red-700 border-red-600 text-red-200 hover:bg-red-600"
                            onClick={() => deleteHistory(item.id)}>
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Simple Insights Modal */}
        {insightsOpen && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-lg border border-gray-700" style={{ backgroundColor: '#2A2A2A' }}>
              <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <div className="text-lg font-semibold text-white flex items-center gap-2"><Brain className="h-5 w-5 text-purple-400"/>AI Insights</div>
                <Button variant="ghost" onClick={() => setInsightsOpen(false)} className="text-gray-300 hover:text-white">Close</Button>
              </div>
              <div className="p-4 max-h-[60vh] overflow-auto">
                {insightsLoading ? (
                  <div className="text-gray-300 text-sm">Generating summary from current tab data...</div>
                ) : (
                  <pre className="whitespace-pre-wrap text-gray-200 text-sm">{compiledInsights}</pre>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
