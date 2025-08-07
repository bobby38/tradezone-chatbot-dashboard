'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { BigNumber } from '@/components/ui/big-number'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ShoppingCart, Package, DollarSign, Clock, TrendingUp } from 'lucide-react'

interface WooCommerceSnapshot {
  id: number
  ts: string
  orders_today: number
  orders_completed: number
  orders_processing: number
  orders_pending: number
  total_sales: number
  top_products: Array<{
    id: number
    name: string
    total_sales: number
    price: number
    stock_quantity: number
  }>
}

export function WooCommerceDashboard() {
  const [snapshot, setSnapshot] = useState<WooCommerceSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<string>('')

  useEffect(() => {
    fetchLatestSnapshot()
    // Set up real-time subscription for updates
    const subscription = supabase
      .channel('wc_snapshots')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'wc_snapshots' },
        () => fetchLatestSnapshot()
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const fetchLatestSnapshot = async () => {
    try {
      const { data, error } = await supabase
        .from('wc_snapshots')
        .select('*')
        .order('ts', { ascending: false })
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      setSnapshot(data)
      if (data) {
        setLastUpdated(new Date(data.ts).toLocaleString())
      }
    } catch (error) {
      console.error('Error fetching WooCommerce snapshot:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 bg-muted animate-pulse rounded-lg"></div>
        ))}
      </div>
    )
  }

  if (!snapshot) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>WooCommerce Data</CardTitle>
          <CardDescription>
            No WooCommerce data available. Make sure the API is configured and data is being fetched.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <BigNumber
          label="Orders Today"
          value={snapshot.orders_today}
          description={`Last updated: ${lastUpdated}`}
          icon={ShoppingCart}
          format="number"
        />
        <BigNumber
          label="Total Sales"
          value={snapshot.total_sales}
          description="Today's revenue"
          icon={DollarSign}
          format="currency"
        />
        <BigNumber
          label="Completed Orders"
          value={snapshot.orders_completed}
          description={`${snapshot.orders_processing} processing`}
          icon={Package}
          format="number"
        />
        <BigNumber
          label="Pending Orders"
          value={snapshot.orders_pending}
          description="Awaiting payment"
          icon={Clock}
          format="number"
        />
      </div>

      {/* Top Products */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <TrendingUp className="h-5 w-5" />
            <span>Top 5 Products</span>
          </CardTitle>
          <CardDescription>
            Most popular products by total sales
          </CardDescription>
        </CardHeader>
        <CardContent>
          {snapshot.top_products && snapshot.top_products.length > 0 ? (
            <div className="space-y-4">
              {snapshot.top_products.map((product, index) => (
                <div key={product.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Badge variant="secondary" className="w-8 h-8 rounded-full flex items-center justify-center">
                      {index + 1}
                    </Badge>
                    <div>
                      <p className="font-medium text-sm">{product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Stock: {product.stock_quantity || 'N/A'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-sm">
                      S${product.price.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {product.total_sales} sold
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              No product data available
            </p>
          )}
        </CardContent>
      </Card>

      {/* Order Status Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Order Status Breakdown</CardTitle>
          <CardDescription>Today's orders by status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {snapshot.orders_completed}
              </div>
              <div className="text-sm text-muted-foreground">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {snapshot.orders_processing}
              </div>
              <div className="text-sm text-muted-foreground">Processing</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {snapshot.orders_pending}
              </div>
              <div className="text-sm text-muted-foreground">Pending</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
