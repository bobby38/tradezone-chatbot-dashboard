import { NextRequest, NextResponse } from 'next/server'
import { BetaAnalyticsDataClient } from '@google-analytics/data'
import fs from 'fs'

export const dynamic = 'force-dynamic'

function parseServiceAccountFromEnv(): any | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!raw) return null
  try {
    if (raw.trim().startsWith('{')) return JSON.parse(raw)
    const decoded = Buffer.from(raw, 'base64').toString('utf8')
    return JSON.parse(decoded)
  } catch (e) {
    console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY:', e)
    return null
  }
}

function getGaClient() {
  const credentials = parseServiceAccountFromEnv()
  if (credentials) {
    return new BetaAnalyticsDataClient({ credentials })
  }
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (credPath && fs.existsSync(credPath)) {
    try {
      const fileJson = JSON.parse(fs.readFileSync(credPath, 'utf8'))
      return new BetaAnalyticsDataClient({ credentials: fileJson })
    } catch (e) {
      console.error('Failed to read GOOGLE_APPLICATION_CREDENTIALS file:', e)
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

    const client = getGaClient()
    const { searchParams } = new URL(req.url)
    const debug = (searchParams.get('debug') || '') === '1'
    const daysParam = parseInt(searchParams.get('days') || '28', 10)
    const days = [7, 28, 90].includes(daysParam) ? daysParam : 28

    // Use yesterday as end to avoid partial today
    const today = new Date()
    const endDateObj = new Date(today)
    endDateObj.setDate(endDateObj.getDate() - 1)
    const startDateObj = new Date(endDateObj)
    startDateObj.setDate(startDateObj.getDate() - (days - 1))
    const format = (d: Date) => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    const startDate = format(startDateObj)
    const endDate = format(endDateObj)

    let response
    try {
      ;[response] = await client.runReport({
        property: `properties/${propertyId}`,
        dimensions: [{ name: 'deviceCategory' }],
        metrics: [{ name: 'sessions' }],
        dateRanges: [{ startDate, endDate }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 3,
      })
    } catch (err: any) {
      console.error('GA top-devices runReport error:', err?.response?.data || err?.message || err)
      if (debug) {
        return NextResponse.json({
          error: 'GA runReport failed',
          property: propertyId,
          dateRange: { startDate, endDate },
          details: err?.response?.data || { message: err?.message || String(err) },
        }, { status: err?.response?.status || 500 })
      }
      return NextResponse.json({ error: 'Failed to fetch GA top devices' }, { status: 500 })
    }

    const rows = (response.rows || []).map(r => ({
      name: r.dimensionValues?.[0]?.value || 'unknown',
      value: Number(r.metricValues?.[0]?.value || 0),
    }))

    // Convert to percentages if possible
    const total = rows.reduce((s, x) => s + x.value, 0) || 1
    const pct = rows.map(r => ({ name: r.name, value: Math.round((r.value / total) * 100) }))

    return NextResponse.json({ data: pct, timestamp: new Date().toISOString() })
  } catch (error: any) {
    console.error('GA top-devices error:', error?.response?.data || error?.message || error)
    // If debug flag is present, return detailed error for faster troubleshooting
    try {
      const reqUrl = req?.url || ''
      const { searchParams } = reqUrl ? new URL(reqUrl) : { searchParams: new URLSearchParams() }
      const debug = (searchParams.get('debug') || '') === '1'
      if (debug) {
        return NextResponse.json({
          error: 'GA top-devices failed',
          property: process.env.GA_PROPERTY,
          details: error?.response?.data || { message: error?.message || String(error) },
        }, { status: error?.response?.status || 500 })
      }
    } catch {}
    return NextResponse.json({ error: 'Failed to fetch GA top devices' }, { status: 500 })
  }
}
