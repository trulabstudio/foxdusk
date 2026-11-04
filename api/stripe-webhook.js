// Built by Foxdusk
// POST /api/stripe-webhook: Stripe calls this when a Checkout payment finishes.
// Add it in Stripe > Developers > Webhooks with these events:
//   checkout.session.completed, checkout.session.async_payment_succeeded,
//   checkout.session.async_payment_failed, checkout.session.expired
// A paid order is approved and its key is emailed automatically.
'use strict';

const S = require('../lib/shared');
const E = require('../lib/emails');
const Stripe = require('../lib/stripe');
const { createLicense, emailKey } = require('../lib/fulfil');

// The signature covers the exact bytes Stripe sent, so read the raw body.
async function rawBody(req) {
  const chunks = [];
  if (!req.readableEnded) for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  if (chunks.length) return Buffer.concat(chunks).toString('utf8');
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (typeof req.body === 'string') return req.body;
  throw S.httpError(400, 'Empty body.');
}

async function orderFor(session) {
  const id = session.metadata?.order_id || session.client_reference_id;
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return null;
  const [o] = await S.db(`orders?id=eq.${id}&select=*`);
  return o || null;
}

async function paid(session) {
  const order = await orderFor(session);
  if (!order) { console.error('Stripe paid: order not found', session.id); return 'order not found'; }
  if (session.currency !== 'myr' || Number(session.amount_total) !== Math.round(Number(order.amount_rm) * 100)) {
    console.error('Stripe paid: amount mismatch', order.order_no, session.amount_total, session.currency);
    await S.db(`orders?id=eq.${order.id}`, { method: 'PATCH', body: { status: 'pending', note: `Stripe amount ${session.amount_total / 100} ${String(session.currency).toUpperCase()} does not match RM ${order.amount_rm}. Check in Stripe before sending a key.` } });
    return 'amount mismatch, left for review';
  }
  // Approve once, even if Stripe sends the event twice.
  const rows = await S.db(`orders?id=eq.${order.id}&status=in.(awaiting_payment,expired)`, {
    method: 'PATCH', prefer: 'return=representation',
    body: { status: 'approved', decided_at: new Date().toISOString(), decided_by: 'Stripe', stripe_payment_intent: String(session.payment_intent || '') || null },
  });
  const current = rows[0] || (await orderFor(session));
  if (current.status !== 'approved' || current.email_sent_at) return 'already handled';
  const lic = await createLicense(current);
  try { await emailKey(current, lic); } catch (e) { console.error('Stripe paid: key email failed', current.order_no); }
  const notify = S.env('ADMIN_NOTIFY_EMAIL', { optional: true });
  if (notify) await S.sendEmail({ to: notify, ...E.adminCardPaid(current), replyTo: current.email }).catch(() => {});
  return 'approved';
}

async function failed(session) {
  const order = await orderFor(session);
  if (!order) return 'order not found';
  await S.db(`orders?id=eq.${order.id}&status=eq.awaiting_payment`, { method: 'PATCH', body: { status: 'expired' } });
  return 'expired';
}

module.exports = async (req, res) => {
  const reply = (status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
  try {
    if (req.method !== 'POST') return reply(405, { error: 'Method not allowed.' });
    const event = Stripe.verifyEvent(await rawBody(req), req.headers['stripe-signature']);
    const session = event.data?.object || {};
    let result = 'ignored';
    if (event.type === 'checkout.session.completed' && session.payment_status === 'paid') result = await paid(session);
    else if (event.type === 'checkout.session.async_payment_succeeded') result = await paid(session);
    else if (event.type === 'checkout.session.async_payment_failed' || event.type === 'checkout.session.expired') result = await failed(session);
    reply(200, { received: true, result });
  } catch (e) {
    if (!e.status) console.error(e);
    // 4xx tells Stripe not to retry a bad request; 5xx makes it retry later.
    reply(e.status && e.status < 500 ? e.status : 500, { error: e.status ? e.message : 'Server error.' });
  }
};
