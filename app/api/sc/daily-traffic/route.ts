import { NextRequest, NextResponse } from 'next/server'
import { GoogleAuth } from 'google-auth-library'

function fmt(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const daysParam = parseInt(searchParams.get('days') || '28', 10)
    const days = [7, 28, 90].includes(daysParam) ? daysParam : 28
    const debug = (searchParams.get('debug') || '').toString() === '1'
    const site = (searchParams.get('site') || process.env.SEARCH_CONSOLE_SITE || '').trim()
    if (!site) {
      return NextResponse.json({ error: 'SEARCH_CONSOLE_SITE env or ?site is required (e.g. sc-domain:tradezone.sg or https://tradezone.sg/)' }, { status: 400 })
    }

    // Build dates, ending yesterday
    const now = new Date()
    const end = new Date(now)
    end.setDate(end.getDate() - 1)
    const start = new Date(end)
    start.setDate(start.getDate() - (days - 1))

    const prevEnd = new Date(start)
    prevEnd.setDate(prevEnd.getDate() - 1)
    const prevStart = new Date(prevEnd)
    prevStart.setDate(prevStart.getDate() - (days - 1))

    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    })
    const client = await auth.getClient()

    async function queryRange(startDate: Date, endDate: Date) {
      const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`
      const body = {
        startDate: fmt(startDate),
        endDate: fmt(endDate),
        dimensions: ['date'],
        rowLimit: 5000,
      }
      const res = await client.request<{ rows?: Array<{ keys: string[]; clicks: number; impressions: number }> }>({
        url,
        method: 'POST',
        data: body,
      })
      return res.data.rows || []
    }

    let currRows, prevRows
    try {
      ;[currRows, prevRows] = await Promise.all([
        queryRange(start, end),
        queryRange(prevStart, prevEnd),
      ])
    } catch (err: any) {
      console.error('SC daily-traffic Google API error:', err?.response?.data || err?.message || err)
      if (debug) {
        return NextResponse.json({
          error: 'Search Console API error',
          site,
          days,
          request: {
            current: { start: fmt(start), end: fmt(end) },
            previous: { start: fmt(prevStart), end: fmt(prevEnd) },
          },
          details: err?.response?.data || { message: err?.message || String(err) },
        }, { status: err?.response?.status || 500 })
      }
      return NextResponse.json({ error: 'Failed to fetch Search Console daily traffic' }, { status: 500 })
    }

    const currMap: Record<string, { clicks: number; impressions: number }> = {}
    for (const r of currRows) {
      const date = r.keys?.[0] || '' // YYYY-MM-DD
      currMap[date.replace(/-/g, '')] = { clicks: r.clicks || 0, impressions: r.impressions || 0 }
    }
    const prevMap: Record<string, { clicks: number; impressions: number }> = {}
    for (const r of prevRows) {
      const date = r.keys?.[0] || ''
      prevMap[date.replace(/-/g, '')] = { clicks: r.clicks || 0, impressions: r.impressions || 0 }
    }

    const series: { date: string; clicks: number; impressions: number; prevClicks: number; prevImpressions: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end)
      d.setDate(d.getDate() - i)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      const key = `${y}${m}${dd}`
      const mmdd = `${m}-${dd}`
      const c = currMap[key] || { clicks: 0, impressions: 0 }
      series.push({ date: mmdd, clicks: c.clicks, impressions: c.impressions, prevClicks: 0, prevImpressions: 0 })
    }
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(start)
      d.setDate(d.getDate() - 1 - i)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      const key = `${y}${m}${dd}`
      const mmdd = `${m}-${dd}`
      const p = prevMap[key] || { clicks: 0, impressions: 0 }
      const idx = series.findIndex(s => s.date === mmdd)
      if (idx >= 0) {
        series[idx].prevClicks = p.clicks
        series[idx].prevImpressions = p.impressions
      }
    }

    return NextResponse.json({ site, days, data: series, timestamp: new Date().toISOString() })
  } catch (e: any) {
    console.error('SC daily-traffic error:', e?.message || e)
    return NextResponse.json({ error: 'Failed to fetch Search Console daily traffic' }, { status: 500 })
  }
}
