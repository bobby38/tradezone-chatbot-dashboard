"use client"

import { useEffect, useMemo, useState } from 'react'
import { fetchWithCache, invalidateCache } from '@/lib/client-cache'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Search, TrendingUp, Users, Eye, MousePointer, Filter, Download, ExternalLink, BarChart3, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

export default function GoogleAnalyticsPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [deviceFilter, setDeviceFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)
  const [gaRange, setGaRange] = useState('30d')
  const [gaMetric, setGaMetric] = useState<'sessions' | 'newUsers'>('sessions')

  // Live GA state
  const [trendData, setTrendData] = useState<{ date: string; current: number; previous: number }[]>([])
  const [pageViewsData, setPageViewsData] = useState<{ page: string; views: number }[]>([])
  const [deviceData, setDeviceData] = useState<{ name: string; value: number }[]>([])
  const [scSummary, setScSummary] = useState<{ clicks: number; impressions: number; ctr: number; position: number } | null>(null)
  const [gaSummary, setGaSummary] = useState<{ activeUsers: number; newUsers: number; averageEngagementTime: number; eventCount: number } | null>(null)
  // Live SC table state
  const [scRows, setScRows] = useState<Array<{ query: string; page: string; clicks: number; impressions: number; ctr: number; position: number; device: string; country: string }>>([])
  const [scLoading, setScLoading] = useState(false)
  const [scError, setScError] = useState<string | null>(null)

  // Map UI range to API days (GA daily-traffic supports 7, 28, 90)
  const daysParam = useMemo(() => {
    if (gaRange === '7d') return 7
    if (gaRange === '90d') return 90
    return 28 // treat 30d as 28d for GA API compatibility
  }, [gaRange])

  // Fetch GA data
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError(null)

        // Traffic trend (GA)
        const trendJson = await fetchWithCache<{ data: any[] }>(`/api/ga/daily-traffic?days=${daysParam}&metric=${gaMetric}`)
        if (!cancelled) setTrendData(trendJson?.data || [])

        // Top pages (GA, align days)
        const pagesJson = await fetchWithCache<{ data: any[] }>(`/api/ga/top-pages?days=${daysParam}`)
        if (!cancelled) setPageViewsData(pagesJson?.data || [])

        // Devices (GA, align days)
        const devicesJson = await fetchWithCache<{ data: any[] }>(`/api/ga/top-devices?days=${daysParam}`)
        if (!cancelled) setDeviceData(devicesJson?.data || [])

        // Search Console summary (align days)
        try {
          const scJson = await fetchWithCache<{ data: { clicks: number; impressions: number; ctr: number; position: number } }>(`/api/sc/summary?days=${daysParam}`)
          if (!cancelled) setScSummary(scJson?.data || null)
        } catch (e) {
          // Keep UI resilient if SC is not yet configured
          if (!cancelled) setScSummary(null)
        }

        // Google Analytics summary (align days)
        try {
          const gaSum = await fetchWithCache<{ data: { activeUsers: number; newUsers: number; averageEngagementTime: number; eventCount: number } }>(`/api/ga/summary?days=${daysParam}`)
          if (!cancelled) setGaSummary(gaSum?.data || null)
        } catch (e) {
          if (!cancelled) setGaSummary(null)
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [daysParam, gaMetric])

  // Fetch SC queries (live) whenever filters/pagination change
  useEffect(() => {
    let cancelled = false
    async function loadSC() {
      try {
        setScLoading(true)
        setScError(null)
        const params = new URLSearchParams()
        params.set('days', String(daysParam))
        params.set('page', String(currentPage))
        params.set('pageSize', String(itemsPerPage))
        if (deviceFilter !== 'all') params.set('device', deviceFilter)
        if (searchQuery) params.set('q', searchQuery)
        const json = await fetchWithCache<{ data: any[] }>(`/api/sc/queries?${params.toString()}`)
        if (!cancelled) setScRows(json?.data || [])
      } catch (e: any) {
        if (!cancelled) setScError(e?.message || String(e))
      } finally {
        if (!cancelled) setScLoading(false)
      }
    }
    loadSC()
    return () => { cancelled = true }
  }, [daysParam, currentPage, itemsPerPage, deviceFilter, searchQuery])

  // Derived totals for quick stats (live)
  const totalSessions = useMemo(() => trendData.reduce((s, d) => s + (d.current || 0), 0), [trendData])
  const totalPrevSessions = useMemo(() => trendData.reduce((s, d) => s + (d.previous || 0), 0), [trendData])
  const sessionDeltaPct = useMemo(() => {
    const base = totalPrevSessions || 1
    return Math.round(((totalSessions - totalPrevSessions) / base) * 100)
  }, [totalSessions, totalPrevSessions])

  const deviceColors = ['#8B5CF6', '#22C55E', '#F59E0B']

  const getDeviceBadgeColor = (device: string) => {
    switch (device) {
      case 'mobile': return 'bg-green-100 text-green-800'
      case 'desktop': return 'bg-blue-100 text-blue-800'
      case 'tablet': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getCountryBadgeColor = (country: string) => {
    const colors = ['bg-red-100 text-red-800', 'bg-yellow-100 text-yellow-800', 'bg-indigo-100 text-indigo-800', 'bg-pink-100 text-pink-800', 'bg-teal-100 text-teal-800']
    return colors[country.charCodeAt(0) % colors.length]
  }

  const getTags = (item: any) => {
    const tags = []
    if (item.ctr > 7) tags.push({ text: 'High CTR', color: 'bg-green-100 text-green-800' })
    if (item.position <= 3) tags.push({ text: 'Top 3', color: 'bg-blue-100 text-blue-800' })
    if (item.impressions > 2000) tags.push({ text: 'High Volume', color: 'bg-purple-100 text-purple-800' })
    if (item.query.includes('2024')) tags.push({ text: 'Trending', color: 'bg-orange-100 text-orange-800' })
    return tags
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="space-y-6 p-6">
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
                <BarChart3 className="h-8 w-8 text-purple-600" />
                Google Analytics & Search Console
              </h1>
              <p className="text-muted-foreground text-lg">
                Comprehensive web analytics and search performance insights
              </p>
            </div>
          </div>
        
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="border-purple-200 hover:bg-purple-50 hover:text-purple-700">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Summary Cards (SC summary live) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Impressions</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{scSummary ? scSummary.impressions.toLocaleString() : '—'}</div>
              <p className="text-xs text-muted-foreground">Last {gaRange === '7d' ? '7' : gaRange === '90d' ? '90' : '28'} days</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Clicks</CardTitle>
              <MousePointer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{scSummary ? scSummary.clicks.toLocaleString() : '—'}</div>
              <p className="text-xs text-muted-foreground">Last {gaRange === '7d' ? '7' : gaRange === '90d' ? '90' : '28'} days</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average CTR</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{scSummary ? (scSummary.ctr * 100).toFixed(2) + '%' : '—'}</div>
              <p className="text-xs text-muted-foreground">Average CTR</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Position</CardTitle>
              <Search className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{scSummary ? scSummary.position.toFixed(1) : '—'}</div>
              <p className="text-xs text-muted-foreground">Average rank</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for GA (charts) and Search Console (table) */}
        <Tabs defaultValue="ga" className="space-y-4">
          <TabsList>
            <TabsTrigger value="ga">Google Analytics</TabsTrigger>
            <TabsTrigger value="sc">Search Console</TabsTrigger>
          </TabsList>

          {/* Google Analytics Charts */}
          <TabsContent value="ga" className="space-y-6">
            {/* GA Summary Tiles */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600">{gaSummary ? gaSummary.activeUsers.toLocaleString() : '—'}</div>
                  <p className="text-xs text-muted-foreground">Last {gaRange === '7d' ? '7' : gaRange === '90d' ? '90' : '28'} days</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">New Users</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600">{gaSummary ? gaSummary.newUsers.toLocaleString() : '—'}</div>
                  <p className="text-xs text-muted-foreground">Last {gaRange === '7d' ? '7' : gaRange === '90d' ? '90' : '28'} days</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Engagement Time</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600">
                    {gaSummary ? `${Math.floor(gaSummary.averageEngagementTime / 60)}m ${Math.round(gaSummary.averageEngagementTime % 60)}s` : '—'}
                  </div>
                  <p className="text-xs text-muted-foreground">Per user/session (GA4)</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Event Count</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600">{gaSummary ? gaSummary.eventCount.toLocaleString() : '—'}</div>
                  <p className="text-xs text-muted-foreground">Last {gaRange === '7d' ? '7' : gaRange === '90d' ? '90' : '28'} days</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Traffic Overview</CardTitle>
                  <CardDescription>
                    {gaMetric === 'sessions' ? 'Sessions' : 'New Users'} — current vs previous period
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={gaRange} onValueChange={setGaRange}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7d">Last 7 days</SelectItem>
                      <SelectItem value="30d">Last 30 days</SelectItem>
                      <SelectItem value="90d">Last 90 days</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={gaMetric} onValueChange={(v) => setGaMetric(v as 'sessions' | 'newUsers')}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sessions">Sessions</SelectItem>
                      <SelectItem value="newUsers">New Users</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent style={{ height: 360 }}>
                {error && (
                  <div className="mb-2 text-sm text-red-600">{error}</div>
                )}
                {loading && (
                  <div className="mb-2 text-sm text-muted-foreground">Loading Google Analytics…</div>
                )}
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ left: 10, right: 10, top: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="current" name="Current" stroke="#8B5CF6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="previous" name="Previous" stroke="#06B6D4" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Top Pages by Views</CardTitle>
                  <CardDescription>Most visited pages</CardDescription>
                </CardHeader>
                <CardContent style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pageViewsData} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="page" type="category" width={220} />
                      <Tooltip />
                      <Bar dataKey="views" fill="#8B5CF6" radius={[4, 4, 4, 4]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Device Breakdown</CardTitle>
                  <CardDescription>Sessions share by device</CardDescription>
                </CardHeader>
                <CardContent style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={deviceData} dataKey="value" nameKey="name" outerRadius={100} label>
                        {deviceData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={deviceColors[index % deviceColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Search Console Table (existing) */}
          <TabsContent value="sc">
            {/* Search Console Data */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Search Console Data</CardTitle>
                  <CardDescription>Keywords, impressions, clicks, and search performance</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{scRows.length} Keywords</Badge>
                  <Button variant="outline" size="sm">
                    <Filter className="h-4 w-4 mr-2" />
                    Advanced Filters
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Filters */}
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <Input
                        placeholder="Search keywords or pages..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="border-purple-200 focus:border-purple-400"
                      />
                    </div>
                    <Select value={deviceFilter} onValueChange={setDeviceFilter}>
                      <SelectTrigger className="w-48 border-purple-200">
                        <SelectValue placeholder="Filter by device" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Devices</SelectItem>
                        <SelectItem value="mobile">Mobile</SelectItem>
                        <SelectItem value="desktop">Desktop</SelectItem>
                        <SelectItem value="tablet">Tablet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {scError && (
                    <div className="text-sm text-red-600">{scError}</div>
                  )}
                  {scLoading && (
                    <div className="text-sm text-muted-foreground">Loading Search Console…</div>
                  )}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Query</TableHead>
                        <TableHead>Page</TableHead>
                        <TableHead>Clicks</TableHead>
                        <TableHead>Impressions</TableHead>
                        <TableHead>CTR</TableHead>
                        <TableHead>Position</TableHead>
                        <TableHead>Device</TableHead>
                        <TableHead>Country</TableHead>
                        <TableHead>Tags</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scRows.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium max-w-xs">
                            <div className="truncate" title={item.query}>
                              {item.query}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <div className="truncate text-blue-600 hover:text-blue-800" title={item.page}>
                              {item.page}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold text-green-600">{item.clicks}</span>
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold text-blue-600">{item.impressions.toLocaleString()}</span>
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold text-purple-600">{item.ctr.toFixed(2)}%</span>
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold text-orange-600">{item.position.toFixed(1)}</span>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${getDeviceBadgeColor(item.device)} border-0`}>
                              {item.device}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${getCountryBadgeColor(item.country)} border-0`}>
                              {item.country}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {getTags(item).map((tag, tagIndex) => (
                                <Badge key={tagIndex} className={`${tag.color} border-0 text-xs`}>
                                  {tag.text}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <TrendingUp className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination (no total available from SC API) */}
                  <div className="flex items-center justify-between pt-4 border-t border-purple-200">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        Showing {((currentPage - 1) * itemsPerPage) + 1} to {((currentPage - 1) * itemsPerPage) + scRows.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(Number(value))}>
                        <SelectTrigger className="w-20 border-purple-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                          <SelectItem value="200">200</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                          disabled={currentPage === 1}
                          className="border-purple-200"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm px-2">Page {currentPage}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(currentPage + 1)}
                          disabled={scRows.length < itemsPerPage}
                          className="border-purple-200"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
