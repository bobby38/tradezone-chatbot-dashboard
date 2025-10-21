import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

export const dynamic = 'force-dynamic'

async function getScClient() {
  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/webmasters.readonly'] })
  const authClient = await auth.getClient()
  return google.webmasters({ version: 'v3', auth: authClient })
}

function getDateRange(daysParam?: string) {
  const d = parseInt(daysParam || '28', 10)
  const days = [7, 28, 90].includes(d) ? d : 28
  const today = new Date()
  const end = new Date(today)
  end.setDate(end.getDate() - 1)
  const start = new Date(end)
  start.setDate(start.getDate() - (days - 1))
  const fmt = (x: Date) => x.toISOString().slice(0, 10)
  return { startDate: fmt(start), endDate: fmt(end) }
}

export async function GET(req: NextRequest) {
  const siteUrl = process.env.SC_SITE
  if (!siteUrl) return NextResponse.json({ error: 'SC_SITE env var is required' }, { status: 400 })
  const { searchParams } = new URL(req.url)
  const debug = (searchParams.get('debug') || '') === '1'
  const { startDate, endDate } = getDateRange(searchParams.get('days') || undefined)
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const pageSize = Math.min(200, Math.max(10, parseInt(searchParams.get('pageSize') || '20', 10)))

  try {
    const sc = await getScClient()
    const startRow = (page - 1) * pageSize

    const makeQuery = (s: string) => sc.searchanalytics.query({
      siteUrl: s,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['page'],
        rowLimit: pageSize,
        startRow,
        orderBy: [{ fieldName: 'clicks', sortOrder: 'descending' }],
      },
    })

    let usedSite = siteUrl
    let res
    try { res = await makeQuery(siteUrl) } catch (e: any) {
      const msg = e?.response?.data || e?.message || ''
      const isForbidden = e?.response?.status === 403 || String(msg).includes('insufficient permission')
      if (isForbidden) {
        const alt = siteUrl.startsWith('sc-domain:') ? `https://${siteUrl.replace('sc-domain:', '')}/` : siteUrl.startsWith('http') ? `sc-domain:${siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}` : ''
        if (alt) { try { res = await makeQuery(alt); usedSite = alt } catch { throw e } } else { throw e }
      } else { throw e }
    }

    const rows = (res.data.rows || []).map(r => ({
      page: r.keys?.[0] || '',
      clicks: r.clicks || 0,
      impressions: r.impressions || 0,
      ctr: r.ctr || 0,
      position: r.position || 0,
    }))

    return NextResponse.json({ data: rows, page, pageSize, siteUsed: usedSite, range: { startDate, endDate }, timestamp: new Date().toISOString() })
  } catch (err: any) {
    console.error('SC pages error:', err?.response?.data || err?.message || err)
    if (debug) return NextResponse.json({ error: 'SC pages failed', details: err?.response?.data || { message: err?.message || String(err) } }, { status: err?.response?.status || 500 })
    return NextResponse.json({ error: 'Failed to fetch Search Console pages' }, { status: 500 })
  }
}
