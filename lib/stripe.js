// Built by Foxdusk
// Stripe Checkout for Foxdusk AIOS, over Stripe's REST API (no npm package).
// Needs STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in Vercel.
'use strict';

const crypto = require('crypto');
const S = require('./shared');

const ready = () => !!(S.env('STRIPE_SECRET_KEY', { optional: true }) && S.env('STRIPE_WEBHOOK_SECRET', { optional: true }));
const mode = () => (S.env('STRIPE_SECRET_KEY', { optional: true }).startsWith('sk_live_') ? 'live' : 'test');

// Stripe wants form encoding with bracket keys: line_items[0][price_data][currency]=myr
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function stripe(path, body) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${S.env('STRIPE_SECRET_KEY')}`, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: body ? form(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('Stripe', path, r.status, data.error?.code, data.error?.message);
    throw S.httpError(502, 'Card payment is not available right now. Please pay by bank transfer, or try again later.');
  }
  return data;
}

// A hosted Stripe page for one Foxdusk AIOS licence. Stripe shows the payment
// methods switched on in the Stripe dashboard (card, FPX, and so on) for MYR.
function createCheckout(order, siteUrl) {
  return stripe('checkout/sessions', {
    mode: 'payment',
    customer_email: order.email,
    client_reference_id: order.id,
    line_items: { 0: { quantity: 1, price_data: { currency: 'myr', unit_amount: Math.round(Number(order.amount_rm) * 100), product_data: { name: 'Foxdusk AIOS licence', description: 'One-time licence for 2 computers' } } } },
    metadata: { order_id: order.id, order_no: order.order_no },
    payment_intent_data: { metadata: { order_id: order.id, order_no: order.order_no }, description: `Foxdusk AIOS ${order.order_no}` },
    success_url: `${siteUrl}/?paid=${encodeURIComponent(order.order_no)}#order`,
    cancel_url: `${siteUrl}/?cancelled=1#order`,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
  });
}

// Checks the Stripe-Signature header against the raw request body.
// https://docs.stripe.com/webhooks#verify-manually
function verifyEvent(raw, header, toleranceSeconds = 300) {
  const parts = Object.fromEntries(String(header || '').split(',').map((p) => p.split('=')).filter((p) => p.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const signatures = String(header || '').split(',').filter((p) => p.trim().startsWith('v1=')).map((p) => p.trim().slice(3));
  const t = Number(parts.t);
  if (!t || !signatures.length) throw S.httpError(400, 'Missing Stripe signature.');
  if (Math.abs(Date.now() / 1000 - t) > toleranceSeconds) throw S.httpError(400, 'Stripe signature is too old.');
  const expected = crypto.createHmac('sha256', S.env('STRIPE_WEBHOOK_SECRET')).update(`${t}.${raw}`).digest('hex');
  const ok = signatures.some((sig) => sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
  if (!ok) throw S.httpError(400, 'Stripe signature does not match.');
  return JSON.parse(raw);
}

module.exports = { ready, mode, createCheckout, verifyEvent };
