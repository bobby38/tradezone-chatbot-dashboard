"use client"

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Search, TrendingUp, Users, Eye, MousePointer, Filter, Download, ExternalLink, BarChart3, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
  const [searchQuery, setSearchQuery] = useState('')
  const [deviceFilter, setDeviceFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)
  const [gaRange, setGaRange] = useState('30d')
  const [gaMetric, setGaMetric] = useState('sessions')

  // Comprehensive Search Console data with 24 keyword records
  const searchConsoleData = [
    { query: 'best wireless headphones 2024', page: '/products/wireless-headphones', impressions: 3420, clicks: 245, ctr: 7.16, position: 2.3, device: 'mobile', country: 'US' },
    { query: 'gaming keyboard mechanical', page: '/products/gaming-keyboards', impressions: 2890, clicks: 189, ctr: 6.54, position: 3.1, device: 'desktop', country: 'CA' },
    { query: 'bluetooth speaker portable', page: '/products/bluetooth-speakers', impressions: 2156, clicks: 167, ctr: 7.75, position: 1.8, device: 'mobile', country: 'UK' },
    { query: 'laptop stand ergonomic', page: '/products/laptop-accessories', impressions: 1890, clicks: 134, ctr: 7.09, position: 2.7, device: 'desktop', country: 'AU' },
    { query: 'wireless mouse gaming', page: '/products/gaming-mice', impressions: 1654, clicks: 98, ctr: 5.92, position: 4.2, device: 'desktop', country: 'US' },
    { query: 'usb c hub multiport', page: '/products/usb-hubs', impressions: 1423, clicks: 87, ctr: 6.11, position: 3.8, device: 'mobile', country: 'DE' },
    { query: 'phone case protective', page: '/products/phone-cases', impressions: 1298, clicks: 76, ctr: 5.85, position: 5.1, device: 'mobile', country: 'US' },
    { query: 'webcam 4k streaming', page: '/products/webcams', impressions: 1156, clicks: 89, ctr: 7.70, position: 2.1, device: 'desktop', country: 'CA' },
    { query: 'monitor arm dual', page: '/products/monitor-arms', impressions: 987, clicks: 67, ctr: 6.79, position: 3.4, device: 'desktop', country: 'UK' },
    { query: 'charging cable fast', page: '/products/charging-cables', impressions: 876, clicks: 54, ctr: 6.16, position: 4.7, device: 'mobile', country: 'AU' },
    { query: 'desk pad large', page: '/products/desk-accessories', impressions: 765, clicks: 43, ctr: 5.62, position: 6.2, device: 'desktop', country: 'US' },
    { query: 'tablet stand adjustable', page: '/products/tablet-accessories', impressions: 654, clicks: 38, ctr: 5.81, position: 5.8, device: 'tablet', country: 'DE' },
    { query: 'power bank 20000mah', page: '/products/power-banks', impressions: 543, clicks: 32, ctr: 5.89, position: 4.9, device: 'mobile', country: 'CA' },
    { query: 'screen protector tempered glass', page: '/products/screen-protectors', impressions: 432, clicks: 26, ctr: 6.02, position: 5.3, device: 'mobile', country: 'UK' },
    { query: 'car mount phone holder', page: '/products/car-accessories', impressions: 321, clicks: 19, ctr: 5.92, position: 6.7, device: 'mobile', country: 'AU' },
    { query: 'hdmi cable 4k', page: '/products/cables', impressions: 298, clicks: 17, ctr: 5.70, position: 7.1, device: 'desktop', country: 'US' },
    { query: 'wireless charger pad', page: '/products/wireless-chargers', impressions: 267, clicks: 15, ctr: 5.62, position: 6.9, device: 'mobile', country: 'DE' },
    { query: 'bluetooth adapter usb', page: '/products/bluetooth-adapters', impressions: 234, clicks: 13, ctr: 5.55, position: 7.8, device: 'desktop', country: 'CA' },
    { query: 'cable organizer desk', page: '/products/cable-management', impressions: 198, clicks: 11, ctr: 5.56, position: 8.2, device: 'desktop', country: 'UK' },
    { query: 'phone grip ring', page: '/products/phone-grips', impressions: 176, clicks: 9, ctr: 5.11, position: 8.7, device: 'mobile', country: 'AU' },
    { query: 'laptop cooling pad', page: '/products/laptop-cooling', impressions: 154, clicks: 8, ctr: 5.19, position: 9.1, device: 'desktop', country: 'US' },
    { query: 'sd card reader usb', page: '/products/card-readers', impressions: 132, clicks: 6, ctr: 4.55, position: 9.8, device: 'desktop', country: 'DE' },
    { query: 'phone tripod mini', page: '/products/phone-tripods', impressions: 109, clicks: 5, ctr: 4.59, position: 10.2, device: 'mobile', country: 'CA' },
    { query: 'cable sleeve braided', page: '/products/cable-sleeves', impressions: 87, clicks: 3, ctr: 3.45, position: 11.5, device: 'desktop', country: 'UK' }
  ]

  // Filter and pagination logic
  const filteredSCData = searchConsoleData.filter(item => {
    const matchesSearch = searchQuery === '' || 
      item.query.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.page.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesDevice = deviceFilter === 'all' || item.device === deviceFilter
    return matchesSearch && matchesDevice
  })

  const paginatedSCData = filteredSCData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const totalPages = Math.ceil(filteredSCData.length / itemsPerPage)

  // Calculate summary metrics
  const totalImpressions = searchConsoleData.reduce((sum, item) => sum + item.impressions, 0)
  const totalClicks = searchConsoleData.reduce((sum, item) => sum + item.clicks, 0)
  const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
  const avgPosition = searchConsoleData.length > 0 ? searchConsoleData.reduce((sum, item) => sum + item.position, 0) / searchConsoleData.length : 0

  // Demo GA datasets for charts
  const trendData = [
    { date: 'Jul 01', sessions: 420, users: 360 },
    { date: 'Jul 02', sessions: 510, users: 410 },
    { date: 'Jul 03', sessions: 480, users: 395 },
    { date: 'Jul 04', sessions: 560, users: 450 },
    { date: 'Jul 05', sessions: 610, users: 500 },
    { date: 'Jul 06', sessions: 580, users: 470 },
    { date: 'Jul 07', sessions: 630, users: 520 },
  ]

  const pageViewsData = [
    { page: '/products/wireless-headphones', views: 980 },
    { page: '/products/gaming-keyboards', views: 820 },
    { page: '/products/bluetooth-speakers', views: 760 },
    { page: '/products/usb-hubs', views: 640 },
    { page: '/blog/best-headphones-2024', views: 610 },
  ]

  const deviceData = [
    { name: 'Mobile', value: 58 },
    { name: 'Desktop', value: 34 },
    { name: 'Tablet', value: 8 },
  ]

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

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Impressions</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{totalImpressions.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">+12.5% from last period</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Clicks</CardTitle>
              <MousePointer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{totalClicks.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">+8.2% from last period</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average CTR</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{avgCTR.toFixed(2)}%</div>
              <p className="text-xs text-muted-foreground">+0.3% from last period</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Position</CardTitle>
              <Search className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{avgPosition.toFixed(1)}</div>
              <p className="text-xs text-muted-foreground">-0.2 from last period</p>
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
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Traffic Overview</CardTitle>
                  <CardDescription>Sessions and users trend</CardDescription>
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
                  <Select value={gaMetric} onValueChange={setGaMetric}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sessions">Sessions</SelectItem>
                      <SelectItem value="users">Users</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ left: 10, right: 10, top: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="sessions" stroke="#8B5CF6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="users" stroke="#06B6D4" strokeWidth={2} dot={false} />
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
                  <Badge variant="secondary">{filteredSCData.length} Keywords</Badge>
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
                      {paginatedSCData.map((item, index) => (
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

                  {/* Pagination */}
                  <div className="flex items-center justify-between pt-4 border-t border-purple-200">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredSCData.length)} of {filteredSCData.length} results
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
                        <span className="text-sm px-2">
                          Page {currentPage} of {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                          disabled={currentPage === totalPages}
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
