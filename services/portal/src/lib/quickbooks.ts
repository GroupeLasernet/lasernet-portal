// ============================================================
// QUICKBOOKS ONLINE API INTEGRATION
// Handles OAuth2 flow and API calls to QuickBooks
// ============================================================
//
// SETUP STEPS:
// 1. Go to https://developer.intuit.com and sign in
// 2. Click "Dashboard" → "Create an app"
// 3. Select "QuickBooks Online and Payments"
// 4. Copy your Client ID and Client Secret
// 5. Add redirect URI: http://localhost:3000/api/quickbooks/callback
// 6. Paste credentials into .env.local
// ============================================================

const OAuthClient = require('intuit-oauth');

// ============================================================
// INTUIT DISCOVERY DOCUMENT
// We use the Intuit discovery document to get the latest
// OAuth2.0 endpoints as required by Intuit's best practices.
// Discovery URL: https://developer.api.intuit.com/.well-known/openid_configuration
// The intuit-oauth SDK fetches this automatically based on environment.
// ============================================================
const DISCOVERY_URLS = {
  sandbox: 'https://developer.api.intuit.com/.well-known/openid_sandbox_configuration',
  production: 'https://developer.api.intuit.com/.well-known/openid_configuration',
};

// Cache for discovery document
let discoveryDocument: any = null;

async function fetchDiscoveryDocument(): Promise<any> {
  if (discoveryDocument) return discoveryDocument;

  const env = process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox';
  const url = DISCOVERY_URLS[env as keyof typeof DISCOVERY_URLS] || DISCOVERY_URLS.sandbox;

  try {
    const response = await fetch(url);
    discoveryDocument = await response.json();
    console.log('Loaded Intuit discovery document:', {
      authorization_endpoint: discoveryDocument.authorization_endpoint,
      token_endpoint: discoveryDocument.token_endpoint,
    });
    return discoveryDocument;
  } catch (error) {
    console.error('Failed to fetch discovery document, using SDK defaults:', error);
    return null;
  }
}

// Validate that required QuickBooks credentials are configured
export function validateCredentials(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.QUICKBOOKS_CLIENT_ID) missing.push('QUICKBOOKS_CLIENT_ID');
  if (!process.env.QUICKBOOKS_CLIENT_SECRET) missing.push('QUICKBOOKS_CLIENT_SECRET');
  if (!process.env.QUICKBOOKS_REDIRECT_URI) missing.push('QUICKBOOKS_REDIRECT_URI');
  return { valid: missing.length === 0, missing };
}

// QuickBooks OAuth configuration
// The intuit-oauth SDK uses the discovery document internally
// to resolve the correct authorization and token endpoints
function getOAuthClient() {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI;
  const environment = process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox';

  if (!clientId || !clientSecret) {
    throw new Error(
      'QuickBooks credentials are not configured. ' +
      'Please set QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET in your environment variables. ' +
      `Current state: CLIENT_ID=${clientId ? 'SET (' + clientId.substring(0, 6) + '...)' : 'MISSING'}, ` +
      `CLIENT_SECRET=${clientSecret ? 'SET' : 'MISSING'}, ` +
      `REDIRECT_URI=${redirectUri || 'MISSING'}, ` +
      `ENVIRONMENT=${environment}`
    );
  }

  return new OAuthClient({
    clientId,
    clientSecret,
    environment,
    redirectUri: redirectUri || 'http://localhost:3000/api/quickbooks/callback',
    logging: false,
  });
}

// Export for use in API routes
export { fetchDiscoveryDocument, DISCOVERY_URLS };

// ============================================================
// TOKEN STORAGE (Cookie-based for Vercel serverless)
// Tokens are stored in encrypted HTTP-only cookies so they
// persist across serverless function invocations.
// ============================================================

export interface QBTokens {
  accessToken: string;
  refreshToken: string;
  realmId: string;
  expiresAt: number;
}

// Simple XOR encryption with the JWT_SECRET for cookie storage
function encryptTokens(tokens: QBTokens): string {
  const json = JSON.stringify(tokens);
  const key = process.env.JWT_SECRET || 'fallback-key';
  let result = '';
  for (let i = 0; i < json.length; i++) {
    result += String.fromCharCode(json.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return Buffer.from(result, 'binary').toString('base64');
}

function decryptTokens(encrypted: string): QBTokens | null {
  try {
    const key = process.env.JWT_SECRET || 'fallback-key';
    const decoded = Buffer.from(encrypted, 'base64').toString('binary');
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return JSON.parse(result);
  } catch {
    return null;
  }
}

export { encryptTokens, decryptTokens };

// Helper to read tokens from a cookie string (used in API routes)
export function getTokensFromCookies(cookieHeader: string | null): QBTokens | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/qb_tokens=([^;]+)/);
  if (!match) return null;
  return decryptTokens(decodeURIComponent(match[1]));
}

// Build a Set-Cookie header to store tokens
export function buildTokenCookie(tokens: QBTokens): string {
  const encrypted = encryptTokens(tokens);
  // Cookie expires in 100 days (refresh tokens last longer)
  const maxAge = 100 * 24 * 60 * 60;
  return `qb_tokens=${encodeURIComponent(encrypted)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

// Build a Set-Cookie header to clear the tokens
export function buildClearTokenCookie(): string {
  return `qb_tokens=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// ============================================================
// DATABASE TOKEN STORAGE — Persistent across deploys/sessions
// ============================================================
import prisma from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function getTokensFromDB(): Promise<QBTokens | null> {
  try {
    const row = await db.qBToken.findUnique({ where: { id: 'singleton' } });
    if (!row) return null;
    return {
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      realmId: row.realmId,
      expiresAt: Number(row.expiresAt),
    };
  } catch {
    return null;
  }
}

export async function saveTokensToDB(tokens: QBTokens): Promise<void> {
  try {
    await db.qBToken.upsert({
      where: { id: 'singleton' },
      update: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        realmId: tokens.realmId,
        expiresAt: BigInt(tokens.expiresAt),
      },
      create: {
        id: 'singleton',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        realmId: tokens.realmId,
        expiresAt: BigInt(tokens.expiresAt),
      },
    });
  } catch (err) {
    console.error('Failed to save QB tokens to DB:', err);
  }
}

export async function clearTokensFromDB(): Promise<void> {
  try {
    await db.qBToken.deleteMany({ where: { id: 'singleton' } });
  } catch { /* ignore */ }
}

// ============================================================
// OAUTH FLOW
// ============================================================

// Step 1: Generate the authorization URL for the user to click
export function getAuthorizationUrl(): string {
  const oauthClient = getOAuthClient();
  return oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting, OAuthClient.scopes.OpenId],
    state: 'lasernet-auth',
  });
}

// Step 2: Handle the callback and exchange code for tokens
// Returns the tokens so the API route can set them as a cookie
export async function handleCallback(url: string): Promise<QBTokens> {
  const oauthClient = getOAuthClient();
  const authResponse = await oauthClient.createToken(url);
  const tokens = authResponse.getJson();

  const qbTokens: QBTokens = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    realmId: new URL(url, 'http://localhost').searchParams.get('realmId') || '',
    expiresAt: Date.now() + tokens.expires_in * 1000,
  };

  // Save to database for persistence across sessions
  await saveTokensToDB(qbTokens);

  return qbTokens;
}

// Refresh tokens if expired — takes tokens as input and returns updated tokens
export async function ensureValidToken(currentTokens: QBTokens): Promise<{ accessToken: string; updatedTokens: QBTokens | null }> {
  if (Date.now() >= currentTokens.expiresAt - 60000) {
    // Token is expired or about to expire, refresh it
    const oauthClient = getOAuthClient();
    oauthClient.setToken({
      access_token: currentTokens.accessToken,
      refresh_token: currentTokens.refreshToken,
    });

    const response = await oauthClient.refresh();
    const tokens = response.getJson();

    const updatedTokens: QBTokens = {
      ...currentTokens,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    };

    // Auto-persist refreshed tokens to database
    await saveTokensToDB(updatedTokens);

    return { accessToken: updatedTokens.accessToken, updatedTokens };
  }

  return { accessToken: currentTokens.accessToken, updatedTokens: null };
}

// ============================================================
// API CALLS
// ============================================================

const BASE_URL_SANDBOX = 'https://sandbox-quickbooks.api.intuit.com';
const BASE_URL_PRODUCTION = 'https://quickbooks.api.intuit.com';

function getBaseUrl(): string {
  return (process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox') === 'production'
    ? BASE_URL_PRODUCTION
    : BASE_URL_SANDBOX;
}

// Generic query function — tokens are passed in from the API route (read from cookies)
export async function queryQuickBooks(query: string, tokens: QBTokens): Promise<{ data: any; updatedTokens: QBTokens | null }> {
  const { accessToken, updatedTokens } = await ensureValidToken(tokens);
  const realmId = tokens.realmId;
  const baseUrl = getBaseUrl();

  const response = await fetch(
    `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`QuickBooks API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return { data, updatedTokens };
}

// ============================================================
// CUSTOMER / CLIENT FUNCTIONS
// ============================================================

export interface QBCustomer {
  Id: string;
  DisplayName: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  BillAddr?: {
    Line1?: string;
    City?: string;
    CountrySubDivisionCode?: string; // Province/State
    PostalCode?: string;
  };
  Active: boolean;
}

export async function fetchAllCustomers(tokens: QBTokens): Promise<{ customers: QBCustomer[]; updatedTokens: QBTokens | null }> {
  const { data, updatedTokens } = await queryQuickBooks(
    "SELECT * FROM Customer WHERE Active = true MAXRESULTS 1000",
    tokens
  );
  return { customers: data?.QueryResponse?.Customer || [], updatedTokens };
}

// ============================================================
// INVOICE FUNCTIONS
// ============================================================

export interface QBInvoice {
  Id: string;
  DocNumber: string;
  CustomerRef: { value: string; name: string };
  TotalAmt: number;
  Balance: number;
  TxnDate: string;
  DueDate: string;
  Line: {
    Description?: string;
    Amount: number;
    SalesItemLineDetail?: {
      Qty?: number;
      UnitPrice?: number;
      ItemRef?: { value: string; name: string };
    };
    DetailType: string;
  }[];
}

export async function fetchInvoices(tokens: QBTokens, customerId?: string): Promise<{ invoices: QBInvoice[]; updatedTokens: QBTokens | null }> {
  let query = "SELECT * FROM Invoice MAXRESULTS 1000";
  if (customerId) {
    query = `SELECT * FROM Invoice WHERE CustomerRef = '${customerId}' MAXRESULTS 1000`;
  }
  const { data, updatedTokens } = await queryQuickBooks(query, tokens);
  return { invoices: data?.QueryResponse?.Invoice || [], updatedTokens };
}

// ============================================================
// ESTIMATE (QUOTE) FUNCTIONS
// ============================================================

export interface QBEstimate {
  Id: string;
  DocNumber: string;
  CustomerRef: { value: string; name: string };
  TotalAmt: number;
  TxnDate: string;
  ExpirationDate?: string;
  TxnStatus: string;
  Line: {
    Description?: string;
    Amount: number;
    SalesItemLineDetail?: {
      Qty?: number;
      UnitPrice?: number;
      ItemRef?: { value: string; name: string };
    };
    DetailType: string;
  }[];
}

export async function fetchEstimates(tokens: QBTokens, customerId?: string): Promise<{ estimates: QBEstimate[]; updatedTokens: QBTokens | null }> {
  let query = "SELECT * FROM Estimate MAXRESULTS 1000";
  if (customerId) {
    query = `SELECT * FROM Estimate WHERE CustomerRef = '${customerId}' MAXRESULTS 1000`;
  }
  const { data, updatedTokens } = await queryQuickBooks(query, tokens);
  return { estimates: data?.QueryResponse?.Estimate || [], updatedTokens };
}

// ============================================================
// CONNECTION STATUS (checks cookie-based tokens)
// ============================================================

export function isConnected(tokens: QBTokens | null): boolean {
  return tokens !== null && tokens.accessToken !== '';
}
