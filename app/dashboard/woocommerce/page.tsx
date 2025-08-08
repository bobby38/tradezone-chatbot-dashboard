"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { WooCommerceDashboard } from "@/components/woocommerce-dashboard"
import { TrendingUp, Package, ShoppingCart, CalendarDays } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"

export default function WooCommercePage() {
  const [period, setPeriod] = useState<string>("7d")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [productPageSize, setProductPageSize] = useState<number>(10)
  const [productPage, setProductPage] = useState<number>(1)
  const [salesPageSize, setSalesPageSize] = useState<number>(10)
  const [salesPage, setSalesPage] = useState<number>(1)
  const [orders, setOrders] = useState<any[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)

  // Demo data for best product and last sale panels (replace with API data when available)
  const bestProduct = useMemo(() => ({
    id: 101,
    name: "Wireless Noise-Canceling Headphones",
    price: 199.0,
    total_sales: 128,
    stock_quantity: 42,
  }), [])

  const lastSale = useMemo(() => ({
    id: 9876,
    customer: "John Tan",
    total: 129.9,
    status: "processing",
    items: 3,
    time: new Date().toLocaleString(),
  }), [])

  const recentSales = useMemo(() => ([
    { id: 9876, customer: "John Tan", items: 3, total: 129.9, status: "processing", time: "10:21" },
    { id: 9875, customer: "Aisha Lim", items: 1, total: 59.0, status: "completed", time: "09:55" },
    { id: 9874, customer: "Michael Lee", items: 2, total: 88.5, status: "completed", time: "09:12" },
    { id: 9873, customer: "Nurul Rahman", items: 4, total: 210.0, status: "processing", time: "08:47" },
  ]), [])

  // Load last 100 orders (live) with optional status filter
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setOrdersLoading(true)
        setOrdersError(null)
        const qs = new URLSearchParams({ per_page: '100' })
        if (statusFilter !== 'all') qs.set('status', statusFilter)
        const res = await fetch(`/api/woocommerce/orders?${qs.toString()}`)
        if (!res.ok) throw new Error(`Woo orders ${res.status}`)
        const json = await res.json()
        if (!cancelled) setOrders(json?.data || [])
      } catch (e: any) {
        if (!cancelled) setOrdersError(e?.message || String(e))
        if (!cancelled) setOrders([])
      } finally {
        if (!cancelled) setOrdersLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [statusFilter]);

  // Derived metrics
  const totals = useMemo(() => {
    const orders = recentSales.length
    const revenue = recentSales.reduce((s, r) => s + r.total, 0)
    const aov = orders ? revenue / orders : 0
    const completed = recentSales.filter(r => r.status === 'completed').length
    const processing = recentSales.filter(r => r.status === 'processing').length
    const pending = recentSales.filter(r => r.status === 'pending').length
    const completionRate = orders ? (completed / orders) * 100 : 0
    return { orders, revenue, aov, completed, processing, pending, completionRate }
  }, [recentSales]);

  const topProducts = useMemo(() => ([
    { id: 101, name: "Wireless Headphones", price: 199.0, total_sales: 128, stock_quantity: 42 },
    { id: 102, name: "Mechanical Keyboard", price: 129.0, total_sales: 96, stock_quantity: 18 },
    { id: 103, name: "4K Webcam", price: 89.0, total_sales: 84, stock_quantity: 33 },
    { id: 104, name: "USB-C Hub", price: 49.0, total_sales: 72, stock_quantity: 51 },
    { id: 105, name: "Ergo Mouse", price: 69.0, total_sales: 58, stock_quantity: 12 },
    { id: 106, name: "Laptop Stand", price: 39.0, total_sales: 41, stock_quantity: 22 },
    { id: 107, name: "Portable SSD", price: 129.0, total_sales: 67, stock_quantity: 15 },
  ]), [])

  const filteredProducts = topProducts.filter(p =>
    (search === "" || p.name.toLowerCase().includes(search.toLowerCase()))
  )

  const productsTotalPages = Math.max(1, Math.ceil(filteredProducts.length / productPageSize))
  const paginatedProducts = filteredProducts.slice((productPage - 1) * productPageSize, productPage * productPageSize)

  const filteredSales = useMemo(() => {
    const base = orders.length ? orders : recentSales
    if (statusFilter === "all") return base
    return base.filter((s: any) => s.status === statusFilter)
  }, [orders, recentSales, statusFilter])

  const salesTotalPages = Math.max(1, Math.ceil(filteredSales.length / salesPageSize))
  const paginatedSales = filteredSales.slice((salesPage - 1) * salesPageSize, salesPage * salesPageSize)

  const salesTrend = useMemo(() => {
    const days = period === "90d" ? 90 : period === "30d" ? 30 : period === "7d" ? 7 : 1
    return Array.from({ length: days }).map((_, i) => ({
      day: `D${i + 1}`,
      revenue: Math.round(200 + Math.random() * 800),
      orders: Math.round(1 + Math.random() * 20),
    }))
  }, [period]);

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
            WooCommerce Analytics
          </h1>
          <p className="text-muted-foreground">Live WooCommerce sales and product data</p>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Pick a date range
          </Button>
        </div>
      </div>

      {/* Tabs: Overview / Products / Sales */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Store Overview</CardTitle>
              <CardDescription>Key metrics and product performance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Summary Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Revenue</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-purple-600">S${totals.revenue.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground">Last {period}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Orders</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-purple-600">{totals.orders}</div>
                    <div className="text-xs text-muted-foreground">Last {period}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Avg Order Value</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-purple-600">S${totals.aov.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground">AOV</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Completion Rate</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-purple-600">{totals.completionRate.toFixed(1)}%</div>
                    <div className="text-xs text-muted-foreground">Completed / All</div>
                  </CardContent>
                </Card>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={salesTrend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="currentColor" className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 12 }} stroke="currentColor" className="text-muted-foreground" />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                    <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="url(#rev)" name="Revenue" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Orders by Status */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Orders by Status</CardTitle>
                    <CardDescription>Distribution of recent orders</CardDescription>
                  </CardHeader>
                  <CardContent className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={[
                        { status: 'Completed', value: totals.completed },
                        { status: 'Processing', value: totals.processing },
                        { status: 'Pending', value: totals.pending },
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="status" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Area type="monotone" dataKey="value" stroke="#8B5CF6" fill="rgba(139,92,246,0.25)" name="Orders" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Inventory Snapshot</CardTitle>
                    <CardDescription>Top products stock vs sales</CardDescription>
                  </CardHeader>
                  <CardContent className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={topProducts.map(p => ({ name: p.name, sold: p.total_sales, stock: p.stock_quantity }))}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="name" hide />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Area type="monotone" dataKey="sold" stroke="#22C55E" fill="rgba(34,197,94,0.25)" name="Sold" />
                        <Area type="monotone" dataKey="stock" stroke="#F59E0B" fill="rgba(245,158,11,0.25)" name="Stock" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
              <WooCommerceDashboard />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products">
          {/* Best Product & Top Products Table */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" />Best Product</CardTitle>
                <CardDescription>Top performer in the selected period</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-semibold">{bestProduct.name}</div>
                    <div className="text-sm text-muted-foreground">S${bestProduct.price.toFixed(2)} • Stock {bestProduct.stock_quantity}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-green-600">{bestProduct.total_sales}</div>
                    <div className="text-xs text-muted-foreground">units sold</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Top Products</CardTitle>
                  <CardDescription>Best sellers by total sales</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Search products..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setProductPage(1) }}
                    className="w-48"
                  />
                  <Select value={String(productPageSize)} onValueChange={(v) => { setProductPageSize(Number(v)); setProductPage(1) }}>
                    <SelectTrigger className="w-28"><SelectValue placeholder="Rows" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Sold</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedProducts.map((p, idx) => (
                      <TableRow key={p.id}>
                        <TableCell>{(productPage - 1) * productPageSize + idx + 1}</TableCell>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right">S${p.price.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{p.total_sales}</TableCell>
                        <TableCell className="text-right">{p.stock_quantity}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                  <div>Page {productPage} / {productsTotalPages}</div>
                  <div className="space-x-2">
                    <Button size="sm" variant="outline" onClick={() => setProductPage(p => Math.max(1, p - 1))} disabled={productPage === 1}>Prev</Button>
                    <Button size="sm" variant="default" onClick={() => setProductPage(p => Math.min(productsTotalPages, p + 1))} disabled={productPage === productsTotalPages}>Next</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="sales">
          {/* Last Sale (compact) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" />Last Sale</CardTitle>
              <CardDescription>Most recent order and status</CardDescription>
            </CardHeader>
            <CardContent className="py-2">
              {ordersLoading && <div className="text-sm text-muted-foreground">Loading last sale…</div>}
              {(!ordersLoading) && (
                (() => {
                  const o = (orders && orders[0]) || null
                  if (!o) {
                    return (
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm text-muted-foreground">No recent orders</div>
                        </div>
                      </div>
                    )
                  }
                  const itemsCount = Array.isArray(o.line_items) ? o.line_items.reduce((n: number, li: any) => n + (li.quantity || 0), 0) : 0
                  const customer = o.billing?.first_name ? `${o.billing.first_name} ${o.billing.last_name || ''}` : '—'
                  return (
                    <div className="flex items-center justify-between">
                      <div className="truncate">
                        <div className="text-lg font-semibold truncate">Order #{o.number || o.id}</div>
                        <div className="text-sm text-muted-foreground truncate">{customer} • {itemsCount} items • {(o.date_created || '').toString().replace('T',' ').slice(0,16)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold">S${Number(o.total || 0).toFixed(2)}</div>
                        <Badge variant={o.status === 'completed' ? 'secondary' : 'default'} className={o.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                          {o.status}
                        </Badge>
                      </div>
                    </div>
                  )
                })()
              )}
            </CardContent>
          </Card>

          {/* Recent Sales - full width with filters */}
          <Card className="mt-6">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Recent Sales</CardTitle>
                  <CardDescription>Latest orders and status</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setSalesPage(1) }}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={String(salesPageSize)} onValueChange={(v) => { setSalesPageSize(Number(v)); setSalesPage(1) }}>
                    <SelectTrigger className="w-28"><SelectValue placeholder="Rows" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {ordersError && (
                  <div className="mb-2 text-sm text-red-600">{ordersError}</div>
                )}
                {ordersLoading && (
                  <div className="mb-2 text-sm text-muted-foreground">Loading orders…</div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Shipping</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="text-right">Tax</TableHead>
                      <TableHead className="text-right">Shipping</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                      <TableHead className="text-right">Date</TableHead>
                      <TableHead className="text-right">Link</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedSales.map((s: any) => (
                      <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedOrder(s)}>
                        <TableCell>#{s.number || s.id}</TableCell>
                        <TableCell>{s.billing?.first_name ? `${s.billing.first_name} ${s.billing.last_name || ''}` : (s.customer || '—')}</TableCell>
                        <TableCell>{s.payment_method_title || s.payment_method || '—'}</TableCell>
                        <TableCell>{(s.shipping_lines && s.shipping_lines[0]?.method_title) ? s.shipping_lines[0].method_title : '—'}</TableCell>
                        <TableCell className="text-right">{s.line_items ? s.line_items.reduce((n: number, li: any) => n + (li.quantity || 0), 0) : (s.items || 0)}</TableCell>
                        <TableCell className="text-right">S${(s.subtotal ?? s.total)?.toFixed ? (s.subtotal ?? s.total).toFixed(2) : Number(s.subtotal ?? s.total).toFixed(2)}</TableCell>
                        <TableCell className="text-right">S${Number(s.total_tax || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right">S${Number(s.shipping_total || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right">S${Number(s.total || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={s.status === 'completed' ? 'secondary' : 'default'} className={s.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                            {s.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{(s.date_created || s.time || '').toString().replace('T', ' ').slice(0, 16)}</TableCell>
                        <TableCell className="text-right">
                          {s.link_admin ? (
                            <a href={s.link_admin} target="_blank" rel="noreferrer" className="text-purple-600 hover:underline" onClick={(e) => e.stopPropagation()}>Open</a>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                  <div>Page {salesPage} / {salesTotalPages}</div>
                  <div className="space-x-2">
                    <Button size="sm" variant="outline" onClick={() => setSalesPage(p => Math.max(1, p - 1))} disabled={salesPage === 1}>Prev</Button>
                    <Button size="sm" variant="default" onClick={() => setSalesPage(p => Math.min(salesTotalPages, p + 1))} disabled={salesPage === salesTotalPages}>Next</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Order details modal */}
            {selectedOrder && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedOrder(null)}>
                <div className="w-full max-w-3xl bg-card text-card-foreground rounded-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
                  <div className="p-4 border-b flex items-center justify-between">
                    <div className="font-semibold">Order #{selectedOrder.number || selectedOrder.id}</div>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedOrder(null)}>Close</Button>
                  </div>
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-auto">
                    <div>
                      <div className="text-sm font-medium mb-2">Customer</div>
                      <div className="text-sm text-muted-foreground">
                        {(selectedOrder.billing?.first_name || '') + ' ' + (selectedOrder.billing?.last_name || '')}<br/>
                        {selectedOrder.billing?.email || '—'}<br/>
                        {selectedOrder.billing?.phone || '—'}
                      </div>
                      <div className="text-sm font-medium mt-4 mb-2">Billing Address</div>
                      <div className="text-sm text-muted-foreground">
                        {[selectedOrder.billing?.address_1, selectedOrder.billing?.address_2, selectedOrder.billing?.city, selectedOrder.billing?.state, selectedOrder.billing?.postcode, selectedOrder.billing?.country].filter(Boolean).join(', ') || '—'}
                      </div>
                      <div className="text-sm font-medium mt-4 mb-2">Shipping Address</div>
                      <div className="text-sm text-muted-foreground">
                        {[selectedOrder.shipping?.address_1, selectedOrder.shipping?.address_2, selectedOrder.shipping?.city, selectedOrder.shipping?.state, selectedOrder.shipping?.postcode, selectedOrder.shipping?.country].filter(Boolean).join(', ') || '—'}
                      </div>
                      <div className="text-sm font-medium mt-4 mb-2">Payment</div>
                      <div className="text-sm text-muted-foreground">{selectedOrder.payment_method_title || selectedOrder.payment_method || '—'}</div>
                      <div className="text-sm font-medium mt-4 mb-2">Shipping</div>
                      <div className="text-sm text-muted-foreground">{selectedOrder.shipping_lines?.[0]?.method_title || '—'}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium mb-2">Totals</div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div className="flex justify-between"><span>Subtotal</span><span>S${Number(selectedOrder.subtotal ?? selectedOrder.total).toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>Tax</span><span>S${Number(selectedOrder.total_tax || 0).toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>Shipping</span><span>S${Number(selectedOrder.shipping_total || 0).toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>Discount</span><span>- S${Number(selectedOrder.discount_total || 0).toFixed(2)}</span></div>
                        <div className="flex justify-between font-semibold"><span>Total</span><span>S${Number(selectedOrder.total || 0).toFixed(2)}</span></div>
                      </div>
                      <div className="text-sm font-medium mt-4 mb-2">Items</div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        {(selectedOrder.line_items || []).map((li: any, idx: number) => (
                          <div key={idx} className="flex justify-between">
                            <span className="truncate mr-2">{li.name} × {li.quantity}</span>
                            <span>S${Number(li.total || 0).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                      {!!(selectedOrder.coupons || []).length && (
                        <div className="text-sm font-medium mt-4 mb-2">Coupons</div>
                      )}
                      {(selectedOrder.coupons || []).map((c: any, i: number) => (
                        <div key={i} className="text-sm text-muted-foreground flex justify-between">
                          <span>{c.code}</span><span>- S${Number(c.discount || 0).toFixed(2)}</span>
                        </div>
                      ))}
                      {!!(selectedOrder.fees || []).length && (
                        <div className="text-sm font-medium mt-4 mb-2">Fees</div>
                      )}
                      {(selectedOrder.fees || []).map((f: any, i: number) => (
                        <div key={i} className="text-sm text-muted-foreground flex justify-between">
                          <span>{f.name}</span><span>S${Number(f.total || 0).toFixed(2)}</span>
                        </div>
                      ))}
                      {!!(selectedOrder.refunds || []).length && (
                        <div className="text-sm font-medium mt-4 mb-2">Refunds</div>
                      )}
                      {(selectedOrder.refunds || []).map((r: any, i: number) => (
                        <div key={i} className="text-sm text-muted-foreground flex justify-between">
                          <span>Refund #{r.id}</span><span>- S${Number(r.total || 0).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="p-4 border-t flex items-center justify-between text-sm text-muted-foreground">
                    <div>
                      <span className="mr-3">Created: {(selectedOrder.date_created || '').toString().replace('T',' ').slice(0,16)}</span>
                      {selectedOrder.date_paid && <span className="mr-3">Paid: {selectedOrder.date_paid.toString().replace('T',' ').slice(0,16)}</span>}
                      {selectedOrder.date_completed && <span>Completed: {selectedOrder.date_completed.toString().replace('T',' ').slice(0,16)}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      {selectedOrder.link_admin && <a className="text-purple-600 hover:underline" href={selectedOrder.link_admin} target="_blank" rel="noreferrer">Open in WP Admin</a>}
                      <Button size="sm" variant="default" onClick={() => setSelectedOrder(null)}>Done</Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
      </Tabs>

      {/* (Legacy sections replaced by Tabs above) */}
    </div>
  );
}
