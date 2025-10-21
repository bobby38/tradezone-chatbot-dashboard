import { NextRequest, NextResponse } from 'next/server'
import { BetaAnalyticsDataClient } from '@google-analytics/data'

export const dynamic = 'force-dynamic'

function getGaClient() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (keyJson) {
    try {
      const credentials = JSON.parse(keyJson)
      return new BetaAnalyticsDataClient({ credentials })
    } catch (e) {
      console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY:', e)
    }
  }
  return new BetaAnalyticsDataClient()
}

export async function GET(req: NextRequest) {
  try {
    const propertyId = process.env.GA_PROPERTY
    if (!propertyId) return NextResponse.json({ error: 'GA_PROPERTY env var is required' }, { status: 400 })

    const { searchParams } = new URL(req.url)
    const daysParam = parseInt(searchParams.get('days') || '28', 10)
    const days = [7, 28, 90].includes(daysParam) ? daysParam : 28
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10) || 10, 50)
    const debug = (searchParams.get('debug') || '') === '1'

    const end = new Date()
    end.setDate(end.getDate() - 1)
    const start = new Date(end)
    start.setDate(start.getDate() - (days - 1))

    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

    const client = getGaClient()

    try {
      const [resp] = await client.runReport({
        property: `properties/${propertyId}`,
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
        dateRanges: [{ startDate: fmt(start), endDate: fmt(end) }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: BigInt(limit),
      })

      const data = (resp.rows || []).map(r => ({
        channel: r.dimensionValues?.[0]?.value || 'Unassigned',
        sessions: Number(r.metricValues?.[0]?.value || 0),
      }))

      return NextResponse.json({ data, days, timestamp: new Date().toISOString() })
    } catch (err: any) {
      console.error('GA top-channels error:', err?.response?.data || err?.message || err)
      if (debug) {
        return NextResponse.json({
          error: 'GA runReport failed',
          property: propertyId,
          details: err?.response?.data || { message: err?.message || String(err) },
        }, { status: err?.response?.status || 500 })
      }
      return NextResponse.json({ error: 'Failed to fetch GA top channels' }, { status: 500 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 })
  }
}
