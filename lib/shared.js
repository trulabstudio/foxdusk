// Built by Foxdusk
// Shared helpers for the Foxdusk AIOS sales API (Vercel Node functions).
// No npm packages: Supabase and Resend are called over their REST APIs.
'use strict';

const crypto = require('crypto');
const config = require('../aios.json');

// ---------- products ----------
// An app is something a key unlocks and a zip buyers download. A product is
// what an order buys: one app, or the bundle of both.
const APPS = {
  foxdusk: { name: 'Foxdusk AIOS', file: 'Foxdusk-AIOS.zip', fileEnv: 'AIOS_DOWNLOAD_FILE', folder: 'Foxdusk-AIOS', start: 'Start Foxdusk', studio: 'Foxdusk Studio', setup: '<b>Setup</b> &gt; <b>Install everything</b>', setupText: 'Setup > Install everything' },
  hookdusk: { name: 'Hookdusk AIOS', file: 'Hookdusk-AIOS.zip', fileEnv: 'HOOKDUSK_DOWNLOAD_FILE', folder: 'Hookdusk-AIOS', start: 'Start Hookdusk', studio: 'Hookdusk Studio', setup: '<b>Setup</b> &gt; <b>Install Claude Code</b>', setupText: 'Setup > Install Claude Code' },
  // Fox Studio is a desktop app (Mac installers: Apple chip and Intel; no Windows build yet). There is no download link:
  // the buyer gets the key by email and the team sends the installer for their computer.
  foxstudio: { name: 'Fox Studio', delivery: 'team', studio: 'Fox Studio' },
};
const PRODUCTS = {
  foxdusk: { name: 'Foxdusk AIOS', apps: ['foxdusk'], priceField: 'price_rm' },
  hookdusk: { name: 'Hookdusk AIOS', apps: ['hookdusk'], priceField: 'price_hookdusk_rm' },
  bundle: { name: 'Foxdusk AIOS + Hookdusk AIOS', apps: ['foxdusk', 'hookdusk'], priceField: 'price_bundle_rm' },
  // Adds the other app to a key the buyer already has.
  upgrade_hookdusk: { name: 'Hookdusk AIOS (add to my key)', apps: ['hookdusk'], upgradeFrom: 'foxdusk' },
  upgrade_foxdusk: { name: 'Foxdusk AIOS (add to my key)', apps: ['foxdusk'], upgradeFrom: 'hookdusk' },
  foxstudio: { name: 'Fox Studio', apps: ['foxstudio'], priceField: 'price_foxstudio_rm' },
};
const upgradeFor = (app) => `upgrade_${app}`; // the product that adds `app` to a key
const productOf = (order) => PRODUCTS[order?.product] ? order.product : 'foxdusk';
const productName = (order) => PRODUCTS[productOf(order)].name;
// Licences made before the products column existed unlock Foxdusk.
const appsOf = (license) => (Array.isArray(license?.products) && license.products.length ? license.products.filter((a) => APPS[a]) : ['foxdusk']);
// An upgrade costs the bundle price minus the app the buyer already paid for.
function priceOf(settings, product) {
  const p = PRODUCTS[product];
  if (!p.upgradeFrom) return Number(settings[p.priceField]) || 0;
  const bundle = priceOf(settings, 'bundle');
  const owned = priceOf(settings, p.upgradeFrom);
  return bundle > 0 && owned > 0 && bundle > owned ? Math.round((bundle - owned) * 100) / 100 : 0;
}
function pickProduct(value) {
  const p = String(value || 'foxdusk');
  if (!PRODUCTS[p]) throw httpError(400, 'Please choose a product.');
  return p;
}

function env(name, { optional = false } = {}) {
  const v = (process.env[name] || '').trim();
  if (!v && !optional) throw httpError(500, `Server setting ${name} is missing.`);
  return v;
}

function httpError(status, message, extra) {
  const e = new Error(message);
  e.status = status;
  if (extra) e.extra = extra;
  return e;
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

// Wraps a handler: JSON errors, never a stack trace or secret in the reply.
function handler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      const status = e.status || 500;
      if (!e.status) console.error(e);
      send(res, status, { error: status >= 500 && !e.status ? 'Something went wrong. Please try again.' : e.message, ...(e.extra || {}) });
    }
  };
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(text || '{}'); } catch { throw httpError(400, 'Invalid request.'); }
}

// ---------- Supabase ----------
function serviceHeaders(extra = {}) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const h = { apikey: key, ...extra };
  // Legacy service_role keys are JWTs and go in Authorization too; new sb_secret_ keys do not.
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
  return h;
}

async function db(path, { method = 'GET', body, prefer } = {}) {
  const url = `${env('SUPABASE_URL').replace(/\/$/, '')}/rest/v1/${path}`;
  const headers = serviceHeaders({ 'Content-Type': 'application/json' });
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) {
    console.error('Supabase', method, path.split('?')[0], r.status, text.slice(0, 300));
    throw httpError(500, 'Database error. Please try again.');
  }
  return text ? JSON.parse(text) : null;
}

async function uploadReceipt(path, buffer, type) {
  const url = `${env('SUPABASE_URL').replace(/\/$/, '')}/storage/v1/object/receipts/${path}`;
  const r = await fetch(url, { method: 'POST', headers: serviceHeaders({ 'Content-Type': type, 'x-upsert': 'false' }), body: buffer });
  if (!r.ok) {
    console.error('Storage upload', r.status, (await r.text()).slice(0, 300));
    throw httpError(500, 'Could not save your receipt. Please try again.');
  }
}

// Removes a receipt file. Best effort: a missing file is not an error.
async function deleteReceipt(path) {
  if (!path) return;
  const url = `${env('SUPABASE_URL').replace(/\/$/, '')}/storage/v1/object/receipts/${path}`;
  const r = await fetch(url, { method: 'DELETE', headers: serviceHeaders() }).catch(() => null);
  if (r && !r.ok && r.status !== 404 && r.status !== 400) console.error('Storage delete', r.status, (await r.text()).slice(0, 300));
}

// Orders paid through Stripe test mode (test keys, test cards). Kept out of sales numbers.
const isTestOrder = (order) => /^cs_test_/.test(String(order?.stripe_session_id || ''));

// A link to a private file that stops working after `seconds`.
// Uploads a public website image (bucket "site") and returns its public link.
async function uploadSiteImage(name, buffer, type) {
  const base = env('SUPABASE_URL').replace(/\/$/, '');
  const r = await fetch(`${base}/storage/v1/object/site/${name}`, { method: 'POST', headers: serviceHeaders({ 'Content-Type': type, 'x-upsert': 'true', 'Cache-Control': '3600' }), body: buffer });
  if (!r.ok) {
    console.error('Site image upload', r.status, (await r.text()).slice(0, 200));
    throw httpError(500, 'Could not upload the image. Run the latest supabase/schema.sql (it creates the "site" bucket), then try again.');
  }
  return `${base}/storage/v1/object/public/site/${name}`;
}

async function signedUrl(bucket, path, seconds, failMessage, download) {
  const base = env('SUPABASE_URL').replace(/\/$/, '');
  const r = await fetch(`${base}/storage/v1/object/sign/${bucket}/${path}`, {
    method: 'POST', headers: serviceHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ expiresIn: seconds }),
  });
  if (!r.ok) {
    console.error('Storage sign', bucket, r.status, (await r.text()).slice(0, 200));
    throw httpError(r.status === 404 || r.status === 400 ? 404 : 500, failMessage);
  }
  const { signedURL } = await r.json();
  const url = `${base}/storage/v1${signedURL}`;
  return download ? `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(download)}` : url;
}
const signedReceiptUrl = (path) => signedUrl('receipts', path, 300, 'Could not open the receipt.');
// The zips buyers download. Upload a new version to the same name to update everyone.
const DOWNLOAD_FILE = (app = 'foxdusk') => env(APPS[app].fileEnv, { optional: true }) || APPS[app].file;
const signedDownloadUrl = (app = 'foxdusk') => signedUrl('downloads', DOWNLOAD_FILE(app), 600, `The ${APPS[app].name} download is not available yet. Please contact admin@foxdusk.com.`, APPS[app].file);
const newDownloadToken = () => crypto.randomBytes(24).toString('base64url');

// Checks a Supabase Auth session token and the admin allowlist.
const adminCache = new Map(); // sha256(token) -> { email, until }
async function requireAdmin(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw httpError(401, 'Please sign in.');
  const tokenId = crypto.createHash('sha256').update(token).digest('hex');
  const hit = adminCache.get(tokenId);
  if (hit && hit.until > Date.now()) return hit.email;
  const r = await fetch(`${env('SUPABASE_URL').replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: env('SUPABASE_ANON_KEY'), Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw httpError(401, 'Your session has ended. Please sign in again.');
  const user = await r.json();
  const allowed = env('ADMIN_EMAILS').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  const email = String(user.email || '').toLowerCase();
  if (!email || !allowed.includes(email)) throw httpError(403, 'This account is not an admin.');
  if (adminCache.size > 200) adminCache.clear();
  adminCache.set(tokenId, { email, until: Date.now() + 60e3 });
  return email;
}

// ---------- shop settings (admin > Settings) ----------
// The settings row in Supabase wins; aios.json is the fallback until it exists.
async function getSettings() {
  const fallback = {
    sales_open: Number(config.price_rm) > 0,
    price_rm: Number(config.price_rm) || 0,
    price_hookdusk_rm: Number(config.prices?.hookdusk) || 0,
    price_bundle_rm: Number(config.prices?.bundle) || 0,
    price_foxstudio_rm: Number(config.prices?.foxstudio) || 0,
    bank_name: config.bank?.name || '',
    account_name: config.bank?.account_name || '',
    account_no: config.bank?.account_no || '',
    duitnow_qr: config.duitnow_qr || '',
    stripe_enabled: false,
    whatsapp: '60176982032',
    contact_email: 'admin@foxdusk.com',
    whatsapp_message: 'Hi Foxdusk, I have a question about Foxdusk AIOS:',
    source: 'aios.json',
  };
  try {
    const url = `${env('SUPABASE_URL').replace(/\/$/, '')}/rest/v1/settings?id=eq.1&select=*`;
    const r = await fetch(url, { headers: serviceHeaders() });
    if (!r.ok) return fallback;
    const [row] = await r.json();
    if (!row) return fallback;
    return {
      sales_open: !!row.sales_open,
      price_rm: Number(row.price_rm) || 0,
      // Until the Hookdusk columns exist, Hookdusk and the bundle stay closed.
      price_hookdusk_rm: Number(row.price_hookdusk_rm) || 0,
      price_bundle_rm: Number(row.price_bundle_rm) || 0,
      // Until the Fox Studio column exists, Fox Studio stays closed.
      price_foxstudio_rm: Number(row.price_foxstudio_rm) || 0,
      bank_name: row.bank_name || '',
      account_name: row.account_name || '',
      account_no: row.account_no || '',
      duitnow_qr: row.duitnow_qr || '',
      stripe_enabled: !!row.stripe_enabled,
      whatsapp: row.whatsapp ?? '60176982032',
      contact_email: row.contact_email ?? 'admin@foxdusk.com',
      whatsapp_message: row.whatsapp_message || 'Hi Foxdusk, I have a question about Foxdusk AIOS:',
      updated_at: row.updated_at,
      updated_by: row.updated_by,
      source: 'supabase',
    };
  } catch {
    return fallback;
  }
}

// ---------- bot check (Cloudflare Turnstile) ----------
// Off until TURNSTILE_SECRET_KEY is set. Once set, every order needs a fresh,
// valid token from the widget on the order form, checked here with Cloudflare.
async function checkTurnstile(token, req) {
  const secret = env('TURNSTILE_SECRET_KEY', { optional: true });
  if (!secret) return;
  const response = String(token || '');
  if (!response || response.length > 2048) throw httpError(400, 'Please complete the security check above the Send button.', { code: 'turnstile' });
  const form = new URLSearchParams({ secret, response });
  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (ip) form.set('remoteip', ip);
  let result;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form, signal: AbortSignal.timeout(10000) });
    result = await r.json();
  } catch {
    throw httpError(503, 'The security check could not be reached. Please try again in a moment.', { code: 'turnstile' });
  }
  if (!result.success) {
    console.error('Turnstile failed', (result['error-codes'] || []).join(','));
    throw httpError(400, 'The security check failed or expired. Please try it again.', { code: 'turnstile' });
  }
  const expected = env('TURNSTILE_HOSTNAMES', { optional: true }).toLowerCase().split(',').map((h) => h.trim()).filter(Boolean);
  if (expected.length && !expected.includes(String(result.hostname || '').toLowerCase())) {
    throw httpError(400, 'The security check came from another site. Please reload this page and try again.', { code: 'turnstile' });
  }
}

// ---------- email (Resend) ----------
async function sendEmail({ to, subject, html, text, replyTo }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('MAIL_FROM'), to: [to], subject, html, text, reply_to: replyTo || env('MAIL_REPLY_TO', { optional: true }) || undefined }),
  });
  if (!r.ok) {
    console.error('Resend', r.status, (await r.text()).slice(0, 300));
    throw httpError(502, 'The email could not be sent.');
  }
}

// ---------- keys and signed licence tokens ----------
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
function randomChars(n) {
  const bytes = crypto.randomBytes(n);
  let out = '';
  for (let i = 0; i < n; i++) out += ALPHABET[bytes[i] & 31];
  return out;
}
const newLicenseKey = () => `FXD-${[0, 1, 2, 3].map(() => randomChars(5)).join('-')}`;
function newOrderNo() {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `AIOS-${ymd}-${randomChars(4)}`;
}
const normalizeKey = (k) => String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^FXD/, '').replace(/(.{5})(?=.)/g, '$1-').replace(/^/, 'FXD-');

const TOKEN_DAYS = 14;
function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
// Accepts the key pasted with or without its BEGIN/END lines, quotes or line breaks.
function privateKey() {
  const raw = env('LICENSE_PRIVATE_KEY').replace(/\\n/g, '\n').replace(/^["']|["']$/g, '');
  const body = raw.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const pem = `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
  try { return crypto.createPrivateKey(pem); } catch { throw httpError(500, 'Server setting LICENSE_PRIVATE_KEY is not a valid key.'); }
}
// A token Foxdusk Studio checks offline with the matching public key.
function signToken({ key, device, email }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { v: 1, k: key, d: device, e: maskEmail(email), iat: now, exp: now + TOKEN_DAYS * 86400 };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.sign(null, Buffer.from(body), privateKey());
  return `${body}.${b64url(sig)}`;
}
function maskEmail(email) {
  const [u = '', d = ''] = String(email || '').split('@');
  return `${u.slice(0, 2)}${'*'.repeat(Math.max(1, u.length - 2))}@${d}`;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

module.exports = {
  config, APPS, PRODUCTS, productOf, productName, appsOf, pickProduct, priceOf, upgradeFor, env, httpError, send, handler, readBody, db, uploadReceipt, deleteReceipt, isTestOrder, signedReceiptUrl, signedDownloadUrl, newDownloadToken, DOWNLOAD_FILE, requireAdmin, checkTurnstile, getSettings, uploadSiteImage,
  sendEmail, newLicenseKey, newOrderNo, normalizeKey, signToken, maskEmail, esc, EMAIL_RE, TOKEN_DAYS,
};
