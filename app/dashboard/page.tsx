 'use client'

import { useEffect, useState } from 'react'
 import { supabase } from '@/lib/supabase'
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
 import { Button } from '@/components/ui/button'
 import { BarChart3, MessageSquare, Users, TrendingUp, Clock, AlertCircle, CheckCircle, RefreshCw, Brain } from 'lucide-react'
 import Link from 'next/link'
 import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'

interface DashboardStats {
  totalChats: number
  todayChats: number
  avgResponseTime: number
  successRate: number
  activeUsers: number
  errorRate: number
  totalTokens: number
  avgSessionDuration: number
}

interface RecentActivity {
  id: string
  user_id: string
  prompt: string
  response: string
  timestamp: string
  status: 'success' | 'error' | 'pending'
  processing_time: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalChats: 0,
    todayChats: 0,
    avgResponseTime: 0,
    successRate: 0,
    activeUsers: 0,
    errorRate: 0,
    totalTokens: 0,
    avgSessionDuration: 0
  })
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [chartData, setChartData] = useState<{ date: string; current: number; previous: number }[]>([])
  const [wcTopProducts, setWcTopProducts] = useState<Array<{ id: number; name: string; total_sales: number; price: number; stock_quantity: number }>>([])
  // Demo GA data for dashboard widgets (mirrors detailed page samples)
  const [gaTopPages, setGaTopPages] = useState<Array<{ page: string; views: number }>>([
    { page: '/products/wireless-headphones', views: 980 },
    { page: '/products/gaming-keyboards', views: 820 },
    { page: '/products/bluetooth-speakers', views: 760 },
    { page: '/products/usb-hubs', views: 640 },
    { page: '/blog/best-headphones-2024', views: 610 },
  ])
  const [gaDevices, setGaDevices] = useState<Array<{ name: string; value: number }>>([
    { name: 'Mobile', value: 58 },
    { name: 'Desktop', value: 34 },
    { name: 'Tablet', value: 8 },
  ])
  const [scTraffic, setScTraffic] = useState<{ date: string; clicks: number; impressions: number; prevClicks: number; prevImpressions: number }[]>([])
  const [gaTraffic, setGaTraffic] = useState<{ date: string; current: number; previous: number }[]>([])
  const [trafficDays, setTrafficDays] = useState<7 | 28 | 90>(28)
  

  useEffect(() => {
    fetchDashboardStats()
  }, [trafficDays])

  // Fetch GA website traffic for selected range
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(`/api/ga/daily-traffic?days=${trafficDays}&metric=newUsers`, { cache: 'no-store' })
        if (res.ok) {
          const json = await res.json()
          if (Array.isArray(json.data)) setGaTraffic(json.data)
        }
      } catch (e) {
        console.error('Failed to load GA traffic', e)
      }
    })()
  }, [trafficDays])

  // Fetch Search Console daily clicks/impressions
  useEffect(() => {
    ;(async () => {
      try {
        // Use Supabase API route instead of legacy route
        const res = await fetch(`/api/sc/supabase?days=${trafficDays}`,
          { cache: 'no-store' })
        if (res.ok) {
          const json = await res.json()
          // Map the Supabase response format to the expected format
          if (json.dailyData && Array.isArray(json.dailyData)) {
            const mappedData = json.dailyData.map(day => ({
              date: day.date,
              clicks: day.clicks,
              impressions: day.impressions
            }))
            setScTraffic(mappedData)
          }
        }
      } catch (e) {
        console.error('Failed to load SC traffic', e)
      }
    })()
  }, [trafficDays])

  const fetchDashboardStats = async () => {
    try {
      setRefreshing(true)
      
      // Get total chats
      const { count: totalChats } = await supabase
        .from('chat_logs')
        .select('*', { count: 'exact', head: true })

      // Get today's chats
      const today = new Date().toISOString().split('T')[0]
      const { count: todayChats } = await supabase
        .from('chat_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today)

      // Get success rate and error rate
      const { data: successfulChats } = await supabase
        .from('chat_logs')
        .select('status')
        .eq('status', 'success')

      const { data: errorChats } = await supabase
        .from('chat_logs')
        .select('status')
        .eq('status', 'error')

      const successRate = totalChats ? (successfulChats?.length || 0) / totalChats * 100 : 0
      const errorRate = totalChats ? (errorChats?.length || 0) / totalChats * 100 : 0

      // Get unique users (active users)
      const { data: uniqueUsers } = await supabase
        .from('chat_logs')
        .select('user_id')
        .gte('created_at', today)

      const activeUsers = new Set(uniqueUsers?.map(u => u.user_id) || []).size

      // Get processing times for average response time
      const { data: processingTimes } = await supabase
        .from('chat_logs')
        .select('processing_time')
        .not('processing_time', 'is', null)
        .limit(100)

      const avgResponseTime = processingTimes?.length 
        ? processingTimes.reduce((sum, log) => sum + (log.processing_time || 0), 0) / processingTimes.length
        : 1.2

      // Get recent activity (for highlights)
      const { data: recentLogs } = await supabase
        .from('chat_logs')
        .select('id, user_id, prompt, response, created_at, status, processing_time')
        .order('created_at', { ascending: false })
        .limit(10)

      setRecentActivity(recentLogs?.map(log => ({
        id: log.id,
        user_id: log.user_id,
        prompt: log.prompt,
        response: log.response,
        timestamp: log.created_at,
        status: log.status as 'success' | 'error' | 'pending',
        processing_time: log.processing_time || 0
      })) || [])

      setStats({
        totalChats: totalChats || 0,
        todayChats: todayChats || 0,
        avgResponseTime: Math.round(avgResponseTime * 100) / 100,
        successRate: Math.round(successRate),
        activeUsers,
        errorRate: Math.round(errorRate),
        totalTokens: Math.floor(Math.random() * 50000) + 10000, // Mock data - replace with actual token tracking
        avgSessionDuration: Math.floor(Math.random() * 300) + 60 // Mock data - replace with actual session tracking
      })

      // Pull latest Woo snapshot for Top Products (if available)
      try {
        const { data: wcSnap } = await supabase
          .from('wc_snapshots')
          .select('top_products, ts')
          .order('ts', { ascending: false })
          .limit(1)
          .single()
        if (wcSnap?.top_products) {
          setWcTopProducts((wcSnap.top_products as any[]).slice(0, 3))
        }
      } catch (e) {
        // non-fatal if Woo snapshot table not present
      }

      // Build comparative chart data (current vs previous period)
      // Fetch enough history for current + previous window
      const daysNeeded = Math.max(trafficDays * 2, 60)
      const since = new Date()
      since.setDate(since.getDate() - daysNeeded)
      const { data: periodLogs } = await supabase
        .from('chat_logs')
        .select('id, created_at')
        .gte('created_at', since.toISOString())

      // Build per-day chat counts for Conversations Trend (Asia/Singapore timezone)
      const toKeySG = (date: string | Date) => new Date(date).toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
      const countsMap: Record<string, number> = {}
      ;(periodLogs || []).forEach(l => {
        const k = toKeySG(l.created_at as unknown as string)
        countsMap[k] = (countsMap[k] || 0) + 1
      })

      const buildSeries = (len: number, offsetDays: number) => {
        const arr: { date: string; value: number }[] = []
        const base = new Date()
        base.setHours(0,0,0,0)
        for (let i = len - 1; i >= 0; i--) {
          const d = new Date(base)
          d.setDate(d.getDate() - i - offsetDays)
          const key = new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
          arr.push({ date: key.slice(5), value: countsMap[key] || 0 })
        }
        return arr
      }

      const len = period === 'week' ? 7 : 30
      const curr = buildSeries(len, 0)
      const prev = buildSeries(len, len)
      const merged = curr.map((c, idx) => ({ date: c.date, current: c.value, previous: prev[idx]?.value || 0 }))
      setChartData(merged)

      // Fetch GA headline widgets (Top Pages / Top Devices)
      try {
        const tp = await fetch('/api/ga/top-pages', { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject())
        if (tp?.data) setGaTopPages(tp.data)
      } catch {}
      try {
        const td = await fetch('/api/ga/top-devices', { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject())
        if (td?.data) setGaDevices(td.data)
      } catch {}

      // chat traffic series now computed in a separate effect
    } catch (error) {
      console.error('Error fetching dashboard stats:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const statCards = [
    {
      title: 'Total Conversations',
      value: stats.totalChats.toLocaleString(),
      description: 'All time conversations',
      icon: MessageSquare,
      color: 'text-primary',
      trend: '+12%'
    },
    {
      title: 'Today\'s Chats',
      value: stats.todayChats.toLocaleString(),
      description: 'Conversations today',
      icon: TrendingUp,
      color: 'text-emerald-400',
      trend: '+8%'
    },
    {
      title: 'Active Users',
      value: stats.activeUsers.toLocaleString(),
      description: 'Unique users today',
      icon: Users,
      color: 'text-blue-400',
      trend: '+5%'
    },
    {
      title: 'Success Rate',
      value: `${stats.successRate}%`,
      description: 'Successful interactions',
      icon: CheckCircle,
      color: 'text-green-400',
      trend: '+2%'
    }
  ]

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Welcome to your chatbot analytics dashboard</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-4 bg-gray-200 rounded w-full"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  const handleRefresh = () => {
    fetchDashboardStats()
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
            Dashboard
          </h1>
          <p className="text-muted-foreground">Welcome to your Tradezone chatbot analytics dashboard</p>
        </div>
        <div className="flex gap-2">
          <div className="rounded-md border p-0.5 mr-2">
            <Button variant={period === 'week' ? 'default' : 'ghost'} size="sm" onClick={() => setPeriod('week')}>Week</Button>
            <Button variant={period === 'month' ? 'default' : 'ghost'} size="sm" onClick={() => setPeriod('month')}>Month</Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Link href="/dashboard/logs">
            <Button size="sm" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              View Logs
            </Button>
          </Link>
        </div>
      </div>

      {/* Search Console + Google Analytics side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Search Console</CardTitle>
              <CardDescription>Clicks & Impressions — last {trafficDays} days vs previous {trafficDays} days</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {[7, 28, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setTrafficDays(d as 7 | 28 | 90)}
                  className={`rounded-md px-3 py-1 text-xs border ${trafficDays === d ? 'bg-purple-600 text-white border-purple-600' : 'bg-transparent hover:bg-muted/50'}`}
                >
                  {d === 90 ? '3 months' : `${d} days`}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {(() => {
            const cNow = scTraffic.reduce((s, x) => s + (x.clicks || 0), 0)
            const cPrev = scTraffic.reduce((s, x) => s + (x.prevClicks || 0), 0)
            const iNow = scTraffic.reduce((s, x) => s + (x.impressions || 0), 0)
            const iPrev = scTraffic.reduce((s, x) => s + (x.prevImpressions || 0), 0)
            return (
              <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
                <span className="rounded-md bg-muted px-2 py-1">Clicks: {cNow.toLocaleString()} vs {cPrev.toLocaleString()}</span>
                <span className="rounded-md bg-muted px-2 py-1">Impr.: {iNow.toLocaleString()} vs {iPrev.toLocaleString()}</span>
              </div>
            )
          })()}
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={scTraffic.length ? scTraffic : []} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="clicks" name="Clicks (Current)" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="prevClicks" name="Clicks (Prev)" stroke="#2563eb" strokeWidth={2} dot={false} strokeDasharray="4 4" />
                <Line type="monotone" dataKey="impressions" name="Impressions (Current)" stroke="#7c3aed" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="prevImpressions" name="Impressions (Prev)" stroke="#7c3aed" strokeWidth={2} dot={false} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Website Traffic (GA) comparative chart */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Website Traffic</CardTitle>
              <CardDescription>New Users — last {trafficDays} days vs previous {trafficDays} days</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {[7, 28, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setTrafficDays(d as 7 | 28 | 90)}
                  className={`rounded-md px-3 py-1 text-xs border ${trafficDays === d ? 'bg-purple-600 text-white border-purple-600' : 'bg-transparent hover:bg-muted/50'}`}
                >
                  {d === 90 ? '3 months' : `${d} days`}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {gaTraffic.length === 0 ? (
            <div className="mb-3 rounded-md border border-yellow-300 bg-yellow-50/70 px-3 py-2 text-xs text-yellow-900">
              No GA data returned. Check GA_PROPERTY, service account permissions, and that the property has data.
            </div>
          ) : (
            (() => {
              const currTotal = gaTraffic.reduce((s, x) => s + (x.current || 0), 0)
              const prevTotal = gaTraffic.reduce((s, x) => s + (x.previous || 0), 0)
              const currAvg = trafficDays ? Math.round(currTotal / trafficDays) : 0
              const prevAvg = trafficDays ? Math.round(prevTotal / trafficDays) : 0
              return (
                <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
                  <span className="rounded-md bg-muted px-2 py-1">Current total: {currTotal.toLocaleString()}</span>
                  <span className="rounded-md bg-muted px-2 py-1">Prev total: {prevTotal.toLocaleString()}</span>
                  <span className="rounded-md bg-muted px-2 py-1">Avg/day: {currAvg} vs {prevAvg}</span>
                </div>
              )
            })()
          )}
          {(() => {
            const currTotal = gaTraffic.reduce((s, x) => s + (x.current || 0), 0)
            const prevTotal = gaTraffic.reduce((s, x) => s + (x.previous || 0), 0)
            if (gaTraffic.length && (currTotal === 0 || prevTotal === 0)) {
              return (
                <div className="mb-3 rounded-md border border-yellow-300 bg-yellow-50/70 px-3 py-2 text-xs text-yellow-900">
                  Traffic shows 0 for one period. If unexpected, verify GA property access, metric and date range.
                </div>
              )
            }
            return null
          })()}
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={gaTraffic} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="current" name="Current" stroke="#6366f1" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="previous" name="Previous" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      </div>

      {/* High-level KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.title} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {card.title}
                </CardTitle>
                <Icon className={`h-4 w-4 ${card.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {card.description}
                  </p>
                  <span className={`text-xs font-medium ${
                    card.trend.startsWith('+') ? 'text-green-600' : 
                    card.trend.startsWith('-') && !card.title.includes('Error') ? 'text-red-600' :
                    card.trend.startsWith('-') && card.title.includes('Error') ? 'text-green-600' :
                    'text-gray-600'
                  }`}>
                    {card.trend}
                  </span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Comparative trend chart */}
      <Card>
        <CardHeader>
          <CardTitle>Conversations Trend</CardTitle>
          <CardDescription>
            {period === 'week' ? 'Last 7 days vs previous 7 days' : 'Last 30 days vs previous 30 days'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="current" name="Current" stroke="#a78bfa" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="previous" name="Previous" stroke="#22c55e" strokeWidth={2} dot={false} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Highlights: keep each page birdview entry points */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle>AI Analytics</CardTitle>
            <CardDescription>Insights from chat data</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <div>
              <div className="text-3xl font-bold">{stats.successRate}%</div>
              <div className="text-xs text-muted-foreground">Success rate today</div>
            </div>
            <Link href="/dashboard/analytics">
              <Button size="sm" variant="default">Open</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle>WooCommerce</CardTitle>
            <CardDescription>Store performance snapshot</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <div>
              <div className="text-3xl font-bold">{stats.todayChats}</div>
              <div className="text-xs text-muted-foreground">Orders/Chats today (proxy)</div>
            </div>
            <Link href="/dashboard/woocommerce">
              <Button size="sm" variant="default">Open</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle>Google Analytics</CardTitle>
            <CardDescription>Web & search performance</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <div>
              <div className="text-3xl font-bold">—</div>
              <div className="text-xs text-muted-foreground">Open for full details</div>
            </div>
            <Link href="/dashboard/google-analytics">
              <Button size="sm" variant="default">Open</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Top summaries section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle>Top Products</CardTitle>
            <CardDescription>From latest WooCommerce snapshot</CardDescription>
          </CardHeader>
          <CardContent>
            {wcTopProducts.length > 0 ? (
              <div className="space-y-3">
                {wcTopProducts.map((p, i) => (
                  <div key={p.id} className="flex items-center justify-between rounded-md border p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 text-xs rounded-full bg-secondary flex items-center justify-center">
                        {i + 1}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.total_sales} sold • Stock {p.stock_quantity ?? '—'}</div>
                      </div>
                    </div>
                    <div className="text-sm">S${p.price.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No WooCommerce snapshot yet</div>
            )}
            <div className="mt-3 flex justify-end">
              <Link href="/dashboard/woocommerce">
                <Button size="sm" variant="default">Open</Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle>Top Pages</CardTitle>
            <CardDescription>From Google Analytics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {gaTopPages.slice(0, 5).map((p, i) => (
                <div key={p.page} className="flex items-center justify-between rounded-md border p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 text-xs rounded-full bg-secondary flex items-center justify-center">{i + 1}</div>
                    <div className="text-sm truncate max-w-[220px]" title={p.page}>{p.page}</div>
                  </div>
                  <div className="text-sm font-medium">{p.views.toLocaleString()} views</div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <Link href="/dashboard/google-analytics">
                <Button size="sm" variant="default">Open</Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle>Top Devices</CardTitle>
            <CardDescription>From Google Analytics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {gaDevices.map((d) => (
                <div key={d.name} className="flex items-center justify-between rounded-md border p-3">
                  <div className="text-sm font-medium">{d.name}</div>
                  <div className="text-sm text-muted-foreground">{d.value}%</div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <Link href="/dashboard/google-analytics">
                <Button size="sm" variant="default">Open</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
