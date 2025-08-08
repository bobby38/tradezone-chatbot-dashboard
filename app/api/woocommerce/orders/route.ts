import { NextRequest, NextResponse } from 'next/server'
import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api'

function getWoo() {
  const url = process.env.WC_SITE
  const key = process.env.WC_KEY
  const secret = process.env.WC_SECRET
  if (!url || !key || !secret) {
    throw new Error('WC_SITE, WC_KEY, and WC_SECRET are required')
  }
  return new WooCommerceRestApi({ url, consumerKey: key, consumerSecret: secret, version: 'wc/v3' })
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const perPage = Math.min(parseInt(searchParams.get('per_page') || '100', 10) || 100, 100)
    const status = searchParams.get('status') || undefined // e.g., completed, processing
    const wc = getWoo()

    // Fetch last 100 orders (sorted by date desc)
    const params: Record<string, any> = {
      per_page: perPage,
      orderby: 'date',
      order: 'desc',
    }
    if (status) params.status = status

    const resp = await wc.get('orders', params)

    const orders = (resp.data || []).map((o: any) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      currency: o.currency,
      total: parseFloat(o.total || '0'),
      subtotal: parseFloat(o.total || '0') - parseFloat(o.total_tax || '0') - parseFloat(o.shipping_total || '0'),
      total_tax: parseFloat(o.total_tax || '0'),
      shipping_total: parseFloat(o.shipping_total || '0'),
      discount_total: parseFloat(o.discount_total || '0'),
      payment_method: o.payment_method,
      payment_method_title: o.payment_method_title,
      shipping_lines: (o.shipping_lines || []).map((sl: any) => ({ method_title: sl.method_title, total: parseFloat(sl.total || '0') })),
      line_items: (o.line_items || []).map((li: any) => ({ product_id: li.product_id, name: li.name, quantity: li.quantity, total: parseFloat(li.total || '0') })),
      billing: { 
        first_name: o.billing?.first_name, last_name: o.billing?.last_name, email: o.billing?.email,
        phone: o.billing?.phone, address_1: o.billing?.address_1, address_2: o.billing?.address_2, city: o.billing?.city, state: o.billing?.state, postcode: o.billing?.postcode, country: o.billing?.country
      },
      shipping: {
        first_name: o.shipping?.first_name, last_name: o.shipping?.last_name,
        address_1: o.shipping?.address_1, address_2: o.shipping?.address_2, city: o.shipping?.city, state: o.shipping?.state, postcode: o.shipping?.postcode, country: o.shipping?.country
      },
      coupons: (o.coupon_lines || []).map((c: any) => ({ code: c.code, discount: parseFloat(c.discount || '0') })),
      fees: (o.fee_lines || []).map((f: any) => ({ name: f.name, total: parseFloat(f.total || '0') })),
      refunds: (o.refunds || []).map((r: any) => ({ id: r.id, total: parseFloat(r.total || '0') })),
      customer_note: o.customer_note,
      transaction_id: o.transaction_id,
      date_created: o.date_created,
      date_paid: o.date_paid,
      date_completed: o.date_completed,
      link_admin: `${process.env.WC_SITE?.replace(/\/$/, '')}/wp-admin/post.php?post=${o.id}&action=edit`,
    }))

    return NextResponse.json({ data: orders, count: orders.length, timestamp: new Date().toISOString() })
  } catch (e: any) {
    console.error('Woo orders error:', e?.message || e)
    return NextResponse.json({ error: e?.message || 'Failed to fetch orders' }, { status: 500 })
  }
}
