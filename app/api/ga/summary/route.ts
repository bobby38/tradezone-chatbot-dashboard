import { NextRequest, NextResponse } from 'next/server'
import { BetaAnalyticsDataClient } from '@google-analytics/data'

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
    if (!propertyId) {
      return NextResponse.json({ error: 'GA_PROPERTY env var is required' }, { status: 400 })
    }

    const { searchParams } = new URL(req.url)
    const debug = (searchParams.get('debug') || '') === '1'
    const daysParam = parseInt(searchParams.get('days') || '28', 10)
    const days = [7, 28, 90].includes(daysParam) ? daysParam : 28

    const today = new Date()
    const endDateObj = new Date(today)
    endDateObj.setDate(endDateObj.getDate() - 1)
    const startDateObj = new Date(endDateObj)
    startDateObj.setDate(startDateObj.getDate() - (days - 1))
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const startDate = fmt(startDateObj)
    const endDate = fmt(endDateObj)

    const client = getGaClient()

    try {
      const [response] = await client.runReport({
        property: `properties/${propertyId}`,
        metrics: [
          // Use a safe subset of GA4 metrics to avoid INVALID_ARGUMENT
          { name: 'activeUsers' },
          { name: 'newUsers' },
          { name: 'sessions' },
          { name: 'eventCount' },
        ],
        dimensions: [ { name: 'date' } ],
        dateRanges: [{ startDate, endDate }],
        // Request totals so we don't rely on per-day rows
        metricAggregations: ['TOTAL'],
        limit: 1,
      })

      // Prefer totals to avoid dependence on specific row structures
      const totals = response.totals?.[0]?.metricValues || []
      const mv = totals.length ? totals : (response.rows?.[0]?.metricValues || [])
      const data = {
        activeUsers: Number(mv[0]?.value || 0),
        newUsers: Number(mv[1]?.value || 0),
        sessions: Number(mv[2]?.value || 0),
        eventCount: Number(mv[3]?.value || 0),
        range: { startDate, endDate },
      }
      return NextResponse.json({ data, timestamp: new Date().toISOString() })
    } catch (err: any) {
      console.error('GA summary runReport error:', err?.response?.data || err?.message || err)
      if (debug) {
        return NextResponse.json({
          error: 'GA runReport failed',
          property: propertyId,
          dateRange: { startDate, endDate },
          details: err?.response?.data || { message: err?.message || String(err) },
        }, { status: err?.response?.status || 500 })
      }
      return NextResponse.json({ error: 'Failed to fetch GA summary' }, { status: 500 })
    }
  } catch (error: any) {
    console.error('GA summary error:', error?.response?.data || error?.message || error)
    try {
      const reqUrl = req?.url || ''
      const { searchParams } = reqUrl ? new URL(reqUrl) : { searchParams: new URLSearchParams() }
      const debug = (searchParams.get('debug') || '') === '1'
      if (debug) {
        return NextResponse.json({
          error: 'GA summary failed',
          property: process.env.GA_PROPERTY,
          details: error?.response?.data || { message: error?.message || String(error) },
        }, { status: error?.response?.status || 500 })
      }
    } catch {}
    return NextResponse.json({ error: 'Failed to fetch GA summary' }, { status: 500 })
  }
}
