// scripts/get-sc-refresh-token.js
// Node 18+
// Usage:
//   1) export GOOGLE_OAUTH_CLIENT_KEY='...full OAuth client JSON OR base64...'
//   2) node scripts/get-sc-refresh-token.js
//   3) Open the printed URL, approve, PASTE ONLY the code value (not "code=...&scope=...")
//   4) Copy the refresh token from output and set GOOGLE_OAUTH_REFRESH_TOKEN

import readline from 'node:readline'
import { google } from 'googleapis'

function parseClient() {
  const raw = process.env.GOOGLE_OAUTH_CLIENT_KEY
  if (!raw) throw new Error('GOOGLE_OAUTH_CLIENT_KEY is required')
  let val = raw.trim()
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith('\'') && val.endsWith('\''))) {
    val = val.slice(1, -1)
  }
  let json
  try {
    json = JSON.parse(val)
  } catch {
    const decoded = Buffer.from(val, 'base64').toString('utf8')
    json = JSON.parse(decoded)
  }
  const c = json.web || json.installed || json
  const client_id = c.client_id
  const client_secret = c.client_secret
  // Prefer localhost for simple flow
  const redirect_uri = (c.redirect_uris && c.redirect_uris.includes('http://localhost'))
    ? 'http://localhost'
    : ((c.redirect_uris && c.redirect_uris[0]) || c.redirect_uri || 'http://localhost')
  if (!client_id || !client_secret) throw new Error('Invalid OAuth client JSON: missing client_id/client_secret')
  return { client_id, client_secret, redirect_uri }
}

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans.trim()) }))
}

async function main() {
  const { client_id, client_secret, redirect_uri } = parseClient()
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri)

  const scopes = ['https://www.googleapis.com/auth/webmasters.readonly']
  const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: scopes })

  console.log('\nOpen this URL in your browser, approve, then paste the code value below (ONLY the code string, not the entire query):\n')
  console.log(authUrl + '\n')

  const code = await prompt('Code: ')
  // If user pasted full "code=...&scope=...", try to extract the code value.
  const codeValue = code.includes('code=') ? (new URLSearchParams(code).get('code') || code) : code

  const { tokens } = await oAuth2Client.getToken(codeValue)
  if (!tokens.refresh_token) {
    console.error('\nNo refresh_token received. Ensure access_type=offline & prompt=consent and that you used a redirect URI allowed by the client (ideally http://localhost).')
    console.log('Tokens:', tokens)
    process.exit(1)
  }
  console.log('\nYour GOOGLE_OAUTH_REFRESH_TOKEN:\n')
  console.log(tokens.refresh_token)
  console.log('\nSet this value as GOOGLE_OAUTH_REFRESH_TOKEN in your environment and redeploy.\n')
}

main().catch((e) => { console.error(e); process.exit(1) })
