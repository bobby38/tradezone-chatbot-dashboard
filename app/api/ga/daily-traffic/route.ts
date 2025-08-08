import { NextRequest, NextResponse } from 'next/server'
import { BetaAnalyticsDataClient } from '@google-analytics/data'
import fs from 'fs'
import { GoogleAuth } from 'google-auth-library'

function parseServiceAccountFromEnv(): { creds: any | null, parseOk: boolean, rawStartsWith?: string } {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!raw) return { creds: null, parseOk: false }
  let val = raw.trim()
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1)
  }
  const rawStartsWith = val.slice(0, 1)
  try {
    if (val.startsWith('{')) {
      const parsed = JSON.parse(val)
      return { creds: parsed, parseOk: true, rawStartsWith }
    }
  } catch {}
  try {
    const decoded = Buffer.from(val, 'base64').toString('utf8')
    const parsed = JSON.parse(decoded)
    return { creds: parsed, parseOk: true, rawStartsWith }
  } catch (e) {
    console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY:', e)
    return { creds: null, parseOk: false, rawStartsWith }
  }
}

function getGaClient() {
  const parsed = parseServiceAccountFromEnv()
  if (parsed.creds) {
    const auth = new GoogleAuth({
      credentials: parsed.creds,
      scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    })
    return new BetaAnalyticsDataClient({ auth })
  }
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (credPath && fs.existsSync(credPath)) {
    try {
      const fileJson = JSON.parse(fs.readFileSync(credPath, 'utf8'))
      const auth = new GoogleAuth({
        credentials: fileJson,
        scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
      })
      return new BetaAnalyticsDataClient({ auth })
    } catch (e) {
      console.error('Failed to read GOOGLE_APPLICATION_CREDENTIALS file:', e)
    }
  }
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/analytics.readonly'] })
  return new BetaAnalyticsDataClient({ auth })
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
      return NextResponse.json({ error: 'GA_PROPERTY env var is required' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
    }

    const client = getGaClient()

    const { searchParams } = new URL(req.url)
    const daysParam = parseInt(searchParams.get('days') || '28', 10)
    const days = [7, 28, 90].includes(daysParam) ? daysParam : 28
    const metric = (searchParams.get('metric') || 'newUsers').trim()
    const metricName = metric === 'sessions' ? 'sessions' : 'newUsers'
    const debug = (searchParams.get('debug') || '').toString() === '1'

    // date windows: use yesterday as end for current window
    const today = new Date()
    const endCurrentDate = new Date(today)
    endCurrentDate.setDate(endCurrentDate.getDate() - 1)
    const startCurrentDate = new Date(endCurrentDate)
    startCurrentDate.setDate(startCurrentDate.getDate() - (days - 1))

    const startCurrent = formatDate(startCurrentDate)
    const endCurrent = formatDate(endCurrentDate)

    // previous window immediately before current window
    const endPrevDate = new Date(startCurrentDate)
    endPrevDate.setDate(endPrevDate.getDate() - 1)
    const startPrevDate = new Date(endPrevDate)
    startPrevDate.setDate(startPrevDate.getDate() - (days - 1))

    const startPrev = formatDate(startPrevDate)
    const endPrev = formatDate(endPrevDate)

    try {
      // Current window
      const [respCurrent] = await client.runReport({
        property: `properties/${propertyId}`,
        dimensions: [{ name: 'date' }],
        metrics: [{ name: metricName }],
        dateRanges: [{ startDate: startCurrent, endDate: endCurrent }],
        limit: days,
      })

      // Previous window
      const [respPrev] = await client.runReport({
        property: `properties/${propertyId}`,
        dimensions: [{ name: 'date' }],
        metrics: [{ name: metricName }],
        dateRanges: [{ startDate: startPrev, endDate: endPrev }],
        limit: days,
      })

      const toMap = (rows: any[] | undefined) => {
        const m: Record<string, number> = {}
        for (const r of rows || []) {
          const yyyymmdd = r.dimensionValues?.[0]?.value || ''
          const val = Number(r.metricValues?.[0]?.value || 0)
          // Convert YYYYMMDD -> MM-DD for the UI
          const mm = yyyymmdd.slice(4, 6)
          const dd = yyyymmdd.slice(6, 8)
          const label = `${mm}-${dd}`
          m[label] = val
        }
        return m
      }

      const currMap = toMap(respCurrent.rows)
      const prevMap = toMap(respPrev.rows)

      // Build aligned series across current window
      const series: { date: string; current: number; previous: number }[] = []
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(endCurrentDate)
        d.setDate(d.getDate() - i)
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        const label = `${mm}-${dd}`
        series.push({
          date: label,
          current: currMap[label] || 0,
          previous: prevMap[label] || 0, // aligned by month-day
        })
      }

      const headers = debug
        ? { 'Cache-Control': 'no-store' }
        : { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' }

      return NextResponse.json({ data: series, metric: metricName, days, range: { startDate: startCurrent, endDate: endCurrent }, timestamp: new Date().toISOString() }, { headers })
    } catch (err: any) {
      console.error('GA daily-traffic error:', err?.response?.data || err?.message || err)
      if (debug) {
        const hasServiceAccountEnv = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY
        const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
        const credPathExists = !!(credPath && fs.existsSync(credPath))
        const parsed = parseServiceAccountFromEnv()
        return NextResponse.json({
          error: 'GA runReport failed',
          property: propertyId,
          dateRange: { startDate: startCurrent, endDate: endCurrent },
          authDiagnostics: {
            hasServiceAccountEnv,
            credPath,
            credPathExists,
            modeHint: hasServiceAccountEnv ? 'env_json' : (credPathExists ? 'file' : 'adc'),
            parseOk: parsed.parseOk,
            rawStartsWith: parsed.rawStartsWith,
          },
          details: err?.response?.data || { message: err?.message || String(err) },
        }, { status: err?.response?.status || 500, headers: { 'Cache-Control': 'no-store' } })
      }
      return NextResponse.json({ error: 'Failed to fetch GA daily traffic' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
    }
  } catch (error: any) {
    console.error('GA daily-traffic error:', error?.response?.data || error?.message || error)
    try {
      const reqUrl = req?.url || ''
      const { searchParams } = reqUrl ? new URL(reqUrl) : { searchParams: new URLSearchParams() }
      const debug = (searchParams.get('debug') || '').toString() === '1'
      if (debug) {
        const hasServiceAccountEnv = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY
        const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
        const credPathExists = !!(credPath && fs.existsSync(credPath))
        const parsed = parseServiceAccountFromEnv()
        return NextResponse.json({
          error: 'GA daily-traffic failed',
          property: process.env.GA_PROPERTY,
          authDiagnostics: {
            hasServiceAccountEnv,
            credPath,
            credPathExists,
            modeHint: hasServiceAccountEnv ? 'env_json' : (credPathExists ? 'file' : 'adc'),
            parseOk: parsed.parseOk,
            rawStartsWith: parsed.rawStartsWith,
          },
          details: error?.response?.data || { message: error?.message || String(error) },
        }, { status: error?.response?.status || 500, headers: { 'Cache-Control': 'no-store' } })
      }
    } catch {}
    return NextResponse.json({ error: 'Failed to fetch GA daily traffic' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
