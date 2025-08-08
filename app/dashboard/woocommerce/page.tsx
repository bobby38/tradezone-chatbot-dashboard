"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { WooCommerceDashboard } from "@/components/woocommerce-dashboard"

export default function WooCommercePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
            WooCommerce Analytics
          </h1>
          <p className="text-muted-foreground">Live WooCommerce sales and product data</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Store Overview</CardTitle>
          <CardDescription>Key metrics and product performance</CardDescription>
        </CardHeader>
        <CardContent>
          <WooCommerceDashboard />
        </CardContent>
      </Card>
    </div>
  )
}
