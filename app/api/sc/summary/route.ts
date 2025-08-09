import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import fs from 'fs'
import { GoogleAuth } from 'google-auth-library'

function parseServiceAccountFromEnv(): { creds: any | null, parseOk: boolean, rawStartsWith?: string } {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!raw) return { creds: null, parseOk: false }
  let val = raw.trim()
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith('\'') && val.endsWith('\''))) {
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
    console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY (SC):', e)
    return { creds: null, parseOk: false, rawStartsWith }
  }
}

function parseOAuthClientFromEnv(): { client: { client_id: string, client_secret: string, redirect_uri: string } | null, parseOk: boolean } {
  const raw = process.env.GOOGLE_OAUTH_CLIENT_KEY
  if (!raw) return { client: null, parseOk: false }
  let val = raw.trim()
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith('\'') && val.endsWith('\''))) {
    val = val.slice(1, -1)
  }
  try {
    let json: any
    try {
      json = JSON.parse(val)
    } catch {
      const decoded = Buffer.from(val, 'base64').toString('utf8')
      json = JSON.parse(decoded)
    }
    const c = json.web || json.installed || json
    const client_id = c.client_id
    const client_secret = c.client_secret
    const redirect_uri = (c.redirect_uris && c.redirect_uris[0]) || c.redirect_uri || 'http://localhost'
    if (!client_id || !client_secret) return { client: null, parseOk: false }
    return { client: { client_id, client_secret, redirect_uri }, parseOk: true }
  } catch {
    return { client: null, parseOk: false }
  }
}

async function getScClient() {
  const scopes = ['https://www.googleapis.com/auth/webmasters.readonly']
  // 1) OAuth client + refresh token
  const oauthEnv = parseOAuthClientFromEnv()
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  if (oauthEnv.parseOk && oauthEnv.client && refreshToken) {
    const o = oauthEnv.client
    const oAuth2Client = new (google as any).auth.OAuth2(o.client_id, o.client_secret, o.redirect_uri)
    oAuth2Client.setCredentials({ refresh_token: refreshToken })
    return google.webmasters({ version: 'v3', auth: oAuth2Client })
  }

  // 2) Service account from env JSON/base64
  const parsed = parseServiceAccountFromEnv()
  if (parsed.creds) {
    const auth = new GoogleAuth({ credentials: parsed.creds, scopes })
    const authClient = await auth.getClient()
    return google.webmasters({ version: 'v3', auth: authClient })
  }

  // 3) Service account from file path
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (credPath && fs.existsSync(credPath)) {
    try {
      const fileJson = JSON.parse(fs.readFileSync(credPath, 'utf8'))
      const auth = new GoogleAuth({ credentials: fileJson, scopes })
      const authClient = await auth.getClient()
      return google.webmasters({ version: 'v3', auth: authClient })
    } catch (e) {
      console.error('Failed to read GOOGLE_APPLICATION_CREDENTIALS for SC:', e)
    }
  }

  // 4) ADC fallback
  const auth = new GoogleAuth({ scopes })
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
      const hasServiceAccountEnv = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY
      const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
      const credPathExists = !!(credPath && fs.existsSync(credPath))
      const parsed = parseServiceAccountFromEnv()
      const hasOAuthClientEnv = !!process.env.GOOGLE_OAUTH_CLIENT_KEY
      const hasOAuthRefresh = !!process.env.GOOGLE_OAUTH_REFRESH_TOKEN
      const oauthParsed = parseOAuthClientFromEnv()
      const hint = 'Ensure the service account has Full access to this Search Console property. If using a Domain property, prefer SC_SITE=sc-domain:<domain>. If using a URL property, use the exact canonical URL with trailing slash.'
      return NextResponse.json({
        error: 'SC summary failed',
        siteUrl,
        range: { startDate, endDate },
        authDiagnostics: {
          hasServiceAccountEnv,
          credPath,
          credPathExists,
          hasOAuthClientEnv,
          hasOAuthRefresh,
          oauthParseOk: oauthParsed.parseOk,
          modeHint: (hasOAuthClientEnv && hasOAuthRefresh && oauthParsed.parseOk)
            ? 'oauth'
            : (hasServiceAccountEnv ? 'env_json' : (credPathExists ? 'file' : 'adc')),
          parseOk: parsed.parseOk,
          rawStartsWith: parsed.rawStartsWith,
        },
        details: err?.response?.data || { message: err?.message || String(err) },
        hint,
      }, { status: err?.response?.status || 500 })
    }
    return NextResponse.json({ error: 'Failed to fetch Search Console summary' }, { status: 500 })
  }
}
