// Built by Foxdusk
// /api/admin: the admin page's API. Every action except "config" needs a
// signed-in Supabase user whose email is listed in ADMIN_EMAILS.
//
// GET  ?action=config                       public Supabase URL and anon key for sign-in
// GET  ?action=orders&status=pending|...    orders with their licence and devices
// GET  ?action=receipt&id=<order id>        a 5-minute link to the receipt
// POST { action: "approve", id }            create the key and email the buyer
// POST { action: "reject", id, reason }     mark rejected and email the buyer
// POST { action: "resend", id }             email the key and download link again
// POST { action: "revoke" | "restore", key }
// POST { action: "reset_devices", key }     free both computer slots
// POST { action: "issue", name, email, product }  a free licence (you, testers, partners)
'use strict';

const S = require('../lib/shared');
const E = require('../lib/emails');
const { createLicense, emailKey } = require('../lib/fulfil');
const Stripe = require('../lib/stripe');

const getOrder = async (id) => {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) throw S.httpError(400, 'Invalid order.');
  const [o] = await S.db(`orders?id=eq.${id}&select=*`);
  if (!o) throw S.httpError(404, 'Order not found.');
  return o;
};
const getLicense = async (key) => {
  const [l] = await S.db(`licenses?key=eq.${encodeURIComponent(S.normalizeKey(key))}&select=*`);
  if (!l) throw S.httpError(404, 'Licence not found.');
  return l;
};

// ---------- dashboard numbers ----------
// Days are counted in Malaysia time (UTC+8). Sales count when an order is
// approved (decided_at); free licences (RM 0) are counted apart from sales.
const MY = 8 * 3600e3;
const dayOf = (iso) => new Date(new Date(iso).getTime() + MY).toISOString().slice(0, 10);
const PERIODS = { '7d': 7, '30d': 30, '90d': 90, all: null };

async function stats(periodParam) {
  const period = Object.hasOwn(PERIODS, periodParam) ? periodParam : '30d';
  const days = PERIODS[period];
  const [orders, licenses] = await Promise.all([
    S.db('orders?select=id,order_no,name,email,status,product,amount_rm,created_at,decided_at&order=created_at.desc&limit=10000'),
    S.db('licenses?select=key,status,order_id,activations(id)&limit=10000'),
  ]);
  const today = dayOf(new Date().toISOString());
  const from = days ? dayOf(new Date(Date.now() - (days - 1) * 86400e3).toISOString()) : null;
  const inPeriod = (iso) => !!iso && (!from || dayOf(iso) >= from);

  const paid = orders.filter((o) => o.status === 'approved' && Number(o.amount_rm) > 0);
  const paidInPeriod = paid.filter((o) => inPeriod(o.decided_at || o.created_at));
  const revenue = paidInPeriod.reduce((sum, o) => sum + Number(o.amount_rm), 0);

  // One bucket per day (or per month for "all time"), oldest first, zero-filled.
  const monthly = !days;
  const keyOf = (iso) => (monthly ? dayOf(iso).slice(0, 7) : dayOf(iso));
  const buckets = new Map();
  if (days) {
    for (let i = days - 1; i >= 0; i--) buckets.set(dayOf(new Date(Date.now() - i * 86400e3).toISOString()), { revenue: 0, orders: 0 });
  } else {
    const first = paid.length ? paid.map((o) => keyOf(o.decided_at || o.created_at)).sort()[0] : today.slice(0, 7);
    let [y, m] = first.split('-').map(Number);
    const [ty, tm] = today.slice(0, 7).split('-').map(Number);
    while (y < ty || (y === ty && m <= tm)) { buckets.set(`${y}-${String(m).padStart(2, '0')}`, { revenue: 0, orders: 0 }); m++; if (m > 12) { m = 1; y++; } }
  }
  for (const o of paidInPeriod) {
    const b = buckets.get(keyOf(o.decided_at || o.created_at));
    if (b) { b.revenue += Number(o.amount_rm); b.orders += 1; }
  }

  const active = licenses.filter((l) => l.status === 'active');
  return {
    period,
    unit: monthly ? 'month' : 'day',
    revenue,
    paid_orders: paidInPeriod.length,
    average_order: paidInPeriod.length ? revenue / paidInPeriod.length : 0,
    pending: orders.filter((o) => o.status === 'pending').length,
    rejected: orders.filter((o) => o.status === 'rejected' && inPeriod(o.decided_at || o.created_at)).length,
    free_licences: orders.filter((o) => o.status === 'approved' && Number(o.amount_rm) === 0 && inPeriod(o.decided_at || o.created_at)).length,
    buyers_all_time: new Set(paid.map((o) => o.email.toLowerCase())).size,
    revenue_all_time: paid.reduce((sum, o) => sum + Number(o.amount_rm), 0),
    active_licences: active.length,
    revoked_licences: licenses.filter((l) => l.status === 'revoked').length,
    computers: active.reduce((n, l) => n + (l.activations || []).length, 0),
    by_product: Object.fromEntries(Object.keys(S.PRODUCTS).map((p) => {
      const list = paidInPeriod.filter((o) => S.productOf(o) === p);
      return [p, { name: S.PRODUCTS[p].name, orders: list.length, revenue: list.reduce((sum, o) => sum + Number(o.amount_rm), 0) }];
    })),
    series: [...buckets].map(([date, v]) => ({ date, ...v })),
    recent: orders.slice(0, 6).map((o) => ({ id: o.id, order_no: o.order_no, name: o.name, status: o.status, product: S.productOf(o), amount_rm: Number(o.amount_rm), created_at: o.created_at })),
    to_review: orders.filter((o) => o.status === 'pending').slice(0, 5).map((o) => ({ id: o.id, order_no: o.order_no, name: o.name, status: o.status, product: S.productOf(o), amount_rm: Number(o.amount_rm), created_at: o.created_at })),
  };
}

// ---------- shop settings ----------
// "017-698 2032" or "+60 17 698 2032" -> "60176982032" (country code, digits only)
function whatsappNumber(v) {
  let d = String(v ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = `60${d.slice(1)}`;
  if (d.length < 9 || d.length > 15) throw S.httpError(400, 'Enter a WhatsApp number like 012 345 6789 or +60 12 345 6789.');
  return d;
}
const text = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
async function saveSettings(body, admin) {
  const money = (v, label) => {
    const n = Math.round(Number(v) * 100) / 100;
    if (!Number.isFinite(n) || n < 0 || n > 100000) throw S.httpError(400, `Enter a ${label} price between RM 0 and RM 100,000.`);
    return n;
  };
  const price = money(body.price_rm, 'Foxdusk AIOS');
  const priceHook = money(body.price_hookdusk_rm ?? 0, 'Hookdusk AIOS');
  const priceBundle = money(body.price_bundle_rm ?? 0, 'bundle');
  const row = {
    id: 1,
    sales_open: body.sales_open === true,
    stripe_enabled: body.stripe_enabled === true,
    price_rm: price,
    price_hookdusk_rm: priceHook,
    price_bundle_rm: priceBundle,
    bank_name: text(body.bank_name, 80),
    account_name: text(body.account_name, 120),
    account_no: text(body.account_no, 40),
    duitnow_qr: text(body.duitnow_qr, 300),
    whatsapp: whatsappNumber(body.whatsapp),
    contact_email: text(body.contact_email, 254).toLowerCase(),
    whatsapp_message: String(body.whatsapp_message ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, 300),
    updated_at: new Date().toISOString(),
    updated_by: admin,
  };
  if (row.sales_open && !(price > 0 || priceHook > 0 || priceBundle > 0)) throw S.httpError(400, 'Set at least one price above RM 0 before opening sales.');
  if (row.sales_open && (!row.bank_name || !row.account_name || !row.account_no)) throw S.httpError(400, 'Fill in the bank name, account name and account number before opening sales.');
  if (row.contact_email && !S.EMAIL_RE.test(row.contact_email)) throw S.httpError(400, 'Enter a valid contact email, or leave it empty.');
  if (row.stripe_enabled && !Stripe.ready()) throw S.httpError(400, 'Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in Vercel first, then switch on card payment.');
  if (row.duitnow_qr && !/^(https:\/\/[^\s"'<>]+|\/?[\w./-]+\.(png|jpe?g|webp|svg))$/i.test(row.duitnow_qr)) throw S.httpError(400, 'The DuitNow QR must be an uploaded image or an https:// link.');
  try {
    await S.db('settings?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: row });
  } catch {
    throw S.httpError(500, 'Could not save. Run the latest supabase/schema.sql in the Supabase SQL Editor, then try again.');
  }
  return { ...(await S.getSettings()), stripe_ready: Stripe.ready(), stripe_mode: Stripe.ready() ? Stripe.mode() : null };
}

module.exports = S.handler(async (req, res) => {
  const q = new URL(req.url, 'http://x').searchParams;

  if (req.method === 'GET' && q.get('action') === 'config') {
    return S.send(res, 200, { supabaseUrl: S.env('SUPABASE_URL'), anonKey: S.env('SUPABASE_ANON_KEY') });
  }

  const admin = await S.requireAdmin(req);

  if (req.method === 'GET') {
    const action = q.get('action');
    if (action === 'orders') {
      const status = q.get('status');
      const filter = ['pending', 'approved', 'rejected'].includes(status) ? `&status=eq.${status}` : '';
      const search = String(q.get('q') || '').trim().slice(0, 80).replace(/[,()*]/g, ' ');
      const or = search ? `&or=(name.ilike.*${encodeURIComponent(search)}*,email.ilike.*${encodeURIComponent(search)}*,order_no.ilike.*${encodeURIComponent(search)}*)` : '';
      const [orders, all] = await Promise.all([
        S.db(`orders?select=*,licenses(key,status,max_devices,products,activations(device_name,app_version,first_seen,last_seen))${filter}${or}&order=created_at.desc&limit=200`),
        S.db('orders?select=status&limit=10000'),
      ]);
      const counts = { pending: 0, approved: 0, rejected: 0 };
      for (const o of all) if (o.status in counts) counts[o.status] += 1;
      return S.send(res, 200, { orders, counts, admin });
    }
    if (action === 'stats') return S.send(res, 200, await stats(q.get('period')));
    if (action === 'settings') return S.send(res, 200, { ...(await S.getSettings()), stripe_ready: Stripe.ready(), stripe_mode: Stripe.ready() ? Stripe.mode() : null });
    if (action === 'receipt') {
      const o = await getOrder(q.get('id'));
      if (!o.receipt_path) throw S.httpError(404, 'This order has no receipt.');
      return S.send(res, 200, { url: await S.signedReceiptUrl(o.receipt_path) });
    }
    throw S.httpError(400, 'Unknown action.');
  }

  if (req.method !== 'POST') throw S.httpError(405, 'Method not allowed.');
  const body = await S.readBody(req);
  const now = new Date().toISOString();

  switch (body.action) {
    case 'upload_qr': {
      // DuitNow QR picture for the payment card. PNG, JPG or WEBP, up to 2 MB.
      const TYPES = { 'image/png': ['png', (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))], 'image/jpeg': ['jpg', (b) => b[0] === 0xff && b[1] === 0xd8], 'image/webp': ['webp', (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP'] };
      const t = TYPES[body.type];
      if (!t) throw S.httpError(400, 'Upload a PNG, JPG or WEBP image.');
      const buf = Buffer.from(String(body.data || ''), 'base64');
      if (!buf.length || buf.length > 2 * 1024 * 1024) throw S.httpError(400, 'The image must be smaller than 2 MB.');
      if (!t[1](buf)) throw S.httpError(400, 'That file is not a valid image.');
      const url = await S.uploadSiteImage(`duitnow-qr-${Date.now()}.${t[0]}`, buf, body.type);
      return S.send(res, 200, { ok: true, url });
    }
    case 'save_settings':
      return S.send(res, 200, { ok: true, settings: await saveSettings(body, admin) });
    case 'approve': {
      const o = await getOrder(body.id);
      if (o.status === 'rejected') throw S.httpError(409, 'This order was rejected. Create a free licence instead if you want to give access.');
      if (o.status === 'awaiting_payment' || o.status === 'expired') throw S.httpError(409, 'Stripe has not confirmed this card payment. The key is sent automatically when it does.');
      // Mark approved first, only if still pending, so two clicks cannot make two keys.
      if (o.status === 'pending') {
        const rows = await S.db(`orders?id=eq.${o.id}&status=eq.pending`, { method: 'PATCH', prefer: 'return=representation', body: { status: 'approved', decided_at: now, decided_by: admin } });
        if (!rows.length) throw S.httpError(409, 'This order was just updated. Refresh the list.');
      }
      const lic = await createLicense(o);
      try { await emailKey(o, lic); } catch (e) {
        return S.send(res, 200, { ok: true, key: lic.key, emailed: false, warning: 'Approved and key created, but the email failed. Click Resend email.' });
      }
      return S.send(res, 200, { ok: true, key: lic.key, emailed: true });
    }
    case 'reject': {
      const o = await getOrder(body.id);
      if (o.status !== 'pending') throw S.httpError(409, 'Only pending orders can be rejected.');
      const reason = String(body.reason || '').trim().slice(0, 500);
      await S.db(`orders?id=eq.${o.id}`, { method: 'PATCH', body: { status: 'rejected', decided_at: now, decided_by: admin, note: reason || null } });
      let emailed = false;
      if (body.notify !== false) { try { await S.sendEmail({ to: o.email, ...E.orderRejected(o, reason) }); emailed = true; } catch {} }
      return S.send(res, 200, { ok: true, emailed });
    }
    case 'resend': {
      const o = await getOrder(body.id);
      if (o.status !== 'approved') throw S.httpError(409, 'Approve the order first.');
      await emailKey(o, await createLicense(o));
      return S.send(res, 200, { ok: true, emailed: true });
    }
    case 'revoke':
    case 'restore': {
      const l = await getLicense(body.key);
      const revoke = body.action === 'revoke';
      await S.db(`licenses?key=eq.${encodeURIComponent(l.key)}`, { method: 'PATCH', body: { status: revoke ? 'revoked' : 'active', revoked_at: revoke ? now : null } });
      return S.send(res, 200, { ok: true });
    }
    case 'reset_devices': {
      const l = await getLicense(body.key);
      await S.db(`activations?license_key=eq.${encodeURIComponent(l.key)}`, { method: 'DELETE' });
      return S.send(res, 200, { ok: true });
    }
    case 'issue': {
      const name = String(body.name || '').trim().slice(0, 120);
      const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
      if (name.length < 2 || !S.EMAIL_RE.test(email)) throw S.httpError(400, 'Enter a name and a valid email.');
      const product = S.pickProduct(body.product);
      if (S.PRODUCTS[product].upgradeFrom) throw S.httpError(400, 'Choose Foxdusk AIOS, Hookdusk AIOS or the bundle.');
      const [o] = await S.db('orders', {
        method: 'POST', prefer: 'return=representation',
        body: { order_no: S.newOrderNo(), name, email, phone: null, product, amount_rm: 0, status: 'approved', decided_at: now, decided_by: admin, note: 'Free licence issued by admin' },
      });
      const lic = await createLicense(o);
      let emailed = false;
      if (body.notify) { try { await emailKey(o, lic); emailed = true; } catch {} }
      return S.send(res, 200, { ok: true, key: lic.key, emailed });
    }
    default:
      throw S.httpError(400, 'Unknown action.');
  }
});
