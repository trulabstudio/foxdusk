// Built by Foxdusk
// Foxdusk admin (Foxdusk AIOS and Hookdusk AIOS): dashboard, orders and shop settings. Sign-in is Supabase Auth.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rm = (n, dp = 2) => `RM ${Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const rmShort = (n) => (n >= 10000 ? `RM ${(n / 1000).toLocaleString('en-MY', { maximumFractionDigits: 1 })}K` : `RM ${Math.round(n).toLocaleString('en-MY')}`);
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '–');
const ago = (iso) => {
  if (!iso) return '–';
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24); return d < 30 ? `${d} d ago` : new Date(iso).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
};
const STATUS = { pending: 'To review', approved: 'Paid', rejected: 'Rejected', awaiting_payment: 'Awaiting card payment', expired: 'Card payment not completed' };
const PRODUCT = { foxdusk: 'Foxdusk AIOS', hookdusk: 'Hookdusk AIOS', bundle: 'Bundle: Foxdusk + Hookdusk', upgrade_hookdusk: 'Upgrade: add Hookdusk to a key', upgrade_foxdusk: 'Upgrade: add Foxdusk to a key' };
const PRODUCT_SHORT = { foxdusk: 'Foxdusk', hookdusk: 'Hookdusk', bundle: 'Bundle', upgrade_hookdusk: '+ Hookdusk', upgrade_foxdusk: '+ Foxdusk' };
const APP = { foxdusk: 'Foxdusk AIOS', hookdusk: 'Hookdusk AIOS' };
const productOf = (o) => (PRODUCT[o?.product] ? o.product : 'foxdusk');
const METHOD = { bank_transfer: 'Bank transfer', stripe: 'Card / FPX (Stripe)' };
const isTest = (o) => /^cs_test_/.test(String(o?.stripe_session_id || ''));
const pill = (status, label) => `<span class="pill ${esc(status)}">${esc(label || STATUS[status] || status)}</span>`;

let supabase;
const state = { period: '30d', tab: 'pending', q: '', orders: [], counts: {}, settings: null, stats: null };

// ---------- plumbing ----------
let toastTimer;
function toast(msg, err = false) {
  const t = $('#toast'); t.textContent = msg; t.className = `toast${err ? ' err' : ''}`; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, err ? 7000 : 3500);
}
async function token() { const { data } = await supabase.auth.getSession(); return data.session?.access_token; }
async function api(params, body) {
  const r = await fetch(`/api/admin${body ? '' : `?${new URLSearchParams(params)}`}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${await token()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) { await supabase.auth.signOut(); showLogin(); }
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}
function ask(title, text, okLabel, danger = false) {
  const dlg = $('#confirmDlg');
  $('#confirmTitle').textContent = title; $('#confirmText').textContent = text;
  const ok = $('#confirmOk'); ok.textContent = okLabel; ok.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
  dlg.returnValue = ''; dlg.showModal();
  return new Promise((resolve) => { dlg.onclose = () => resolve(dlg.returnValue === 'ok'); });
}
function dialogResult(id) {
  const dlg = $(id); dlg.returnValue = ''; dlg.showModal();
  return new Promise((resolve) => { dlg.onclose = () => resolve(dlg.returnValue === 'ok'); });
}
const view = () => $('#view');
async function refreshBadge() {
  const n = state.counts.pending ?? state.stats?.pending ?? 0;
  const b = $('#pendingBadge'); b.textContent = n; b.hidden = !n;
}

// ---------- router ----------
const ROUTES = { dashboard: renderDashboard, orders: renderOrders, settings: renderSettings };
async function route() {
  const name = (location.hash.slice(1) || 'dashboard').split('?')[0];
  const fn = ROUTES[name] || renderDashboard;
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === (ROUTES[name] ? name : 'dashboard')));
  try { await fn(); } catch (e) { view().innerHTML = `<div class="page"><p class="msg err">${esc(e.message)}</p></div>`; }
  view().focus({ preventScroll: true });
}

// ---------- dashboard ----------
const PERIOD_NAME = { '7d': 'last 7 days', '30d': 'last 30 days', '90d': 'last 90 days', all: 'all time' };
const periodSeg = (current) => `<div class="seg" role="group" aria-label="Period">${[['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['all', 'All time']].map(([k, l]) => `<button type="button" data-period="${k}" aria-pressed="${k === current}">${l}</button>`).join('')}</div>`;
const kpi = (label, value, note, extra = '') => `<div class="kpi${extra}"><span class="kpi-label">${label}</span><b class="kpi-value">${value}</b><span class="kpi-note">${note}</span></div>`;
const orderLine = (o) => `<li><button type="button" class="line" data-open="${esc(o.id)}"><span class="line-main"><b>${esc(o.name)}</b><small class="mono">${esc(o.order_no)} · ${esc(PRODUCT_SHORT[productOf(o)])} · ${esc(ago(o.created_at))}</small></span><span class="line-amount">${o.amount_rm ? esc(rm(o.amount_rm, 0)) : 'Free'}</span><span class="btn btn-primary btn-sm">Review</span></button></li>`;

async function renderDashboard() {
  view().innerHTML = '<div class="page"><p class="muted">Loading…</p></div>';
  const s = await api({ action: 'stats', period: state.period });
  state.stats = s; state.counts.pending = s.pending; refreshBadge();
  const p = PERIOD_NAME[s.period];
  view().innerHTML = `<div class="page">
    <header class="page-head">
      <div><span class="label">Overview</span><h1>Dashboard</h1><p class="lede">Sales, orders to review and licences at a glance.</p></div>
      ${periodSeg(s.period)}
    </header>

    <div class="grid-4">
      ${kpi('Revenue', esc(rm(s.revenue, 0)), `${p} · all time ${esc(rm(s.revenue_all_time, 0))}`)}
      ${kpi('Paid orders', s.paid_orders, `${p} · ${s.buyers_all_time} buyer${s.buyers_all_time === 1 ? '' : 's'} all time`)}
      ${kpi('To review', s.pending, s.pending ? '<button class="link-btn" type="button" data-go-pending>Review now →</button>' : 'All caught up', s.pending ? ' kpi-alert' : '')}
      ${kpi('Rejected', s.rejected, p)}
    </div>

    <div class="grid-main">
      <section class="card">
        <div class="card-head"><h2>Revenue per ${s.unit}</h2><button class="link-btn" type="button" id="tableToggle" aria-expanded="false">Show as table</button></div>
        <div class="chart" id="chart"></div>
        <table class="data-table" id="chartTable" hidden><thead><tr><th>${s.unit === 'month' ? 'Month' : 'Day'}</th><th class="n">Paid orders</th><th class="n">Revenue</th></tr></thead>
          <tbody>${s.series.slice().reverse().map((d) => `<tr><td>${esc(fmtBucket(d.date, s.unit, true))}</td><td class="n">${d.orders}</td><td class="n">${rm(d.revenue)}</td></tr>`).join('')}</tbody></table>
      </section>
      <section class="card">
        <div class="card-head"><h2>To review</h2><a class="link-btn" href="#orders">All orders</a></div>
        ${(s.to_review || []).length ? `<ul class="lines">${s.to_review.map(orderLine).join('')}</ul>` : '<div class="empty-small"><b>All caught up</b><span>New orders appear here.</span></div>'}
      </section>
    </div>

    <h2 class="section-title">Sales by product <span class="muted" style="font-weight:400;font-size:14px">${p}</span></h2>
    <div class="grid-3">
      ${Object.entries(s.by_product || {}).map(([k, v]) => kpi(esc(PRODUCT[k] || v.name), esc(rm(v.revenue, 0)), `${v.orders} paid order${v.orders === 1 ? '' : 's'}`)).join('')}
      ${kpi('All products', esc(rm(s.revenue, 0)), `${s.paid_orders} paid order${s.paid_orders === 1 ? '' : 's'}`, ' kpi-total')}
    </div>

    <h2 class="section-title">Licences</h2>
    <div class="grid-3">
      ${kpi('Active licences', s.active_licences, `${s.revoked_licences} cancelled`)}
      ${kpi('Computers activated', s.computers, 'on active licences')}
      ${kpi('Free licences', s.free_licences, `${p} · not counted as sales`)}
    </div>
  </div>`;
  view().querySelectorAll('[data-period]').forEach((b) => { b.onclick = () => { state.period = b.dataset.period; renderDashboard().catch((e) => toast(e.message, true)); }; });
  view().querySelector('[data-go-pending]')?.addEventListener('click', () => { state.tab = 'pending'; location.hash = '#orders'; });
  view().querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => openOrder(b.dataset.open); });
  $('#tableToggle').onclick = (e) => { const t = $('#chartTable'); t.hidden = !t.hidden; e.target.textContent = t.hidden ? 'Show as table' : 'Hide table'; e.target.setAttribute('aria-expanded', String(!t.hidden)); };
  drawChart($('#chart'), s.series, s.unit);
}

function fmtBucket(key, unit, long = false) {
  if (unit === 'month') { const [y, m] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-MY', { month: 'short', year: long ? 'numeric' : '2-digit', timeZone: 'UTC' }); }
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', ...(long ? { weekday: 'short' } : {}), timeZone: 'UTC' });
}
function niceMax(v) {
  if (v <= 0) return 1000;
  const p = 10 ** Math.floor(Math.log10(v)); const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

// One series, single hue: thin columns with a 4px rounded top, square at the baseline,
// hairline grid, a tooltip per column, and a table view for the exact numbers.
function drawChart(el, series, unit) {
  const total = series.reduce((s, d) => s + d.revenue, 0);
  if (!total) { el.innerHTML = `<div class="chart-empty">No paid orders in this period yet.<br>Revenue appears here once you confirm an order.</div>`; return; }
  const draw = () => {
    const W = el.clientWidth; const H = el.clientHeight;
    const pad = { l: 64, r: 8, t: 12, b: 28 };
    const iw = Math.max(10, W - pad.l - pad.r); const ih = H - pad.t - pad.b;
    const max = niceMax(Math.max(...series.map((d) => d.revenue)));
    const ticks = [0, max / 2, max];
    const band = iw / series.length; const bw = Math.max(2, Math.min(24, band - 2));
    const y = (v) => pad.t + ih - (v / max) * ih;
    const every = Math.max(1, Math.ceil(series.length / Math.max(2, Math.floor(iw / 64))));
    // Label evenly, always including the newest; never let two labels touch.
    const labelled = new Set();
    for (let i = 0; i < series.length; i += every) labelled.add(i);
    const last = series.length - 1; const prev = Math.max(...labelled);
    if (prev !== last) { if ((last - prev) * band < 56) labelled.delete(prev); labelled.add(last); }
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Revenue per ${unit}, ${esc(rm(total))} in total. Use Show as table for the exact numbers.">`;
    for (const t of ticks) svg += `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${pad.l - 10}" y="${y(t) + 4}" text-anchor="end">${esc(rmShort(t))}</text>`;
    series.forEach((d, i) => {
      const cx = pad.l + band * i + band / 2; const x = cx - bw / 2;
      svg += `<rect class="hover-band" data-band="${i}" x="${pad.l + band * i}" y="${pad.t}" width="${band}" height="${ih}" opacity="0"/>`;
      if (d.revenue > 0) {
        const top = y(d.revenue); const h = pad.t + ih - top; const r = Math.min(4, h, bw / 2);
        svg += `<path class="bar" data-bar="${i}" d="M${x},${pad.t + ih} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${pad.t + ih} Z"/>`;
      }
      if (labelled.has(i)) svg += `<text class="tick" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(fmtBucket(d.date, unit))}</text>`;
      svg += `<rect class="hit" data-hit="${i}" x="${pad.l + band * i}" y="${pad.t}" width="${band}" height="${ih + pad.b}"/>`;
    });
    el.innerHTML = `${svg}</svg><div class="tip" hidden></div>`;
    const tip = el.querySelector('.tip');
    el.querySelectorAll('[data-hit]').forEach((h) => {
      const i = Number(h.dataset.hit); const d = series[i];
      h.addEventListener('mouseenter', () => {
        el.querySelector(`[data-band="${i}"]`).setAttribute('opacity', '1');
        el.querySelector(`[data-bar="${i}"]`)?.classList.add('hover');
        tip.innerHTML = `<b>${esc(rm(d.revenue))}</b>${esc(fmtBucket(d.date, unit, true))} · ${d.orders} order${d.orders === 1 ? '' : 's'}`;
        tip.style.left = `${Math.min(Math.max(pad.l + band * i + band / 2, 90), W - 90)}px`;
        tip.style.top = `${d.revenue ? y(d.revenue) : pad.t + ih}px`;
        tip.hidden = false;
      });
      h.addEventListener('mouseleave', () => {
        el.querySelector(`[data-band="${i}"]`).setAttribute('opacity', '0');
        el.querySelector(`[data-bar="${i}"]`)?.classList.remove('hover');
        tip.hidden = true;
      });
    });
  };
  draw();
  new ResizeObserver(() => draw()).observe(el);
}

// ---------- orders ----------
async function loadOrders() {
  const params = { action: 'orders' };
  if (state.tab !== 'all') params.status = state.tab;
  if (state.q) params.q = state.q;
  const data = await api(params);
  state.orders = data.orders; state.counts = data.counts; refreshBadge();
}
async function renderOrders() {
  view().innerHTML = '<div class="page"><p class="muted">Loading…</p></div>';
  await loadOrders();
  view().innerHTML = `<div class="page">
    <header class="page-head">
      <div><span class="label">Orders</span><h1>Orders</h1><p class="lede">Check the payment in your bank, then confirm to send the key.</p></div>
      <button class="btn btn-ghost" type="button" id="issueOpen">Free licence</button>
    </header>
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Status">${[['pending', 'To review'], ['approved', 'Paid'], ['rejected', 'Rejected'], ['all', 'All']].map(([k, l]) => `<button type="button" data-tab="${k}" aria-pressed="${k === state.tab}">${l}${k !== 'all' ? `<span class="n">${state.counts[k] ?? 0}</span>` : ''}</button>`).join('')}</div>
      <input class="input search" id="search" type="search" placeholder="Search name, email or order no." value="${esc(state.q)}">
    </div>
    <div class="card list-card" id="orderTable"></div>
  </div>`;
  paintTable();
  view().querySelectorAll('[data-tab]').forEach((b) => { b.onclick = async () => { state.tab = b.dataset.tab; await renderOrders(); }; });
  let t; $('#search').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(async () => { state.q = e.target.value.trim(); await loadOrders(); paintTable(); }, 300); });
  $('#issueOpen').onclick = issueFlow;
}
function paintTable() {
  const box = $('#orderTable');
  if (!state.orders.length) {
    box.innerHTML = `<div class="empty-small"><b>${state.q ? 'No orders match your search' : state.tab === 'pending' ? 'All caught up' : 'No orders here yet'}</b><span>${state.tab === 'pending' && !state.q ? 'New orders appear here.' : ''}</span></div>`;
    return;
  }
  box.innerHTML = `<div class="orow orow-head" aria-hidden="true"><span>Buyer</span><span>Order</span><span class="r">Amount</span><span>Status</span><span></span></div>` + state.orders.map((o) => {
    const lic = (o.licenses || [])[0];
    const free = o.status === 'approved' && Number(o.amount_rm) === 0;
    const status = (free ? pill('free', 'Free licence') : lic && lic.status === 'revoked' ? pill('revoked', 'Key cancelled') : pill(o.status)) + (isTest(o) ? ` ${pill('test', 'Test')}` : '');
    return `<button class="orow" type="button" data-open="${esc(o.id)}">
      <span class="o-who"><b>${esc(o.name)}</b><small>${esc(o.email)}</small></span>
      <span class="o-meta"><b class="mono">${esc(o.order_no)}</b><small>${esc(PRODUCT_SHORT[productOf(o)])} · ${esc(when(o.created_at))}</small></span>
      <span class="o-amount r">${free ? 'Free' : esc(rm(o.amount_rm))}</span>
      <span class="o-status">${status}</span>
      <span class="o-act">${o.status === 'pending' ? '<span class="btn btn-primary btn-sm">Review</span>' : '<span class="chev" aria-hidden="true">›</span>'}</span>
    </button>`;
  }).join('');
  box.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => openOrder(b.dataset.open); });
}

// ---------- order details drawer ----------
async function findOrder(id) {
  let o = state.orders.find((x) => x.id === id);
  if (!o) {
    const data = await api({ action: 'orders' });
    o = data.orders.find((x) => x.id === id);
  }
  return o;
}
async function openOrder(id) {
  const o = await findOrder(id);
  if (!o) return toast('Order not found.', true);
  const lic = (o.licenses || [])[0];
  const devices = lic?.activations || [];
  const free = Number(o.amount_rm) === 0;
  const phoneDigits = String(o.phone || '').replace(/\D/g, '').replace(/^0/, '60');
  $('#drawer').innerHTML = `
    <header class="drawer-head"><div>${free ? pill('free', 'Free licence') : pill(o.status)}${isTest(o) ? ` ${pill('test', 'Test')}` : ''}<h2 id="drawerTitle">${esc(o.name)}</h2><small class="mono">${esc(o.order_no)}</small></div>
      <button class="close-btn" type="button" data-close-drawer aria-label="Close">×</button></header>
    <div class="drawer-body">
      <section><h3>Payment</h3><div class="box"><dl class="kv">
        <dt>Product</dt><dd><b>${esc(PRODUCT[productOf(o)])}</b></dd>
        ${o.upgrade_key ? `<dt>Adds to key</dt><dd><span class="mono">${esc(o.upgrade_key)}</span></dd>` : ''}
        <dt>Amount</dt><dd><b>${free ? 'Free (no payment)' : esc(rm(o.amount_rm))}</b></dd>
        ${free ? '' : `<dt>Paid by</dt><dd>${esc(METHOD[o.payment_method] || 'Bank transfer')}${o.stripe_payment_intent ? `<br><a class="mono" href="https://dashboard.stripe.com/payments/${esc(o.stripe_payment_intent)}" target="_blank" rel="noopener">${esc(o.stripe_payment_intent)} ↗</a>` : ''}</dd>`}
        <dt>Email</dt><dd><a href="mailto:${esc(o.email)}">${esc(o.email)}</a></dd>
        ${o.phone ? `<dt>WhatsApp</dt><dd><a href="https://wa.me/${esc(phoneDigits)}" target="_blank" rel="noopener">${esc(o.phone)}</a></dd>` : ''}
        <dt>Ordered</dt><dd>${esc(when(o.created_at))}</dd>
        ${o.decided_at ? `<dt>${o.status === 'rejected' ? 'Rejected' : 'Confirmed'}</dt><dd>${esc(when(o.decided_at))}${o.decided_by ? ` by ${esc(o.decided_by)}` : ''}</dd>` : ''}
        ${o.status === 'approved' ? `<dt>Key email</dt><dd>${o.email_sent_at ? esc(when(o.email_sent_at)) : '<b style="color:var(--deep)">Not sent yet</b>'}</dd>` : ''}
      </dl></div></section>
      ${lic ? `<section><h3>Licence</h3>
        <div class="key-row"><span class="mono">${esc(lic.key)}</span><button class="btn btn-sm" type="button" data-copy="${esc(lic.key)}">Copy</button></div>
        <div class="box" style="margin-top:12px"><dl class="kv"><dt>Status</dt><dd>${pill(lic.status, lic.status === 'active' ? 'Active' : 'Cancelled')}</dd><dt>Unlocks</dt><dd>${esc((lic.products?.length ? lic.products : ['foxdusk']).map((a) => APP[a] || a).join(', '))}</dd><dt>Computers</dt><dd>${devices.length} of ${lic.max_devices}</dd></dl>
          ${devices.length ? `<ul class="devices" style="margin-top:8px">${devices.map((d) => `<li><span>${esc(d.device_name || 'Computer')}<br><small>Last app version ${esc(d.app_version || '?')}</small></span><small>Last seen ${esc(ago(d.last_seen))}</small></li>`).join('')}</ul>` : '<p class="muted" style="margin-top:8px;font-size:14px">Not activated on any computer yet.</p>'}
        </div>
        <div class="actions-row">
          <button class="btn btn-ghost btn-sm" type="button" data-act="resend">Resend email</button>
          ${devices.length ? '<button class="btn btn-ghost btn-sm" type="button" data-act="reset_devices">Reset computers</button>' : ''}
          ${lic.status === 'active' ? '<button class="btn btn-danger btn-sm" type="button" data-act="revoke">Cancel key</button>' : '<button class="btn btn-ghost btn-sm" type="button" data-act="restore">Restore key</button>'}
        </div></section>` : ''}
      ${o.status === 'awaiting_payment' ? '<section><p class="note">The buyer was sent to Stripe to pay. When Stripe confirms the payment, this order is approved and the key is emailed automatically. If they leave without paying, it is marked as not completed after an hour.</p></section>' : ''}
      ${o.note ? `<section><h3>Note</h3><p class="note">${esc(o.note)}</p></section>` : ''}
      ${o.receipt_path ? `<section><h3>Receipt</h3><div class="receipt" id="receiptBox"><p class="muted">Loading receipt…</p></div><p style="margin-top:8px"><a class="link-btn" id="receiptLink" href="#" target="_blank" rel="noopener" hidden>Open full size ↗</a></p></section>` : ''}
      <section class="danger-zone"><h3>Test order?</h3><p class="muted">Delete it to keep your sales numbers clean. ${isTest(o) ? 'This was paid with Stripe test mode, so it is already left out of the dashboard.' : 'Only do this for your own test purchases.'}</p>
        <div class="actions-row"><button class="btn btn-danger btn-sm" type="button" data-act="delete_order">Delete order</button></div></section>

    </div>
    ${o.status === 'pending' ? `<footer class="drawer-foot"><button class="btn btn-danger" type="button" data-act="reject">Reject</button><button class="btn btn-primary" type="button" data-act="approve">Confirm &amp; send key</button></footer>` : ''}`;
  $('#drawerWrap').hidden = false;
  document.body.style.overflow = 'hidden';
  $('#drawer').querySelector('.close-btn').focus();
  $('#drawer').querySelectorAll('[data-copy]').forEach((b) => { b.onclick = async () => { await navigator.clipboard.writeText(b.dataset.copy).catch(() => {}); toast('Key copied.'); }; });
  $('#drawer').querySelectorAll('[data-act]').forEach((b) => { b.onclick = () => act(o, lic, b.dataset.act, b); });
  if (o.receipt_path) {
    api({ action: 'receipt', id: o.id }).then(({ url }) => {
      const box = $('#receiptBox'); if (!box) return;
      box.innerHTML = /\.pdf$/i.test(o.receipt_path) ? '<p class="muted">PDF receipt</p>' : `<img src="${esc(url)}" alt="Payment receipt from ${esc(o.name)}">`;
      const link = $('#receiptLink'); link.href = url; link.hidden = false;
    }).catch((e) => { const box = $('#receiptBox'); if (box) box.innerHTML = `<p class="msg err">${esc(e.message)}</p>`; });
  }
}
function closeDrawer() { $('#drawerWrap').hidden = true; document.body.style.overflow = ''; }

async function act(o, lic, action, btn) {
  const amount = rm(o.amount_rm);
  if (action === 'approve' && !(await ask(`Confirm ${amount} from ${o.name}?`, `${PRODUCT[productOf(o)]}. Check your bank account first. ${o.upgrade_key ? `The app is added to key ${o.upgrade_key} and the download links are emailed to ${o.email}.` : `A licence key and the download link will be emailed to ${o.email}.`}`, 'Confirm & send key'))) return;
  if (action === 'revoke' && !(await ask('Cancel this key?', 'The app stops working on its computers the next time it checks (within a day when online), and the download link stops working.', 'Cancel key', true))) return;
  if (action === 'delete_order') {
    const real = !isTest(o) && o.status === 'approved' && Number(o.amount_rm) > 0;
    const what = `Order ${o.order_no}${lic ? `, licence key ${lic.key} and its computers` : ''}${o.receipt_path ? ', and the receipt' : ''} will be removed for good.${o.upgrade_key && o.status === 'approved' ? ` The app it added is taken off key ${o.upgrade_key}.` : ''}`;
    const warn = real ? ' This looks like a real paid order: deleting does not refund the buyer, and their key stops working.' : '';
    if (!(await ask(`Delete order ${o.order_no}?`, `${what}${warn} This cannot be undone.`, 'Delete order', true))) return;
    btn.disabled = true;
    try {
      await api(null, { action, id: o.id, confirm: o.order_no });
      toast('Order deleted.');
      closeDrawer();
      if ($('#orderTable')) await renderOrders().catch(() => {});
      else if ($('#chart')) await renderDashboard().catch(() => {});
      else await loadOrders().catch(() => {});
    } catch (e) { toast(e.message, true); btn.disabled = false; }
    return;
  }
  if (action === 'reset_devices' && !(await ask('Reset computers?', 'Both computer slots are freed. The buyer can then activate on a new computer.', 'Reset computers'))) return;
  let extra = {};
  if (action === 'reject') {
    $('#reason').value = '';
    if (!(await dialogResult('#rejectDlg'))) return;
    extra = { reason: $('#reason').value, notify: $('#rejectNotify').checked };
  }
  btn.disabled = true;
  try {
    const r = await api(null, { action, id: o.id, key: lic?.key, ...extra });
    toast(r.warning || ({ approve: 'Confirmed. Key emailed to the buyer.', reject: 'Order rejected.', resend: 'Email sent again.', revoke: 'Key cancelled.', restore: 'Key restored.', reset_devices: 'Computers reset.' }[action] || 'Done.'), !!r.warning);
    if ($('#orderTable')) await renderOrders().catch(() => {});
    else if ($('#chart')) await renderDashboard().catch(() => {});
    else await loadOrders().catch(() => {});
    await openOrder(o.id);
  } catch (e) { toast(e.message, true); btn.disabled = false; }
}

async function issueFlow() {
  $('#iname').value = ''; $('#iemail').value = ''; $('#iproduct').value = 'foxdusk';
  if (!(await dialogResult('#issueDlg'))) return;
  try {
    const r = await api(null, { action: 'issue', name: $('#iname').value, email: $('#iemail').value, product: $('#iproduct').value, notify: $('#inotify').checked });
    await navigator.clipboard.writeText(r.key).catch(() => {});
    toast(`Licence created: ${r.key} (copied)${r.emailed ? ', emailed' : ''}.`);
    state.tab = 'approved'; await renderOrders();
  } catch (e) { toast(e.message, true); }
}

// ---------- settings ----------
const readAsDataUrl = (blob) => new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = fail; r.readAsDataURL(blob); });
// A big photo of a QR code is redrawn as a crisp PNG no wider than 1000 px.
async function shrinkQr(file) {
  if (file.size <= 1.5 * 1024 * 1024) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url; });
    const scale = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob(ok, 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

async function renderSettings() {
  view().innerHTML = '<div class="page"><p class="muted">Loading…</p></div>';
  const s = await api({ action: 'settings' });
  state.settings = s;
  view().innerHTML = `<div class="page">
    <header class="page-head"><div><span class="label">Settings</span><h1>Settings</h1><p class="lede">Changes show on foxdusk.com within a minute of saving.</p></div></header>
    ${s.source !== 'supabase' ? '<p class="msg info" style="margin:0 0 16px">These values come from aios.json because the settings table is missing. Run the latest <b>supabase/schema.sql</b> in the Supabase SQL Editor, then save here.</p>' : ''}
    <form id="settingsForm" novalidate>
      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h2>Sales</h2></div>
          <label class="switch"><span><b>Accept new orders</b><span>When off, the buy form shows "Sales open soon".</span></span><input type="checkbox" id="sOpen" ${s.sales_open ? 'checked' : ''}></label>
          ${[['sPrice', 'Foxdusk AIOS', s.price_rm], ['sPriceHook', 'Hookdusk AIOS', s.price_hookdusk_rm], ['sPriceBundle', 'Bundle (Foxdusk + Hookdusk)', s.price_bundle_rm]].map(([id, label, v]) => `<div class="field"><label for="${id}">${label}</label><div class="input-prefix"><span>RM</span><input class="input" id="${id}" type="number" inputmode="decimal" min="0" max="100000" step="1" value="${esc(v ?? 0)}"></div></div>`).join('')}
          <span class="hint">One licence for 2 computers. RM 0 hides that product from the buy form. Orders already placed keep their price.</span>
          <p class="buyer-sees" id="buyerSees"></p>
        </section>

        <section class="card">
          <div class="card-head"><h2>Card and FPX (Stripe)</h2>${s.stripe_ready ? `<span class="pill ${s.stripe_mode === 'live' ? 'active' : 'pending'}">${s.stripe_mode === 'live' ? 'Live keys' : 'Test keys'}</span>` : '<span class="pill">Not set up</span>'}</div>
          <label class="switch${s.stripe_ready ? '' : ' off'}"><span><b>Accept card and FPX</b><span>${s.stripe_ready ? 'The key is emailed automatically once Stripe confirms the payment.' : 'Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in Vercel first (SETUP-AIOS.md, step 4c).'}</span></span><input type="checkbox" id="sStripe" ${s.stripe_enabled ? 'checked' : ''} ${s.stripe_ready ? '' : 'disabled'}></label>
          <p class="hint" style="margin-top:12px">Bank transfer stays available either way.</p>
        </section>

        <section class="card">
          <div class="card-head"><h2>Bank transfer</h2></div>
          <div class="field"><label for="sBank">Bank</label><input class="input" id="sBank" maxlength="80" value="${esc(s.bank_name)}" placeholder="Maybank"></div>
          <div class="field"><label for="sName">Account name</label><input class="input" id="sName" maxlength="120" value="${esc(s.account_name)}"></div>
          <div class="field"><label for="sNo">Account number</label><input class="input" id="sNo" maxlength="40" inputmode="numeric" value="${esc(s.account_no)}"></div>
          <div class="field"><span class="field-label">DuitNow QR <span class="muted">(optional)</span></span>
            <div class="qr-box">
              <div class="qr-thumb" id="qrThumb"></div>
              <div class="qr-actions">
                <label class="btn btn-ghost btn-sm" for="qrFile">Upload image</label>
                <input type="file" id="qrFile" accept="image/png,image/jpeg,image/webp" hidden>
                <button class="link-btn" type="button" id="qrRemove">Remove</button>
                <span class="hint">PNG, JPG or WEBP. Shown under the account number.</span>
              </div>
            </div>
            <input type="hidden" id="sQr" value="${esc(s.duitnow_qr)}">
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Contact</h2></div>
          <div class="field"><label for="sWa">WhatsApp number</label><input class="input" id="sWa" type="tel" inputmode="tel" maxlength="20" value="${esc(s.whatsapp || '')}" placeholder="012 345 6789"><span class="hint">Every WhatsApp button on the website. Leave empty to show email instead.</span></div>
          <div class="field"><label for="sWaMsg">WhatsApp opening message</label><textarea class="input textarea" id="sWaMsg" maxlength="300" rows="2">${esc(s.whatsapp_message || '')}</textarea><span class="hint">Already typed for the buyer. <a class="link-btn" id="waTry" href="#" target="_blank" rel="noopener">Try it ↗</a></span></div>
          <div class="field"><label for="sMail">Contact email</label><input class="input" id="sMail" type="email" maxlength="254" value="${esc(s.contact_email || '')}" placeholder="admin@foxdusk.com"></div>
        </section>
      </div>

      <div class="save-bar">
        <span id="saveState">${s.updated_at ? `Last saved ${esc(when(s.updated_at))}${s.updated_by ? ` by ${esc(s.updated_by)}` : ''}` : 'Not saved yet'}</span>
        <button class="btn btn-primary" type="submit" id="sSave">Save changes</button>
      </div>
    </form>
  </div>`;

  const form = $('#settingsForm');
  const showQr = () => {
    const url = $('#sQr').value;
    $('#qrThumb').innerHTML = url ? `<img src="${esc(url)}" alt="DuitNow QR">` : '<span>No QR</span>';
    $('#qrRemove').hidden = !url;
  };
  const refresh = () => {
    const open = $('#sOpen').checked;
    const list = [['Foxdusk', '#sPrice'], ['Hookdusk', '#sPriceHook'], ['Bundle', '#sPriceBundle']].filter(([, id]) => Number($(id).value) > 0).map(([n, id]) => `${n} ${rm(Number($(id).value), 0)}`);
    $('#buyerSees').innerHTML = `Buyers see <b>${open && list.length ? esc(list.join(' · ')) : 'Sales open soon'}</b>${$('#sStripe').checked ? ' · card / FPX on' : ''}`;
    let wa = $('#sWa').value.replace(/\D/g, ''); if (wa.startsWith('0')) wa = `60${wa.slice(1)}`;
    $('#waTry').href = wa ? `https://wa.me/${wa}?text=${encodeURIComponent($('#sWaMsg').value)}` : '#';
    $('#waTry').hidden = !wa;
  };
  let dirty = false;
  const markDirty = () => { if (!dirty) { dirty = true; $('#saveState').textContent = 'Unsaved changes'; $('#saveState').classList.add('dirty'); } refresh(); };
  form.addEventListener('input', markDirty);
  showQr(); refresh();

  $('#qrFile').addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return toast('Choose a PNG, JPG or WEBP image.', true);
    $('#qrThumb').innerHTML = '<span>Uploading…</span>';
    try {
      const blob = await shrinkQr(file);
      const data = String(await readAsDataUrl(blob)).split(',')[1];
      const r = await api(null, { action: 'upload_qr', type: blob.type || file.type, data });
      $('#sQr').value = r.url; showQr(); markDirty();
      toast('QR uploaded. Click Save changes to show it on the website.');
    } catch (err) { showQr(); toast(err.message, true); }
  });
  $('#qrRemove').onclick = () => { $('#sQr').value = ''; showQr(); markDirty(); };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const price = Number($('#sPrice').value); const priceHook = Number($('#sPriceHook').value); const priceBundle = Number($('#sPriceBundle').value);
    const changed = [['Foxdusk AIOS', state.settings.price_rm, price], ['Hookdusk AIOS', state.settings.price_hookdusk_rm, priceHook], ['Bundle', state.settings.price_bundle_rm, priceBundle]].filter(([, a, b]) => Number(a) !== b);
    if (changed.length && !(await ask('Change the prices?', `${changed.map(([n, , b]) => `${n}: ${rm(b)}`).join(', ')}. foxdusk.com shows the new prices within a minute. Orders already placed keep their price.`, 'Change price'))) return;
    const btn = $('#sSave'); btn.disabled = true;
    try {
      const r = await api(null, { action: 'save_settings', sales_open: $('#sOpen').checked, stripe_enabled: $('#sStripe').checked, price_rm: price, price_hookdusk_rm: priceHook, price_bundle_rm: priceBundle, bank_name: $('#sBank').value, account_name: $('#sName').value, account_no: $('#sNo').value, duitnow_qr: $('#sQr').value, whatsapp: $('#sWa').value, contact_email: $('#sMail').value, whatsapp_message: $('#sWaMsg').value });
      state.settings = r.settings;
      toast('Saved. foxdusk.com shows these details within a minute.');
      await renderSettings();
    } catch (err) { toast(err.message, true); btn.disabled = false; }
  });
}

// ---------- start ----------
function showLogin() { $('#app').hidden = true; $('#login').hidden = false; $('#lemail').focus(); }
async function enter() {
  $('#login').hidden = true; $('#app').hidden = false;
  const { data } = await supabase.auth.getSession();
  $('#who').textContent = data.session?.user?.email || '';
  await route();
}
async function start() {
  const cfg = await fetch('/api/admin?action=config', { cache: 'no-store' })
    .then((r) => r.json())
    .catch(() => ({ error: 'Cannot reach the admin API. Check that the site is deployed on Vercel and its environment variables are set (see SETUP-AIOS.md).' }));
  if (!cfg.supabaseUrl) throw new Error(cfg.error || 'Admin is not set up yet.');
  supabase = createClient(cfg.supabaseUrl, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });

  $('#lshow').onclick = (e) => { const i = $('#lpass'); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; e.currentTarget.textContent = show ? 'Hide' : 'Show'; e.currentTarget.setAttribute('aria-pressed', String(show)); e.currentTarget.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); };
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#lerr').hidden = true; $('#lbtn').disabled = true; $('#lbtn').textContent = 'Signing in…';
    const { error } = await supabase.auth.signInWithPassword({ email: $('#lemail').value.trim(), password: $('#lpass').value });
    $('#lbtn').disabled = false; $('#lbtn').textContent = 'Sign in';
    if (error) { $('#lerr').textContent = error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message; $('#lerr').hidden = false; return; }
    $('#lpass').value = '';
    enter();
  });
  $('#logout').onclick = async () => { await supabase.auth.signOut(); showLogin(); };
  document.addEventListener('click', (e) => { if (e.target.closest('[data-close-drawer]')) closeDrawer(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#drawerWrap').hidden && !document.querySelector('dialog[open]')) closeDrawer(); });
  addEventListener('hashchange', () => { closeDrawer(); route(); });

  if (await token()) enter(); else showLogin();
}

start().catch((e) => { document.body.innerHTML = `<main class="signin"><p class="msg err">${esc(e.message)}</p></main>`; });
