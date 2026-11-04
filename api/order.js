// Built by Foxdusk
// POST /api/order: a buyer submits their details and payment receipt.
// The order is saved as "pending" until an admin confirms the transfer.
'use strict';

const S = require('../lib/shared');
const E = require('../lib/emails');
const Stripe = require('../lib/stripe');

const TYPES = {
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  'image/png': { ext: 'png', magic: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { ext: 'webp', magic: (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' },
  'application/pdf': { ext: 'pdf', magic: (b) => b.slice(0, 5).toString() === '%PDF-' },
};
const MAX_BYTES = 3 * 1024 * 1024;
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

module.exports = S.handler(async (req, res) => {
  // GET: what the order form shows. All of it is public: price, bank details,
  // and the Turnstile site key (public by design).
  if (req.method === 'GET') {
    const s = await S.getSettings();
    return S.send(res, 200, {
      open: s.sales_open && s.price_rm > 0,
      price_rm: s.price_rm,
      bank: { name: s.bank_name, account_name: s.account_name, account_no: s.account_no },
      duitnow_qr: s.duitnow_qr,
      card: !!(s.stripe_enabled && Stripe.ready()),
      turnstile_site_key: S.env('TURNSTILE_SITE_KEY', { optional: true }) || null,
    });
  }
  if (req.method !== 'POST') throw S.httpError(405, 'Method not allowed.');
  const settings = await S.getSettings();
  const price = settings.price_rm;
  if (!settings.sales_open || !(price > 0)) throw S.httpError(503, 'Sales are not open yet.');

  const body = await S.readBody(req);
  // Honeypot field that people never see; bots fill it.
  if (body.website) return S.send(res, 200, { ok: true, order_no: 'AIOS-RECEIVED' });
  await S.checkTurnstile(body.turnstile, req);

  const name = clean(body.name, 120);
  const email = clean(body.email, 254).toLowerCase();
  const phone = clean(body.phone, 30);
  if (name.length < 2) throw S.httpError(400, 'Please enter your full name.');
  if (!S.EMAIL_RE.test(email)) throw S.httpError(400, 'Please enter a valid email address.');
  if (!/^[+\d][\d\s-]{6,}$/.test(phone)) throw S.httpError(400, 'Please enter a valid phone number.');
  if (body.agree !== true) throw S.httpError(400, 'Please accept the licence and refund terms.');

  const file = body.receipt || {};
  const type = TYPES[file.type];
  if (!type) throw S.httpError(400, 'The receipt must be a JPG, PNG, WEBP, or PDF file.');
  const buffer = Buffer.from(String(file.data || ''), 'base64');
  if (!buffer.length) throw S.httpError(400, 'Please attach your payment receipt.');
  if (buffer.length > MAX_BYTES) throw S.httpError(400, 'The receipt is larger than 3 MB. Please send a smaller image or a screenshot.');
  if (!type.magic(buffer)) throw S.httpError(400, 'The receipt file looks damaged or is not the type it claims to be.');

  // Light flood control: at most 3 pending orders per email in an hour.
  const since = new Date(Date.now() - 3600e3).toISOString();
  const recent = await S.db(`orders?select=id&email=eq.${encodeURIComponent(email)}&status=eq.pending&created_at=gte.${encodeURIComponent(since)}`);
  if (recent.length >= 3) throw S.httpError(429, 'We already have your recent orders. Please wait for our email, or contact admin@foxdusk.com.');

  const orderNo = S.newOrderNo();
  const receiptPath = `${new Date().toISOString().slice(0, 7)}/${orderNo}.${type.ext}`;
  await S.uploadReceipt(receiptPath, buffer, file.type);
  const [order] = await S.db('orders', {
    method: 'POST', prefer: 'return=representation',
    body: { order_no: orderNo, name, email, phone, amount_rm: price, receipt_path: receiptPath, status: 'pending' },
  });

  // Emails are best effort: the order is already safe in the database.
  const notify = S.env('ADMIN_NOTIFY_EMAIL', { optional: true });
  await Promise.allSettled([
    S.sendEmail({ to: email, ...E.orderReceived(order) }),
    notify ? S.sendEmail({ to: notify, ...E.adminNewOrder(order), replyTo: email }) : null,
  ]);

  S.send(res, 200, { ok: true, order_no: order.order_no });
});
