"use client"

import { useMemo, useState } from "react"
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
    if (statusFilter === "all") return recentSales
    return recentSales.filter((s) => s.status === statusFilter)
  }, [recentSales, statusFilter])

  const salesTotalPages = Math.max(1, Math.ceil(filteredSales.length / salesPageSize))
  const paginatedSales = filteredSales.slice((salesPage - 1) * salesPageSize, salesPage * salesPageSize)

  const salesTrend = useMemo(() => {
    const days = period === "90d" ? 90 : period === "30d" ? 30 : period === "7d" ? 7 : 1
    return Array.from({ length: days }).map((_, i) => ({
      day: `D${i + 1}`,
      revenue: Math.round(200 + Math.random() * 800),
      orders: Math.round(1 + Math.random() * 20),
    }))
  }, [period])

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
          {/* Last Sale & Sales Table with filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" />Last Sale</CardTitle>
                <CardDescription>Most recent order and status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-semibold">Order #{lastSale.id}</div>
                    <div className="text-sm text-muted-foreground">{lastSale.customer} • {lastSale.items} items • {lastSale.time}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">S${lastSale.total.toFixed(2)}</div>
                    <Badge variant={lastSale.status === 'completed' ? 'secondary' : 'default'} className={lastSale.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                      {lastSale.status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                      <TableHead className="text-right">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedSales.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>#{s.id}</TableCell>
                        <TableCell>{s.customer}</TableCell>
                        <TableCell className="text-right">{s.items}</TableCell>
                        <TableCell className="text-right">S${s.total.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={s.status === 'completed' ? 'secondary' : 'default'} className={s.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                            {s.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{s.time}</TableCell>
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
          </div>
        </TabsContent>
      </Tabs>

      {/* (Legacy sections replaced by Tabs above) */}
    </div>
  )
}
