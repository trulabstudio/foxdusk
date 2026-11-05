// Built by Foxdusk
// POST /api/checkout: start a card / FPX payment with Stripe.
// Saves the order as "awaiting_payment" and returns the Stripe Checkout link.
// The key is sent by /api/stripe-webhook once Stripe confirms the payment.
'use strict';

const S = require('../lib/shared');
const Stripe = require('../lib/stripe');
const { checkUpgrade } = require('../lib/fulfil');

const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

module.exports = S.handler(async (req, res) => {
  if (req.method !== 'POST') throw S.httpError(405, 'Method not allowed.');
  const settings = await S.getSettings();
  if (!settings.stripe_enabled || !Stripe.ready()) throw S.httpError(503, 'Card payment is not available right now. Please pay by bank transfer.');

  const body = await S.readBody(req);
  if (body.website) return S.send(res, 200, { ok: true, url: '/' });
  const product = S.pickProduct(body.product);
  const price = S.priceOf(settings, product);
  if (!settings.sales_open || !(price > 0)) throw S.httpError(503, `${S.PRODUCTS[product].name} is not on sale yet.`);
  await S.checkTurnstile(body.turnstile, req);

  const name = clean(body.name, 120);
  const email = clean(body.email, 254).toLowerCase();
  const phone = clean(body.phone, 30);
  if (name.length < 2) throw S.httpError(400, 'Please enter your full name.');
  if (!S.EMAIL_RE.test(email)) throw S.httpError(400, 'Please enter a valid email address.');
  if (!/^[+\d][\d\s-]{6,}$/.test(phone)) throw S.httpError(400, 'Please enter a valid phone number.');
  if (body.agree !== true) throw S.httpError(400, 'Please accept the licence and refund terms.');
  const upgradeKey = S.PRODUCTS[product].upgradeFrom ? await checkUpgrade(product, body.upgrade_key, email) : null;

  const since = new Date(Date.now() - 3600e3).toISOString();
  const recent = await S.db(`orders?select=id&email=eq.${encodeURIComponent(email)}&status=eq.awaiting_payment&created_at=gte.${encodeURIComponent(since)}`);
  if (recent.length >= 5) throw S.httpError(429, 'Too many payment attempts. Please wait a little, or contact admin@foxdusk.com.');

  const [order] = await S.db('orders', {
    method: 'POST', prefer: 'return=representation',
    body: { order_no: S.newOrderNo(), name, email, phone, product, upgrade_key: upgradeKey, amount_rm: price, status: 'awaiting_payment', payment_method: 'stripe' },
  });
  const site = S.env('SITE_URL', { optional: true }) || 'https://www.foxdusk.com';
  const session = await Stripe.createCheckout(order, site.replace(/\/$/, ''));
  await S.db(`orders?id=eq.${order.id}`, { method: 'PATCH', body: { stripe_session_id: session.id } });
  S.send(res, 200, { ok: true, url: session.url, order_no: order.order_no });
});
