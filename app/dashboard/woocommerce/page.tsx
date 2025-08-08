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

export default function WooCommercePage() {
  const [period, setPeriod] = useState<string>("7d")
  const [search, setSearch] = useState("")

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
  ]), [])

  const filteredProducts = topProducts.filter(p =>
    search === "" || p.name.toLowerCase().includes(search.toLowerCase())
  )

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

      {/* Overview Cards + Re-usable Dashboard Widget */}
      <Card>
        <CardHeader>
          <CardTitle>Store Overview</CardTitle>
          <CardDescription>Key metrics and product performance</CardDescription>
        </CardHeader>
        <CardContent>
          <WooCommerceDashboard />
        </CardContent>
      </Card>

      {/* Best Product & Last Sale */}
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
      </div>

      {/* Products & Sales Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Top Products</CardTitle>
              <CardDescription>Best sellers by total sales</CardDescription>
            </div>
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48"
            />
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
                {filteredProducts.map((p, idx) => (
                  <TableRow key={p.id}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right">S${p.price.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{p.total_sales}</TableCell>
                    <TableCell className="text-right">{p.stock_quantity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Sales</CardTitle>
            <CardDescription>Latest orders and status</CardDescription>
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
                {recentSales.map((s) => (
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
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
