#!/usr/bin/env node
/*
Fetch Google Search Console data via OAuth (preferred) or Service Account (fallback) and upsert into Supabase.

Env required:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY   // service role for upsert via PostgREST

Auth options (choose ONE):
  OAuth (recommended):
    GOOGLE_OAUTH_CLIENT_KEY     // OAuth client JSON (raw or base64). Supports {web} or {installed}
    GOOGLE_OAUTH_REFRESH_TOKEN  // Refresh token you generated

  Service Account (must be granted access to the SC property):
    GOOGLE_SERVICE_ACCOUNT_KEY  // Service account JSON (raw or base64). Must include client_email and private_key

Optional:
  SC_SITE                     // default site, e.g. https://tradezone.sg/

Usage examples:
  node scripts/fetch-sc-to-supabase.js --site https://tradezone.sg/ --range 28
  node scripts/fetch-sc-to-supabase.js --site https://tradezone.sg/ --start 2025-07-01 --end 2025-07-31

Creates/Upserts into tables (create them via migration provided):
  - gsc_daily_summary (by date)
  - gsc_performance   (date x page x query x country x device)
*/

const { google } = require('googleapis')
const fs = require('fs')

function parseArgs(argv) {
  const out = {}
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--site') out.site = argv[++i]
    else if (a === '--range') out.range = parseInt(argv[++i], 10)
    else if (a === '--start') out.start = argv[++i]
    else if (a === '--end') out.end = argv[++i]
    else if (a === '--dry') out.dry = true
  }
  return out
}

function parseOAuthClient(jsonOrB64) {
  let raw
  try {
    raw = JSON.parse(jsonOrB64)
  } catch {
    raw = JSON.parse(Buffer.from(jsonOrB64, 'base64').toString('utf8'))
  }
  const c = raw.web || raw.installed || raw
  if (!c.client_id || !c.client_secret) {
    throw new Error('Invalid GOOGLE_OAUTH_CLIENT_KEY: missing client_id/client_secret')
  }
  const redirect = (c.redirect_uris && c.redirect_uris[0]) || 'http://localhost'
  return { clientId: c.client_id, clientSecret: c.client_secret, redirect }
}

async function getScClient() {
  const key = process.env.GOOGLE_OAUTH_CLIENT_KEY
  const refresh = process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  if (key && refresh) {
    const { clientId, clientSecret, redirect } = parseOAuthClient(key)
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirect)
    oauth2.setCredentials({ refresh_token: refresh })
    return google.webmasters({ version: 'v3', auth: oauth2 })
  }

  const saKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (saKey) {
    let sa
    try {
      // Try parsing as JSON first
      sa = JSON.parse(saKey)
    } catch (e) {
      try {
        // If that fails, try decoding from base64
        sa = JSON.parse(Buffer.from(saKey, 'base64').toString('utf8'))
      } catch (e2) {
        console.error('Failed to parse service account key:', e2.message)
        throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_KEY format: must be valid JSON or base64 encoded JSON')
      }
    }
    if (!sa.client_email || !sa.private_key) {
      throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_KEY: missing client_email/private_key')
    }
    console.log(`Using service account: ${sa.client_email}`)
    
    // Create auth client with explicit key
    const jwt = new google.auth.JWT({
      email: sa.client_email,
      key: sa.private_key,
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly']
    })
    
    try {
      await jwt.authorize()
      return google.webmasters({ version: 'v3', auth: jwt })
    } catch (authErr) {
      console.error('JWT authorization failed:', authErr)
      throw new Error(`Service account auth failed: ${authErr.message}`)
    }
  }

  throw new Error('Set OAuth creds (GOOGLE_OAUTH_CLIENT_KEY + GOOGLE_OAUTH_REFRESH_TOKEN) or GOOGLE_SERVICE_ACCOUNT_KEY')
}

function fmtDate(d) {
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function rangeFromArgs({ range, start, end }) {
  if (start && end) return { startDate: start, endDate: end }
  const days = Number.isFinite(range) ? Math.max(1, range) : 28
  const endD = new Date()
  const startD = new Date()
  startD.setDate(endD.getDate() - days + 1)
  return { startDate: fmtDate(startD), endDate: fmtDate(endD) }
}

async function queryWithPaging(sc, siteUrl, dims, startDate, endDate, rowLimit = 25000) {
  let startRow = 0
  const all = []
  for (;;) {
    const res = await sc.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: dims,
        rowLimit,
        startRow,
      },
    })
    const rows = res.data.rows || []
    all.push(...rows)
    if (rows.length < rowLimit) break
    startRow += rowLimit
  }
  return all
}

async function supabaseUpsert(table, rows, pkConflictColumns) {
  if (!rows.length) return { inserted: 0 }
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  // PostgREST bulk upsert
  const res = await fetch(`${url}/rest/v1/${table}?on_conflict=${encodeURIComponent(pkConflictColumns.join(','))}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Prefer': 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase upsert failed (${res.status}): ${text}`)
  }
  const data = await res.json()
  return { inserted: data.length }
}

function toDailySummaryRows(rows, site) {
  // When querying with dimension ['date'], each row has keys: [date]
  return rows.map(r => ({
    site,
    date: r.keys?.[0] || null,
    clicks: r.clicks || 0,
    impressions: r.impressions || 0,
    ctr: Number(r.ctr ?? 0),
    position: Number(r.position ?? 0),
  })).filter(r => r.date)
}

function toPerformanceRows(rows, site) {
  // dims: ['date','page','query','country','device'] in this order
  return rows.map(r => {
    const [date, page, query, country, device] = r.keys || []
    return {
      site,
      date,
      page: page || null,
      query: query || null,
      country: country || null,
      device: device || null,
      clicks: r.clicks || 0,
      impressions: r.impressions || 0,
      ctr: Number(r.ctr ?? 0),
      position: Number(r.position ?? 0),
    }
  }).filter(r => r.date)
}

async function main() {
  const args = parseArgs(process.argv)
  const site = args.site || process.env.SC_SITE
  if (!site) throw new Error('Provide --site or set SC_SITE')
  const { startDate, endDate } = rangeFromArgs(args)

  const sc = await getScClient()
  console.log(`[GSC] Fetching ${site} ${startDate}..${endDate}`)

  // 1) Daily summary (dimension: date)
  const dailyRows = await queryWithPaging(sc, site, ['date'], startDate, endDate)
  const daily = toDailySummaryRows(dailyRows, site)
  console.log(`[GSC] Daily rows: ${daily.length}`)

  // 2) Detailed performance (date, page, query, country, device)
  const perfRows = await queryWithPaging(sc, site, ['date','page','query','country','device'], startDate, endDate)
  const perf = toPerformanceRows(perfRows, site)
  console.log(`[GSC] Performance rows: ${perf.length}`)

  if (args.dry) {
    console.log('[DRY RUN] Skipping Supabase upsert')
    return
  }

  // Upsert to Supabase
  const dailyRes = await supabaseUpsert('gsc_daily_summary', daily, ['site','date'])
  console.log(`[Supabase] gsc_daily_summary upserted ${dailyRes.inserted}`)

  // Primary key across date+page+query+country+device
  const perfRes = await supabaseUpsert('gsc_performance', perf, ['site','date','page','query','country','device'])
  console.log(`[Supabase] gsc_performance upserted ${perfRes.inserted}`)

  console.log('[Done]')
}

// Node 18+ has global fetch. If not available, require('node-fetch')
if (typeof fetch === 'undefined') {
  global.fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args))
}

main().catch(err => {
  console.error('[Error]', err?.response?.data || err?.message || err)
  process.exit(1)
})
