import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

// WooCommerce API will be initialized inside the function

interface WooCommerceOrder {
  id: number
  status: string
  total: string
  date_created: string
  line_items: Array<{
    product_id: number
    name: string
    quantity: number
    total: string
  }>
}

interface WooCommerceProduct {
  id: number
  name: string
  total_sales: string
  price: string
  stock_quantity: number
}

// GET - Fetch WooCommerce data and store in Supabase
export async function GET(request: NextRequest) {
  try {
    console.log('Starting WooCommerce data fetch...')

    // Initialize WooCommerce API inside the function
    const WooCommerce = new WooCommerceRestApi({
      url: process.env.WC_SITE!,
      consumerKey: process.env.WC_KEY!,
      consumerSecret: process.env.WC_SECRET!,
      version: 'wc/v3'
    })

    console.log('WooCommerce API initialized with URL:', process.env.WC_SITE)

    // Get today's date for filtering orders
    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const todayISO = todayStart.toISOString()

    // Fetch today's orders
    console.log('Fetching orders from:', todayISO)
    const ordersResponse = await WooCommerce.get('orders', {
      after: todayISO,
      per_page: 100
    })

    const orders: WooCommerceOrder[] = ordersResponse.data

    // Count orders by status
    const orderStats = {
      total: orders.length,
      completed: orders.filter(o => o.status === 'completed').length,
      processing: orders.filter(o => o.status === 'processing').length,
      pending: orders.filter(o => o.status === 'pending').length
    }

    // Calculate total sales for today
    const totalSales = orders
      .filter(o => o.status === 'completed')
      .reduce((sum, order) => sum + parseFloat(order.total || '0'), 0)

    console.log('Order stats:', orderStats)
    console.log('Total sales today:', totalSales)

    // Fetch top products by popularity
    const productsResponse = await WooCommerce.get('products', {
      orderby: 'popularity',
      per_page: 5,
      status: 'publish'
    })

    const products: WooCommerceProduct[] = productsResponse.data

    // Format top products data
    const topProducts = products.map(product => ({
      id: product.id,
      name: product.name,
      total_sales: parseInt(product.total_sales || '0'),
      price: parseFloat(product.price || '0'),
      stock_quantity: product.stock_quantity || 0
    }))

    console.log('Top products:', topProducts)

    // Store snapshot in Supabase
    const { data: snapshot, error: snapshotError } = await supabase
      .from('wc_snapshots')
      .insert({
        orders_today: orderStats.total,
        orders_completed: orderStats.completed,
        orders_processing: orderStats.processing,
        orders_pending: orderStats.pending,
        total_sales: totalSales,
        top_products: topProducts
      })
      .select()
      .single()

    if (snapshotError) {
      console.error('Error storing snapshot:', snapshotError)
      throw snapshotError
    }

    console.log('Snapshot stored successfully:', snapshot.id)

    return NextResponse.json({
      success: true,
      message: 'WooCommerce data fetched and stored successfully',
      data: {
        snapshot_id: snapshot.id,
        orders: orderStats,
        total_sales: totalSales,
        top_products: topProducts,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('WooCommerce API error:', error)
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch WooCommerce data',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

// POST - Manual trigger for data fetch (useful for testing)
export async function POST(request: NextRequest) {
  return GET(request)
}
