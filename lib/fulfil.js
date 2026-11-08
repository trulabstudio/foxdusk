// Built by Foxdusk
// Making and sending a licence: used by the admin "Confirm & send key" button
// and by Stripe when a card or FPX payment succeeds.
'use strict';

const S = require('./shared');
const E = require('./emails');

// Before taking an upgrade order: the key must be active, belong to this email,
// and not have the app yet. Returns the key in its normal form.
async function checkUpgrade(product, rawKey, email) {
  const app = S.PRODUCTS[product].apps[0];
  const key = S.normalizeKey(rawKey);
  if (!/^FXD(-[A-Z2-9]{5}){4}$/.test(key)) throw S.httpError(400, 'Enter your licence key. It looks like FXD-XXXXX-XXXXX-XXXXX-XXXXX.');
  const [lic] = await S.db(`licenses?key=eq.${encodeURIComponent(key)}&select=key,email,status,products`);
  // Same answer for a wrong key and a wrong email, so nobody can probe keys.
  if (!lic || String(lic.email).toLowerCase() !== email) throw S.httpError(400, 'We could not find that licence key with this email. Use the email you bought with, or contact admin@foxdusk.com.');
  if (lic.status !== 'active') throw S.httpError(400, 'This licence has been cancelled. Contact admin@foxdusk.com.');
  if (S.appsOf(lic).includes(app)) throw S.httpError(400, `This key already unlocks ${S.APPS[app].name}. Open ${S.APPS[app].studio} and paste the same key.`);
  return key;
}

async function createLicense(order) {
  // An upgrade adds the app to the buyer's existing key instead of making a new one.
  const product = S.PRODUCTS[S.productOf(order)];
  if (product.upgradeFrom) {
    const key = encodeURIComponent(S.normalizeKey(order.upgrade_key));
    const [lic] = await S.db(`licenses?key=eq.${key}&select=*`);
    if (!lic) throw S.httpError(404, 'The licence this order upgrades was not found.');
    const products = [...new Set([...S.appsOf(lic), ...product.apps])];
    const body = { products };
    if (!lic.download_token) body.download_token = S.newDownloadToken();
    const [up] = await S.db(`licenses?key=eq.${key}`, { method: 'PATCH', prefer: 'return=representation', body });
    return up;
  }
  const [existing] = await S.db(`licenses?order_id=eq.${order.id}&select=*`);
  if (existing) {
    if (existing.download_token) return existing;
    // Licences made before downloads moved to Supabase get their link now.
    const [withToken] = await S.db(`licenses?key=eq.${encodeURIComponent(existing.key)}`, { method: 'PATCH', prefer: 'return=representation', body: { download_token: S.newDownloadToken() } });
    return withToken;
  }
  const [lic] = await S.db('licenses', {
    method: 'POST', prefer: 'return=representation',
    body: { key: S.newLicenseKey(), order_id: order.id, name: order.name, email: order.email, max_devices: Number(S.config.max_devices) || 2, download_token: S.newDownloadToken(), products: S.PRODUCTS[S.productOf(order)].apps },
  });
  return lic;
}

// Single-app keys get an offer to add the other app at the upgrade price.
async function upgradeOffer(lic) {
  const apps = S.appsOf(lic);
  if (apps.length !== 1 || !['foxdusk', 'hookdusk'].includes(apps[0])) return null;
  const missing = apps[0] === 'foxdusk' ? 'hookdusk' : 'foxdusk';
  const settings = await S.getSettings();
  const price = S.priceOf(settings, S.upgradeFor(missing));
  return settings.sales_open && price > 0 ? { app: missing, product: S.upgradeFor(missing), price } : null;
}

async function emailKey(order, lic) {
  const offer = await upgradeOffer(lic).catch(() => null);
  await S.sendEmail({ to: order.email, ...E.orderApproved(order, lic, offer) });
  await S.db(`orders?id=eq.${order.id}`, { method: 'PATCH', body: { email_sent_at: new Date().toISOString() } });
}

module.exports = { createLicense, emailKey, checkUpgrade };
