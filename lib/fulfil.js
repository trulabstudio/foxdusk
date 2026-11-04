// Built by Foxdusk
// Making and sending a licence: used by the admin "Confirm & send key" button
// and by Stripe when a card or FPX payment succeeds.
'use strict';

const S = require('./shared');
const E = require('./emails');

async function createLicense(order) {
  const [existing] = await S.db(`licenses?order_id=eq.${order.id}&select=*`);
  if (existing) {
    if (existing.download_token) return existing;
    // Licences made before downloads moved to Supabase get their link now.
    const [withToken] = await S.db(`licenses?key=eq.${encodeURIComponent(existing.key)}`, { method: 'PATCH', prefer: 'return=representation', body: { download_token: S.newDownloadToken() } });
    return withToken;
  }
  const [lic] = await S.db('licenses', {
    method: 'POST', prefer: 'return=representation',
    body: { key: S.newLicenseKey(), order_id: order.id, name: order.name, email: order.email, max_devices: Number(S.config.max_devices) || 2, download_token: S.newDownloadToken() },
  });
  return lic;
}

async function emailKey(order, lic) {
  await S.sendEmail({ to: order.email, ...E.orderApproved(order, lic) });
  await S.db(`orders?id=eq.${order.id}`, { method: 'PATCH', body: { email_sent_at: new Date().toISOString() } });
}

module.exports = { createLicense, emailKey };
