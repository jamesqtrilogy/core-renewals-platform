/**
 * Salesforce REST API client using the Workers-native `fetch` API.
 *
 * Replaces jsforce, which depends on Node's `https.request` — not implemented
 * by `unenv` (the polyfill layer OpenNext uses on Cloudflare Workers).
 */

const SF_LOGIN_URL = 'https://login.salesforce.com'
const SF_API_VERSION = 'v59.0'

interface SfAuth {
  accessToken: string
  instanceUrl: string
  expiresAt: number
}

interface SfTokenResponse {
  access_token: string
  instance_url: string
  issued_at: string
}

interface SfQueryResponse<T> {
  totalSize: number
  done: boolean
  nextRecordsUrl?: string
  records: T[]
}

interface SfErrorEntry {
  message: string
  errorCode: string
}

let cachedAuth: SfAuth | null = null

/**
 * Authenticates against Salesforce via the OAuth2 username-password flow.
 * Caches the access token + instance URL until shortly before expiry.
 */
async function getSalesforceAuth(): Promise<SfAuth> {
  if (cachedAuth && Date.now() < cachedAuth.expiresAt - 5 * 60 * 1000) {
    return cachedAuth
  }

  const clientId = process.env.SF_CLIENT_ID
  const clientSecret = process.env.SF_CLIENT_SECRET
  const username = process.env.SF_USERNAME
  const password = process.env.SF_PASSWORD
  const securityToken = process.env.SF_SECURITY_TOKEN

  if (!clientId || !clientSecret || !username || !password || !securityToken) {
    throw new Error(
      'Missing Salesforce credentials. Set SF_CLIENT_ID, SF_CLIENT_SECRET, SF_USERNAME, SF_PASSWORD, SF_SECURITY_TOKEN.'
    )
  }

  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: clientId,
    client_secret: clientSecret,
    username,
    password: `${password}${securityToken}`,
  })

  const resp = await fetch(`${SF_LOGIN_URL}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Salesforce auth failed (${resp.status}): ${text}`)
  }

  const data = (await resp.json()) as SfTokenResponse

  cachedAuth = {
    accessToken: data.access_token,
    instanceUrl: data.instance_url,
    // SF sessions default to 2 hours; refresh proactively
    expiresAt: Date.now() + 2 * 60 * 60 * 1000,
  }

  console.log('[salesforce-api] Authenticated as', username)
  return cachedAuth
}

/**
 * Run a SOQL query against Salesforce and return the records array.
 * Follows pagination and re-authenticates once on session expiry (401).
 */
export async function querySalesforce<
  T extends Record<string, unknown> = Record<string, unknown>
>(soql: string): Promise<T[]> {
  return runQuery<T>(soql, false)
}

async function runQuery<T extends Record<string, unknown>>(
  soql: string,
  isRetry: boolean
): Promise<T[]> {
  const auth = await getSalesforceAuth()
  const records: T[] = []

  let url: string | null =
    `${auth.instanceUrl}/services/data/${SF_API_VERSION}/query/?q=${encodeURIComponent(soql)}`

  while (url) {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    })

    if (resp.status === 401 && !isRetry) {
      console.log('[salesforce-api] Session expired, re-authenticating...')
      cachedAuth = null
      return runQuery<T>(soql, true)
    }

    if (!resp.ok) {
      const text = await resp.text()
      let message = text
      try {
        const parsed = JSON.parse(text) as SfErrorEntry[] | SfErrorEntry
        const first = Array.isArray(parsed) ? parsed[0] : parsed
        if (first?.errorCode || first?.message) {
          message = `${first.errorCode ?? 'ERROR'}: ${first.message ?? text}`
        }
      } catch {
        // leave `message` as the raw response text
      }
      throw new Error(`Salesforce query failed (${resp.status}): ${message}`)
    }

    const data = (await resp.json()) as SfQueryResponse<T>
    records.push(...data.records)

    url = data.done || !data.nextRecordsUrl
      ? null
      : `${auth.instanceUrl}${data.nextRecordsUrl}`
  }

  return records
}
