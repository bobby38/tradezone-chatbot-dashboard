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
  // Fallback to ADC (with scope)
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/analytics.readonly'] })
  return new BetaAnalyticsDataClient({ auth })
}

export async function GET(req: NextRequest) {
  try {
    const propertyId = process.env.GA_PROPERTY
    if (!propertyId) {
      return NextResponse.json({ error: 'GA_PROPERTY env var is required' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
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
          { name: 'activeUsers' },
          { name: 'newUsers' },
          { name: 'sessions' },
          { name: 'eventCount' },
        ],
        dimensions: [ { name: 'date' } ],
        dateRanges: [{ startDate, endDate }],
        metricAggregations: ['TOTAL'],
        limit: 1,
      })

      const totals = response.totals?.[0]?.metricValues || []
      const mv = totals.length ? totals : (response.rows?.[0]?.metricValues || [])
      const data = {
        activeUsers: Number(mv[0]?.value || 0),
        newUsers: Number(mv[1]?.value || 0),
        sessions: Number(mv[2]?.value || 0),
        eventCount: Number(mv[3]?.value || 0),
        range: { startDate, endDate },
      }
      const headers = debug
        ? { 'Cache-Control': 'no-store' }
        : { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' }
      return NextResponse.json({ data, timestamp: new Date().toISOString() }, { headers })
    } catch (err: any) {
      console.error('GA summary runReport error:', err?.response?.data || err?.message || err)
      if (debug) {
        const hasServiceAccountEnv = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY
        const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
        const credPathExists = !!(credPath && fs.existsSync(credPath))
        const parsed = parseServiceAccountFromEnv()
        return NextResponse.json({
          error: 'GA runReport failed',
          property: propertyId,
          dateRange: { startDate, endDate },
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
      return NextResponse.json({ error: 'Failed to fetch GA summary' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
    }
  } catch (error: any) {
    console.error('GA summary error:', error?.response?.data || error?.message || error)
    try {
      const reqUrl = req?.url || ''
      const { searchParams } = reqUrl ? new URL(reqUrl) : { searchParams: new URLSearchParams() }
      const debug = (searchParams.get('debug') || '') === '1'
      if (debug) {
        const hasServiceAccountEnv = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY
        const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
        const credPathExists = !!(credPath && fs.existsSync(credPath))
        const parsed = parseServiceAccountFromEnv()
        return NextResponse.json({
          error: 'GA summary failed',
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
    return NextResponse.json({ error: 'Failed to fetch GA summary' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
