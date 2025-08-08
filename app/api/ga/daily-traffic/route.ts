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

function formatDate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function GET(req: NextRequest) {
  try {
    const propertyId = process.env.GA_PROPERTY
    if (!propertyId) {
      return NextResponse.json({ error: 'GA_PROPERTY env var is required' }, { status: 400 })
    }

    const client = getGaClient()

    const { searchParams } = new URL(req.url)
    const daysParam = parseInt(searchParams.get('days') || '28', 10)
    const days = [7, 28, 90].includes(daysParam) ? daysParam : 28
    const metric = (searchParams.get('metric') || 'newUsers').trim()
    const metricName = metric === 'sessions' ? 'sessions' : 'newUsers'
    const debug = (searchParams.get('debug') || '').toString() === '1'

    // date windows
    // Use yesterday as end to avoid partial "today" depending on timezone
    const today = new Date()
    const endDate = new Date(today)
    endDate.setDate(endDate.getDate() - 1)
    const endCurrent = formatDate(endDate)
    const startCurrentDate = new Date(endDate)
    startCurrentDate.setDate(startCurrentDate.getDate() - (days - 1))
    const startCurrent = formatDate(startCurrentDate)

    const endPrevDate = new Date(startCurrentDate)
    endPrevDate.setDate(endPrevDate.getDate() - 1)
    const endPrev = formatDate(endPrevDate)
    const startPrevDate = new Date(endPrevDate)
    startPrevDate.setDate(startPrevDate.getDate() - (days - 1))
    const startPrev = formatDate(startPrevDate)

    // Run two reports separately for clarity
    let respCurrent
    try {
      ;[respCurrent] = await client.runReport({
        property: `properties/${propertyId}`,
        dimensions: [{ name: 'date' }],
        metrics: [{ name: metricName }],
        dateRanges: [{ startDate: startCurrent, endDate: endCurrent }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      })
    } catch (err: any) {
      console.error('GA daily-traffic current window error:', err?.response?.data || err?.message || err)
      if (debug) {
        return NextResponse.json({
          error: 'GA runReport current window failed',
          property: propertyId,
          metric: metricName,
          dateRange: { start: startCurrent, end: endCurrent },
          details: err?.response?.data || { message: err?.message || String(err) },
        }, { status: err?.response?.status || 500 })
      }
      return NextResponse.json({ error: 'Failed to fetch GA daily traffic' }, { status: 500 })
    }

    let respPrev
    try {
      ;[respPrev] = await client.runReport({
        property: `properties/${propertyId}`,
        dimensions: [{ name: 'date' }],
        metrics: [{ name: metricName }],
        dateRanges: [{ startDate: startPrev, endDate: endPrev }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      })
    } catch (err: any) {
      console.error('GA daily-traffic previous window error:', err?.response?.data || err?.message || err)
      if (debug) {
        return NextResponse.json({
          error: 'GA runReport previous window failed',
          property: propertyId,
          metric: metricName,
          dateRange: { start: startPrev, end: endPrev },
          details: err?.response?.data || { message: err?.message || String(err) },
        }, { status: err?.response?.status || 500 })
      }
      return NextResponse.json({ error: 'Failed to fetch GA daily traffic' }, { status: 500 })
    }

    const currMap: Record<string, number> = {}
    for (const row of respCurrent.rows || []) {
      const dateStr = row.dimensionValues?.[0]?.value || '' // YYYYMMDD
      const val = Number(row.metricValues?.[0]?.value || 0)
      currMap[dateStr] = val
    }
    const prevMap: Record<string, number> = {}
    for (const row of respPrev.rows || []) {
      const dateStr = row.dimensionValues?.[0]?.value || '' // YYYYMMDD
      const val = Number(row.metricValues?.[0]?.value || 0)
      prevMap[dateStr] = val
    }

    // Build aligned series and backfill zeros
    const series: { date: string; current: number; previous: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(endDate)
      d.setDate(d.getDate() - i)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      const yyyymmdd = `${y}${m}${dd}`
      const mmdd = `${m}-${dd}`
      series.push({ date: mmdd, current: currMap[yyyymmdd] || 0, previous: 0 })
    }

    // Previous window: shift by days
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(startCurrentDate)
      d.setDate(d.getDate() - 1 - i) // goes backward into previous window
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      const yyyymmdd = `${y}${m}${dd}`
      const mmdd = `${m}-${dd}`
      const idx = series.findIndex(s => s.date === mmdd)
      if (idx >= 0) series[idx].previous = prevMap[yyyymmdd] || 0
    }

    return NextResponse.json({ data: series, metric: metricName, days, timestamp: new Date().toISOString() })
  } catch (error: any) {
    console.error('GA daily-traffic error:', error?.message || error)
    return NextResponse.json({ error: 'Failed to fetch GA daily traffic' }, { status: 500 })
  }
}
