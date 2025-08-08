import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

async function getScClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  })
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
  if (!siteUrl) {
    return NextResponse.json({ error: 'SC_SITE env var is required (e.g., sc-domain:tradezone.sg or https://tradezone.sg/)' }, { status: 400 })
  }
  const { searchParams } = new URL(req.url)
  const debug = (searchParams.get('debug') || '') === '1'
  const { startDate, endDate } = getDateRange(searchParams.get('days') || undefined)

  try {
    const sc = await getScClient()
    const makeQuery = (s: string) => sc.searchanalytics.query({
      siteUrl: s,
      requestBody: { startDate, endDate, rowLimit: 1 },
    })

    let res
    let usedSite = siteUrl
    try {
      res = await makeQuery(siteUrl)
    } catch (e: any) {
      const msg = e?.response?.data || e?.message || ''
      const isForbidden = e?.response?.status === 403 || String(msg).includes('insufficient permission')
      // Fallback: try alternate form
      if (isForbidden) {
        const alt = siteUrl.startsWith('sc-domain:')
          ? `https://${siteUrl.replace('sc-domain:', '')}/`
          : siteUrl.startsWith('http')
            ? `sc-domain:${siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
            : ''
        if (alt) {
          try {
            res = await makeQuery(alt)
            usedSite = alt
          } catch (e2) {
            throw e
          }
        } else {
          throw e
        }
      } else {
        throw e
      }
    }

    const row = res.data.rows?.[0]
    const data = {
      clicks: row?.clicks || 0,
      impressions: row?.impressions || 0,
      ctr: row?.ctr || 0,
      position: row?.position || 0,
      range: { startDate, endDate },
    }

    return NextResponse.json({ data, siteUsed: usedSite, timestamp: new Date().toISOString() })
  } catch (err: any) {
    console.error('SC summary error:', err?.response?.data || err?.message || err)
    if (debug) {
      const hint = 'Ensure the service account has Full access to this Search Console property. If using a Domain property, prefer SC_SITE=sc-domain:<domain>. If using a URL property, use the exact canonical URL with trailing slash.'
      return NextResponse.json({ error: 'SC summary failed', siteUrl, range: { startDate, endDate }, details: err?.response?.data || { message: err?.message || String(err) }, hint }, { status: err?.response?.status || 500 })
    }
    return NextResponse.json({ error: 'Failed to fetch Search Console summary' }, { status: 500 })
  }
}
